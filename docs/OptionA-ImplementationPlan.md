# Option A Implementation Plan: OTel-First (Single Pipeline)

This document is the step-by-step plan to revamp the stack to **Option A**: one pipeline only (App → OTel → Prometheus → Grafana). Remove prom-client and app scrape; use only OTel for metrics and traces. **Grafana:** update the existing Service Overview dashboard to OTel metrics and add multiple dashboard types (Request/HTTP, Latency/SLO, Errors, OTel & Collector, optional Traces) for this service.

---

## Target Architecture (After Implementation)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Node.js Application                           │
│  • OpenTelemetry SDK only (traces + metrics)                     │
│  • No prom-client, no /metrics endpoint                          │
│  • Optional: custom metrics via OTel API (e.g. active_connections)│
└──────────────────────────────┬──────────────────────────────────┘
                               │ PUSH (OTLP gRPC :4317)
                               ▼
                    ┌──────────────────┐
                    │  OTel Collector   │  :4317, :4318, :8889, :8888
                    └────────┬──────────┘
                             │
                             │ Prometheus scrapes :8889 (and :8888)
                             ▼
                    ┌──────────────────┐      ┌──────────┐
                    │   Prometheus     │─────▶│ Grafana  │
                    └──────────────────┘      └──────────┘
```

---

## Phase 1: Application — Remove prom-client and /metrics

### 1.1 Files to modify

- `app/package.json`
- `app/index.js`

### 1.2 Remove (app)

| Item | Location | Action |
|------|----------|--------|
| `prom-client` dependency | `app/package.json` | Remove from `dependencies` |
| `const client = require('prom-client')` | `app/index.js` | Delete |
| `const register = new client.Registry()` | `app/index.js` | Delete |
| `client.collectDefaultMetrics({ register })` | `app/index.js` | Delete |
| `httpRequestDuration` (Histogram) | `app/index.js` | Delete |
| `httpRequestsTotal` (Counter) | `app/index.js` | Delete |
| `activeConnections` (Gauge) | `app/index.js` | Delete |
| `connectionCount` and middleware that updates it | `app/index.js` | Delete (middleware that calls `httpRequestDuration.observe`, `httpRequestsTotal.inc`, `activeConnections.set`) |
| `GET /metrics` route | `app/index.js` | Delete |
| Any `register.` usage | `app/index.js` | Delete |

### 1.3 Keep (app)

- OTel SDK init (NodeSDK, OTLPTraceExporter, OTLPMetricExporter, PeriodicExportingMetricReader, getNodeAutoInstrumentations).
- All API routes: `/health`, `/api/orders`, `/api/users`, `/api/slow`.
- Express app and PORT.
- Graceful shutdown (sdk.shutdown).

### 1.4 Optional (app) — custom metric “active_connections”

- If you want to keep an “Active Connections” panel: add a custom metric via `@opentelemetry/api` (MeterProvider, Meter, ObservableGauge) and report `connectionCount` there. Export via the same OTLP pipeline.
- Plan can be implemented **without** this first; the dashboard can drop the Active Connections panel or add it in a follow-up.

### 1.5 Checklist Phase 1

- [ ] Remove `prom-client` from `app/package.json`.
- [ ] Remove all prom-client code and `/metrics` route from `app/index.js`.
- [ ] Remove middleware that updates prom-client metrics (keep middleware only if needed for other logic; else remove).
- [ ] Run `npm install` in `app/` and verify app starts (OTel only).
- [ ] Confirm app no longer exposes `/metrics`.

---

## Phase 2: Prometheus — Scrape only OTel Collector

### 2.1 Files to modify

- `prometheus/prometheus-dev.yml`
- `prometheus/prometheus.yml`

### 2.2 Remove (Prometheus config)

| Item | File | Action |
|------|------|--------|
| Job `demo-app` (scrape app) | `prometheus-dev.yml` | Remove entire job block |
| Job `demo-app` (scrape app) | `prometheus.yml` | Remove entire job block |

### 2.3 Keep (Prometheus config)

- Job `otel-collector`: targets `otel-collector:8889` (and `otel-collector:8888` if present).
- Job `prometheus` (self-scrape).
- All other settings (scrape_interval, evaluation_interval, etc.).

### 2.4 Checklist Phase 2

- [ ] Remove `job_name: 'demo-app'` and its `static_configs` from `prometheus-dev.yml`.
- [ ] Remove `job_name: 'demo-app'` and its `static_configs` from `prometheus.yml`.
- [ ] Confirm no references to `app:3000` or `host.docker.internal:3001` in scrape configs.

---

## Phase 3: Grafana — Dashboard panels use OTel metrics only

### 3.1 File to modify

- `grafana/dashboards/service-overview.json`

### 3.2 Metric mapping (old → new)

| Current (prom-client) | After (OTel) |
|------------------------|--------------|
| `http_requests_total` | `http_server_duration_milliseconds_count` (use count as request count) |
| `route` | `http_route` |
| `status` | `http_status_code` |
| `http_request_duration_seconds_bucket` | `http_server_duration_milliseconds_bucket` (unit: ms) |
| `active_connections` | Not available from auto-instrumentation; remove panel or add custom OTel metric later |

### 3.3 Panel changes

| Panel | Current PromQL | New PromQL (OTel) |
|-------|----------------|-------------------|
| Request Rate by Route | `rate(http_requests_total[1m])` | `rate(http_server_duration_milliseconds_count[1m])` |
| Legend | `{{route}}` | `{{http_route}}` |
| Error Rate by Route | `sum(rate(http_requests_total{status=~"5.."}[1m])) by (route) / sum(rate(http_requests_total[1m])) by (route) * 100` | `sum(rate(http_server_duration_milliseconds_count{http_status_code=~"5.."}[1m])) by (http_route) / sum(rate(http_server_duration_milliseconds_count[1m])) by (http_route) * 100` |
| P99 Latency by Route | `histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[1m])) by (le, route))` | `histogram_quantile(0.99, sum(rate(http_server_duration_milliseconds_bucket[1m])) by (le, http_route)) / 1000` (convert ms → seconds for display) or keep in ms and set unit to "ms". |
| Active Connections | `active_connections` | **Remove panel** or replace with text "N/A (OTel-only)" or implement custom metric later. |
| Overall Service Health | `sum(rate(http_requests_total{status=~"5.."}[1m])) / sum(rate(http_requests_total[1m])) * 100` | `sum(rate(http_server_duration_milliseconds_count{http_status_code=~"5.."}[1m])) / sum(rate(http_server_duration_milliseconds_count[1m])) * 100` |

### 3.4 Optional: filter by job

- OTel metrics may have `job="demo-app"`. If multiple jobs appear, add to queries: `{job="demo-app"}` or similar as needed.### 3.5 Checklist Phase 3 (Service Overview only)

- [ ] Update all panel queries in `service-overview.json` to use `http_server_*` and `http_route`, `http_status_code`.
- [ ] Remove or replace "Active Connections" panel.
- [ ] Set P99 panel unit to "s" (if dividing by 1000) or "ms" (if not).
- [ ] Save and export dashboard JSON; verify in Grafana after Prometheus has OTel data.

---

### 3.6 Plan: Multiple dashboard types for this service

Add several Grafana dashboards (all using OTel metrics from Prometheus) so the service can be viewed by purpose. Provision them under `grafana/dashboards/` so they load automatically.

| # | Dashboard | Purpose | Key panels (OTel metrics) | File |
|---|-----------|---------|----------------------------|------|
| 1 | **Service Overview** | Single-page health and RED summary | Request rate, error rate %, P99 latency, overall health | `service-overview.json` (existing; update in Phase 3) |
| 2 | **Request / HTTP** | Deep dive into HTTP traffic | Request rate by `http_route`, `http_method`, `http_status_code`; request/response size (if available); top routes by volume | `service-requests.json` (new) |
| 3 | **Latency / SLO** | Latency and percentiles | P50, P95, P99 by `http_route` from `http_server_duration_milliseconds_*`; latency heatmap or distribution; optional SLO burn rate | `service-latency.json` (new) |
| 4 | **Errors** | Error-focused view | Error rate % by route; 4xx vs 5xx split; top error routes; count of 5xx over time | `service-errors.json` (new) |
| 5 | **OTel & Collector** | OTel pipeline and collector health | Panels filtered by `otel_scope_name` or `job="demo-app"`; collector telemetry from 8888: `otelcol_receiver_accepted_*`, `otelcol_exporter_sent_*`; queue/batch size | `service-otel-collector.json` (new) |
| 6 | **Traces (optional)** | Trace-centric view | If a trace backend (e.g. Tempo/Jaeger) is added later: link to trace explorer or span count/duration from trace-derived metrics. For initial Option A, can be a placeholder or “Coming soon” text panel. | `service-traces.json` (optional) |

**Panel metrics (all OTel):**

- Request rate: `rate(http_server_duration_milliseconds_count[1m])` or `sum by (http_route) (rate(...))`.
- Error rate: `sum(rate(http_server_duration_milliseconds_count{http_status_code=~"5.."}[1m])) by (http_route) / sum(rate(http_server_duration_milliseconds_count[1m])) by (http_route) * 100`.
- Latency percentiles: `histogram_quantile(0.99, sum(rate(http_server_duration_milliseconds_bucket[5m])) by (le, http_route))` (and 0.5, 0.95 for P50, P95).
- Request/response size: `http_server_request_size`, `http_server_response_size` (if exported).
- Collector: `otelcol_receiver_accepted_spans_total`, `otelcol_exporter_sent_spans_total`, etc. (from scrape of :8888).

**Provisioning:**

- All dashboard JSON files go in `grafana/dashboards/`.
- Existing `grafana/provisioning/dashboards/dashboards.yml` already points to that folder; no change needed unless you add a subfolder (e.g. `grafana/dashboards/demo-service/`) and adjust the provisioning path.

### 3.7 Checklist Phase 3 (multiple dashboards)

- [ ] Service Overview updated to OTel (see 3.1–3.5).
- [ ] Create **Request / HTTP** dashboard (`service-requests.json`); add panels for rate by route/method/status and optional size metrics.
- [ ] Create **Latency / SLO** dashboard (`service-latency.json`); add P50/P95/P99 and optional heatmap.
- [ ] Create **Errors** dashboard (`service-errors.json`); add error rate by route, 4xx vs 5xx, top error routes.
- [ ] Create **OTel & Collector** dashboard (`service-otel-collector.json`); add OTel-scoped panels and collector telemetry panels.
- [ ] (Optional) Create **Traces** dashboard or placeholder (`service-traces.json`).
- [ ] Ensure all new JSON files are in `grafana/dashboards/` and provisioning picks them up; verify in Grafana after deploy.

---

## Phase 4: Alerts and provisioning (if any)

### 4.1 Files to check

- `grafana/provisioning/alerting/` (if alert rules are file-based)
- Any referenced alert rules in Grafana (UI or API)

### 4.2 Change

- Any alert that uses `http_requests_total` or `status=~"5.."` should use `http_server_duration_milliseconds_count` and `http_status_code=~"5.."` instead.
- Same for “error rate” conditions (e.g. > 5%).

### 4.3 Checklist Phase 4

- [ ] Find all alert definitions that reference prom-client metrics.
- [ ] Update to OTel metric names and labels.
- [ ] Re-provision or re-save alerts.

---

## Phase 5: Documentation and references

### 5.1 Files to update

- `README.md` — Remove or update any “metrics at `/metrics`” or “scrape app” wording; state that metrics come from OTel only and Prometheus scrapes only the collector.
- `README-DEV.md` — Same; remove references to app `/metrics` for Prometheus.
- `VERIFICATION_GUIDE.md` — Update “Data Flow”, “How data populates in Prometheus”, and “Grafana” sections to single-pipeline (no app scrape; only OTel → collector → Prometheus).
- `docs/ARCHITECTURE_AND_DATA_FLOW.md` — Replace current architecture with Option A (single pipeline); remove “Why keep /metrics” or reframe as “we no longer use /metrics”.
- `Postman_Collection.json` — Remove or repurpose “Prometheus Metrics” request that hits `app:3001/metrics` (app no longer has it). Optionally add a note request for “OTel metrics” at `http://localhost:8889/metrics`.
- `API_TEST_RESULTS.md` / `DASHBOARD_ACCESS.md` — Update any references to app `/metrics` or “direct scrape”.

