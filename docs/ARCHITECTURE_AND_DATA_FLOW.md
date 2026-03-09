# Architecture & Data Flow Documentation (Option A: OTel-First)

This document describes the observability stack architecture after the Option A revamp: **single pipeline** — app sends all telemetry to the OTel Collector; Prometheus scrapes only the collector.

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Node.js Application                           │
│  OpenTelemetry SDK only (traces + metrics)                        │
│  No prom-client, no /metrics endpoint                            │
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

### Summary

- **Application → OTel:** The app **pushes** all traces and metrics to the collector (OTLP gRPC). There is no `/metrics` endpoint on the app.
- **Prometheus:** Only **scrapes** the OTel Collector (`:8889` for app metrics, optionally `:8888` for collector telemetry). Prometheus does **not** scrape the app.
- **Grafana:** Queries Prometheus. Dashboards and alerts use OTel metric names and labels (`http_server_duration_milliseconds_*`, `http_route`, `http_status_code`).

---

## 2. Data Flow

| Step | From        | To           | Model | Mechanism                    |
|------|-------------|-------------|-------|------------------------------|
| 1    | App         | OTel        | Push  | OTLP gRPC (e.g. :4317)        |
| 2    | Prometheus  | OTel        | Pull  | HTTP GET `:8889/metrics`     |
| 3    | Prometheus  | OTel        | Pull  | HTTP GET `:8888/metrics` (optional, collector telemetry) |
| 4    | Grafana     | Prometheus  | Pull  | PromQL over HTTP             |

---

## 3. Metrics: Single Source (OTel)

All app metrics in Prometheus come from the OTel pipeline:

| Aspect | Value |
|--------|--------|
| **Metric names** | `http_server_duration_milliseconds_count`, `http_server_duration_milliseconds_bucket`, `http_server_duration_milliseconds_sum` |
| **Labels** | `http_route`, `http_status_code`, `http_method`, `otel_scope_name`, etc. (semantic conventions) |
| **Traces** | Yes — same pipeline (collector receives traces and metrics) |

There is no longer a second source (no app `/metrics`). Dashboards and alerts use only these OTel metric names and labels.

---

## 4. Pull vs Push

- **App → OTel:** **Push.** The app sends OTLP to the collector.
- **Prometheus → Collector:** **Pull.** Prometheus scrapes the collector’s `/metrics` endpoints.
- **Grafana → Prometheus:** **Pull.** Grafana runs PromQL queries against Prometheus.

---

## 5. Where This Is Configured

- **App (push to OTel):** `app/index.js` — `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTLPTraceExporter`, `OTLPMetricExporter`, `PeriodicExportingMetricReader`, `getNodeAutoInstrumentations()`.
- **Prometheus (pull from collector only):** `prometheus/prometheus.yml` and `prometheus/prometheus-dev.yml` — job `otel-collector` only (no `demo-app` job).
- **OTel collector:** `otel-collector/otel-collector-config.yml` — OTLP receiver (4317/4318), pipelines for traces and metrics, Prometheus exporter (8889), telemetry (8888).

---

## 6. One-Paragraph Summary

The **application** uses only the **OpenTelemetry SDK** and **pushes** all telemetry (metrics and traces) to the **OTel Collector**. The app does **not** expose a `/metrics` endpoint. **Prometheus** **scrapes** only the collector (`:8889` and optionally `:8888`). **Grafana** **queries** Prometheus using OTel metric names and labels.
