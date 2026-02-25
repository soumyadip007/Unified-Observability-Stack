# Proposed Revamp Plan: Simplified Observability Architecture

This document proposes simpler, industry-standard alternatives to the current dual-pipeline setup. Use it to decide which direction to take.

---

## 1. Current State: Why It Feels Complicated

Today you have **two parallel ways** metrics get into Prometheus:

| Path | App side | Prometheus side | Result |
|------|----------|-----------------|--------|
| **A** | prom-client → expose `/metrics` | Scrapes app every 5s | Metrics: `http_requests_total`, `http_request_duration_seconds`, `active_connections` |
| **B** | OTel SDK → push to collector | Scrapes collector :8889 every 15s | Metrics: `http_server_duration_milliseconds_*` + traces |

**Complexity:**
- Two libraries in the app (prom-client + OTel)
- Two scrape jobs in Prometheus (app + collector)
- Two naming/label schemes (`route` vs `http_route`)
- Dashboards use path A; OTel gives path B — so you maintain both to get “full” observability

**Industry standard** is usually: **one primary pipeline** for metrics (and optionally one for traces), with a clear ownership model.

---

## 2. Industry-Standard Approaches (Overview)

| Approach | Who owns metrics? | Traces? | Used by |
|----------|-------------------|--------|---------|
| **OTel-first (single pipeline)** | App → OTel only; Prometheus scrapes only collector | Yes (same pipeline) | CNCF, cloud-native, many SaaS |
| **Prometheus-first (classic)** | App exposes `/metrics` only; Prometheus scrapes app | Optional (OTel for traces only, or none) | Traditional Prometheus shops |
| **Prometheus + OTel traces only** | prom-client for metrics; OTel for traces only | Yes | Hybrid, minimal change |

---

## 3. Option A: OTel-First (Single Pipeline) — Recommended for “Simplified”

**Idea:** One pipeline. App sends **all** telemetry (metrics + traces) to the OTel Collector. Prometheus **only** scrapes the collector. No prom-client, no app `/metrics` for Prometheus.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Node.js Application                           │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  OpenTelemetry SDK only                                      │ │
│  │  • Traces (OTLPTraceExporter)                                │ │
│  │  • Metrics (OTLPMetricExporter + auto-instrumentation)        │ │
│  │  • Optional: custom metrics via OTel API (no prom-client)    │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                              │                                    │
│                              │ PUSH (OTLP gRPC)                   │
└──────────────────────────────┼────────────────────────────────────┘
                               ▼
                    ┌──────────────────┐
                    │  OTel Collector   │
                    │  • Receives OTLP  │
                    │  • Exports :8889   │
                    └────────┬──────────┘
                             │
                             │ Prometheus scrapes (PULL)
                             ▼
                    ┌──────────────────┐      ┌──────────┐
                    │   Prometheus     │─────▶│ Grafana  │
                    └──────────────────┘      └──────────┘
```

### Data flow

- **App → Collector:** Push (OTLP) — metrics + traces.
- **Prometheus → Collector:** Pull — scrape `:8889/metrics` only (no scrape to app).
- **Grafana:** Queries Prometheus only.

### What you’d change

| Item | Current | After revamp |
|------|---------|--------------|
| App dependencies | prom-client + OTel | OTel only |
| App code | `/metrics` route + prom-client metrics + OTel | Remove prom-client and `/metrics`; keep/expand OTel (custom metrics via OTel API if needed) |
| Prometheus scrape | app:3001 + otel:8889 (+ 8888) | otel:8889 (+ 8888) only |
| Grafana dashboard | Uses `http_requests_total`, `route`, etc. | Switch to OTel metrics: `http_server_duration_milliseconds_*`, `http_route`, etc. |
| Custom metrics (e.g. active_connections) | prom-client gauge | Implement with OTel Metrics API and export via same OTLP pipeline |

### Pros

- Single pipeline: one way for metrics (and traces) to reach Prometheus.
- Aligns with CNCF/OpenTelemetry direction; one SDK, one protocol.
- No duplicate metric names/labels; one story for dashboards and alerts.
- Collector can add sampling, filtering, or multi-backend export later without touching the app.

### Cons

- Dashboard and alert PromQL must be rewritten to OTel metric names/labels.
- Custom metrics (e.g. `active_connections`) must be reimplemented with OTel API.
- If the collector is down, no metrics until it’s back (no direct app scrape fallback).

### Effort (rough)

- Medium: remove prom-client, add OTel custom metrics, change Prometheus config, rewrite Grafana panels and alerts.

---

## 4. Option B: Prometheus-First (Classic) — Simplest for “Just Metrics”

**Idea:** App is a “classic” Prometheus target only. One scrape target. OTel only if you want traces (separate pipeline).

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Node.js Application                           │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  prom-client only                                            │ │
│  │  • /metrics endpoint                                         │ │
│  │  • http_requests_total, http_request_duration_seconds,       │ │
│  │    active_connections                                        │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  OTel SDK (optional)                                         │ │
│  │  • Traces only (no OTel metrics export)                      │ │
│  │  • Push to collector for tracing only                        │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────┬────────────────────────────────────┘
                                │
        PULL /metrics           │ PUSH traces (if OTel enabled)
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       │
┌───────────────┐       ┌──────────────────┐            │
│  Prometheus   │       │  OTel Collector   │◀───────────┘
│  scrapes app │       │  (traces only)    │
│  :3001       │       │  → debug/backend  │
└───────┬──────┘       └──────────────────┘
        │
        ▼
┌───────────────┐
│   Grafana     │
└───────────────┘
```