### 5.2 Checklist Phase 5

- [ ] README and README-DEV describe single pipeline (OTel only for metrics).
- [ ] VERIFICATION_GUIDE and ARCHITECTURE_AND_DATA_FLOW reflect Option A.
- [ ] Postman collection no longer expects app `/metrics`.
- [ ] Other docs checked for “/metrics”, “prom-client”, “scrape app”.

---

## Phase 6: Docker and scripts (optional consistency)

### 6.1 Files to check

- `docker-compose.yml` — App service has no need to expose a “metrics” port for Prometheus; healthcheck can stay on `/health` or `/api/users`. No change required unless you had explicit “metrics” port comment.
- `docker-compose-dev.yml` — Same; Prometheus no longer scrapes app, so no dependency on app:3001 for metrics.
- `start-dev.sh` — No change required; app still runs and load-generator still hits it. Optionally update echo messages to say “metrics via OTel only”.

### 6.2 Checklist Phase 6

- [ ] Docker Compose files still valid (no broken scrape targets).
- [ ] start-dev.sh (if updated) says metrics come from OTel.

---

## Phase 7: Verification (after implementation)

### 7.1 App

- [ ] App starts without prom-client; only OTel SDK in use.
- [ ] No route `GET /metrics` on app.
- [ ] `GET /health` and `GET /api/users`, `/api/orders`, `/api/slow` work.
- [ ] Generate traffic; confirm OTel Collector receives (e.g. logs or `curl http://localhost:8889/metrics` shows `http_server_*`).

### 7.2 Prometheus

- [ ] Targets: only `otel-collector` (and prometheus self); no `demo-app` target.
- [ ] Query `http_server_duration_milliseconds_count` returns series (after some traffic).
- [ ] No query for `http_requests_total` from this app (optional: ensure no stale config).

### 7.3 Grafana

- [ ] Service Overview dashboard loads.
- [ ] Request rate, error rate, P99 panels show data when traffic is generated.
- [ ] Alerts (if any) use new metric names and still fire correctly.

### 7.4 End-to-end

- [ ] Run `./start-dev.sh` (or docker-compose + app locally); generate traffic; see metrics in Grafana from OTel only.

---

## Execution order (summary)

1. **Phase 1** — App: remove prom-client and `/metrics`.
2. **Phase 2** — Prometheus: remove app scrape job(s).
3. **Phase 3** — Grafana: rewrite dashboard to OTel metrics; drop or replace Active Connections.
4. **Phase 4** — Alerts: update to OTel metrics.
5. **Phase 5** — Docs: README, VERIFICATION_GUIDE, ARCHITECTURE, Postman, etc.
6. **Phase 6** — Docker/scripts: optional consistency.
7. **Phase 7** — Verification.

---

## Rollback (if needed)

- Restore `app/package.json` and `app/index.js` from git (re-add prom-client and `/metrics`).
- Restore `prometheus/prometheus.yml` and `prometheus-dev.yml` (re-add `demo-app` job).
- Restore `grafana/dashboards/service-overview.json` (original PromQL).
- Restore docs. Re-run `npm install` in app.

---

## Optional follow-up (not in initial plan)

- Add custom OTel metric `active_connections` in the app and a new Grafana panel for it.
- Add more custom metrics via OTel API if needed for business metrics.
- Tune collector (batch size, timeouts) or add processors (e.g. filter by service) in `otel-collector-config.yml`.