### Data flow

- **Metrics:** App exposes `/metrics` → Prometheus scrapes app only (one scrape job for app metrics).
- **Traces (optional):** App pushes traces to OTel Collector; collector does **not** need to export metrics to Prometheus. Prometheus does **not** scrape the collector for app metrics.
- **Grafana:** Uses only Prometheus; dashboard stays as today (same PromQL).

### What you’d change

| Item | Current | After revamp |
|------|---------|--------------|
| App | prom-client + OTel (traces + metrics) | prom-client + OTel **traces only** (remove OTel metric exporter) |
| Prometheus scrape | app + otel:8889 + otel:8888 | app only (optional: keep otel:8888 for collector health only) |
| OTel collector | Exports metrics to :8889 | No need to export app metrics to Prometheus (traces only, or drop collector if no traces) |
| Grafana | No change | No change |

### Pros

- Single source of truth for **metrics**: one library (prom-client), one endpoint (`/metrics`), one scrape.
- No duplicate metrics; dashboard and alerts stay as they are.
- Familiar Prometheus model; easy to explain and operate.
- Optional traces via OTel without complicating the metric path.

### Cons

- Traces (if you keep them) are a separate pipeline; no “single SDK for everything.”
- If you later want to go full OTel, you’ll do a second migration.

### Effort (rough)

- Low: remove OTel metric exporter and PeriodicExportingMetricReader; simplify Prometheus config (stop scraping otel:8889 for app metrics).

---

## 5. Option C: Keep Both Pipelines but Document as “Dual Pipeline”

**Idea:** Don’t change the app or Prometheus. Treat the current setup as an intentional **dual pipeline** and document it clearly: one for “classic” Prometheus metrics (dashboards/alerts), one for OTel (traces + standardized metrics). Simplify only the **explanation** and **runbooks**.

### Architecture

- Same as today (see existing ARCHITECTURE_AND_DATA_FLOW.md).
- Add a single diagram and one-page “operating model” that states:
  - “Metrics for dashboards come from app scrape.”
  - “Traces and OTel metrics come from collector scrape.”
  - When to use which in Grafana (which panels/queries use which source).

### What you’d change

- Documentation only: one “simplified” architecture doc and a short “which metric from where” guide.
- No code or config changes.

### Pros

- No implementation work; no risk.
- Clear mental model for the team.

### Cons

- Still two pipelines and two naming schemes; complexity remains in the system itself.

### Effort (rough)

- Low: docs only.

---

## 6. Comparison and Recommendation

| Criteria | Option A (OTel-first) | Option B (Prometheus-first) | Option C (Document only) |
|----------|------------------------|------------------------------|---------------------------|
| **Simplicity of model** | High (one pipeline) | High (one metric pipeline) | Low (unchanged) |
| **Industry alignment** | High (OTel/CNCF) | Medium (classic Prometheus) | N/A |
| **Dashboard changes** | Yes (rewrite to OTel) | No | No |
| **Implementation effort** | Medium | Low | None |
| **Traces** | Yes, same pipeline | Optional (traces only) | Yes, as today |
| **Custom metrics** | Via OTel API | prom-client (unchanged) | Both (unchanged) |
| **Fallback if collector down** | No app metrics | N/A (no collector for metrics) | Yes (app scrape) |

**Recommendation:**

- **If the goal is “simplified architecture” and you’re okay updating dashboards:** Prefer **Option A (OTel-first)** — one pipeline, one SDK, industry-standard.
- **If the goal is “least change and keep current dashboards”:** Prefer **Option B (Prometheus-first)** — drop OTel metrics, keep only `/metrics` + optional traces.
- **If the goal is “no code/config change, just clarity”:** Use **Option C** — document the current dual pipeline and how to use it.

---

## 7. Plan Summary (What to Do Next)

1. **Choose** one of A, B, or C based on your priority (simplify vs minimize change vs docs-only).
2. **If A:**  
   - Remove prom-client and `/metrics` from the app.  
   - Add OTel custom metrics for anything you still need (e.g. active_connections).  
   - Prometheus: scrape only otel-collector:8889 (and 8888 if desired).  
   - Grafana: new panels/alerts using OTel metric names and labels.
3. **If B:**  
   - Remove OTel metric exporter (and PeriodicExportingMetricReader) from the app; keep traces only if you want.  
   - Prometheus: scrape only the app for app metrics; optionally keep collector scrape for collector telemetry only.  
   - Grafana: no change.
4. **If C:**  
   - Update docs only (e.g. add a one-page “Operating model” and “Which metric from where” to the repo).

Once you decide A, B, or C, the next step is a concrete task list (file-by-file changes) for that option.

**For Option A:** See **[OptionA-ImplementationPlan.md](OptionA-ImplementationPlan.md)** for the full implementation plan (what to remove, what to change, phase-by-phase with checklists).
