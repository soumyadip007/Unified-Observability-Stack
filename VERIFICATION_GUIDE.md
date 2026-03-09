# Data Flow Verification Guide: Prometheus vs Grafana (Option A: OTel-First)

## 📊 Complete Data Flow Architecture (Single Pipeline)

```
┌─────────────────────────────────────────────────────────────────┐
│                         Node.js App                              │
│  OpenTelemetry SDK only (traces + metrics, no /metrics)          │
└──────────────────────────────┬──────────────────────────────────┘
                               │ OTLP (gRPC, port 4317)
                               ▼
                    ┌──────────────────┐
                    │  OTel Collector   │  :4317, :4318, :8889, :8888
                    └────────┬──────────┘
                             │ Prometheus scrapes only collector
                             ▼
                    ┌──────────────────┐      ┌──────────┐
                    │   Prometheus     │─────▶│ Grafana  │
                    └──────────────────┘      └──────────┘
```

**Summary:** The app does not expose `/metrics`. All metrics and traces go App → OTel Collector; Prometheus scrapes only the collector. Grafana queries Prometheus (OTel metric names: `http_server_duration_milliseconds_*`, labels: `http_route`, `http_status_code`).

## 🔍 How Data Populates in Prometheus

### Single path: OTel metrics via Collector

**Source:** `app/index.js` using OpenTelemetry SDK with auto-instrumentation

**Metrics Generated:**
- `http_server_duration_milliseconds` (histogram)
- `http_server_request_size` (gauge)
- `http_server_response_size` (gauge)

**Flow:**
```
App → OTLP (gRPC port 4317) → OTel Collector → Prometheus Exporter (port 8889) → Prometheus scrapes (every 15s) → Stored in Prometheus
```

**Prometheus Configuration:**
```yaml
# prometheus/prometheus-dev.yml
- job_name: 'otel-collector'
  targets: ['otel-collector:8889']
  metrics_path: '/metrics'
```

**Verify in Prometheus:**
```bash
# Query OTel metrics
curl 'http://localhost:9090/api/v1/query?query=http_server_duration_milliseconds_count'

# Check target status
open http://localhost:9090/targets
# Should see: otel-collector:8889: UP ✅
```

**Example Metrics in Prometheus:**
```
http_server_duration_milliseconds_count{http_route="/api/orders",http_method="GET",http_status_code="200"} 100
http_server_duration_milliseconds_sum{http_route="/api/orders"} 15000.5
```

**Data Types Stored in Prometheus (OTel Path):**
- **Histograms:** `http_server_duration_milliseconds_bucket` - HTTP request duration (milliseconds)
- **Counters:** `http_server_duration_milliseconds_count` - Total request count
- **Sums:** `http_server_duration_milliseconds_sum` - Total duration sum
- **Gauges:** `http_server_request_size`, `http_server_response_size` - Request/response sizes
- **Labels:** 
  - `http_route`, `http_method`, `http_status_code` (HTTP attributes)
  - `net_host_name`, `net_host_port` (Network attributes)
  - `otel_scope_name` (OTel instrumentation scope)
  - `job="demo-app"`, `label1="value1"` (From collector config)

---

### Collector internal metrics (optional scrape)

**Source:** OTel Collector itself (telemetry on port 8888)

**Metrics:** e.g. `otelcol_receiver_accepted_spans_total`, `otelcol_exporter_sent_spans_total`. Prometheus may scrape `otel-collector:8888` for collector health. Not required for app dashboards.

---

## 📈 How Data Appears in Grafana

### Grafana Data Source

**Configuration:**
- **Type:** Prometheus
- **URL:** `http://prometheus:9090`
- **Access:** Server (default)
- **Status:** ✅ Provisioned automatically

**Verify:**
```bash
# Check datasource via API
curl -u admin:admin http://localhost:3000/api/datasources

# Or in Grafana UI:
# Configuration → Data Sources → Prometheus
```

---

### Grafana Dashboards (OTel metrics only)

**Data Source:** All panels query **Prometheus**; all app metrics come from the **OTel Collector** scrape (`:8889`). There is no app `/metrics` scrape.

#### Service Overview – Panel 1: Request Rate by Route

**PromQL Query:**
```promql
rate(http_server_duration_milliseconds_count[1m])
```

**Data Source in Prometheus:**
- **Metric:** `http_server_duration_milliseconds_count` (from OTel auto-instrumentation)
- **Path:** Prometheus scrapes `otel-collector:8889/metrics`
- **Labels:** `http_route`, `http_status_code`, `http_method`

**How it Populates:**
1. App sends OTel metrics to collector; collector exports at :8889
2. Prometheus scrapes collector every 15s
3. Grafana queries `rate(http_server_duration_milliseconds_count[1m])`
4. Panel displays time series (legend: `{{http_route}}`)

---

#### Service Overview – Panel 2: Error Rate by Route

**PromQL Query:**
```promql
sum(rate(http_server_duration_milliseconds_count{http_status_code=~"5.."}[1m])) by (http_route)
/ sum(rate(http_server_duration_milliseconds_count[1m])) by (http_route) * 100
```

**Data Source in Prometheus:**
- **Metric:** `http_server_duration_milliseconds_count` (OTel)
- **Path:** Collector :8889
- **Filters:** `http_status_code=~"5.."` (5xx errors)

---

#### Service Overview – Panel 3: P99 Latency by Route

**PromQL Query:**
```promql
histogram_quantile(0.99, sum(rate(http_server_duration_milliseconds_bucket[1m])) by (le, http_route))
```

**Data Source in Prometheus:**
- **Metric:** `http_request_duration_seconds_bucket` (from app's prom-client)
- **Path:** Direct scrape from `app:3001/metrics`
- **Calculation:** Uses histogram buckets to compute 99th percentile

**How it Populates:**
1. OTel auto-instrumentation records HTTP server duration in milliseconds; collector exports at :8889
2. Prometheus scrapes collector and stores bucket counts
3. Grafana calculates P99 using `histogram_quantile()` (unit: ms)
4. Panel displays latency percentiles by `http_route`

---

#### Panel 4: (Removed in Option A)

The **Active Connections** panel was removed; the app no longer exposes that metric (no prom-client). Optional follow-up: add a custom OTel gauge for active connections if needed.

---

#### Panel 5: Overall Service Health

**PromQL Query:**
```promql
sum(rate(http_server_duration_milliseconds_count{http_status_code=~"5.."}[1m])) 
/ sum(rate(http_server_duration_milliseconds_count[1m])) * 100
```

**Data Source in Prometheus:**
- **Metric:** `http_server_duration_milliseconds_count` (OTel)
- **Path:** Collector :8889
- **Calculation:** Overall 5xx error rate percentage

**How it Populates:**
1. OTel exports request counts with `http_status_code`
2. Prometheus stores from collector scrape
3. Grafana calculates overall error rate; panel shows green (<5%) or red (>5%)

---

## 🔄 Complete Data Journey (Single Pipeline)

### Example: Single API Request

**1. Request Made:**
```bash
curl http://localhost:3001/api/orders
```

**2. App Processes:**
- Express handles request
- **OTel SDK** (auto-instrumentation) creates span and sends to collector via OTLP
- **OTel SDK** exports metrics (e.g. `http_server_duration_milliseconds`) to collector via OTLP
- No `/metrics` endpoint; no prom-client

**3. OTel Collector:**
- Receives OTLP data on port 4317 (traces + metrics)
- Processes and exports metrics at `otel-collector:8889/metrics`

**4. Prometheus:**
- Scrapes only `otel-collector:8889` (and optionally :8888); does **not** scrape the app
- Stores `http_server_duration_milliseconds_*` and other OTel metrics

**5. Grafana:**
- Dashboard panels query e.g. `rate(http_server_duration_milliseconds_count[1m])`, `histogram_quantile(...)`
- Grafana sends PromQL to Prometheus and renders panels

---

## 📊 Metrics Comparison: Prometheus vs Grafana

### In Prometheus (Storage Layer)

**What Prometheus Stores:**
- ✅ All raw metric data (counters, gauges, histograms)
- ✅ Time series with labels
- ✅ Historical data (1 hour retention in demo)
- ✅ Both app metrics AND OTel metrics

**How to View:**
```bash
# Prometheus UI
open http://localhost:9090/graph

# Query examples:
http_requests_total
http_server_duration_milliseconds_count
rate(http_requests_total[1m])
```

**Prometheus Endpoints:**
- `/api/v1/query` - Instant query
- `/api/v1/query_range` - Range query
- `/api/v1/targets` - Scrape targets status
- `/graph` - Query UI

---

### In Grafana (Visualization Layer)

**What Grafana Shows:**
- ✅ Visualized metrics (graphs, gauges, stats)
- ✅ Pre-built dashboards
- ✅ Alerts and notifications
- ✅ Explorable queries

**How to View:**
```bash
# Grafana UI
open http://localhost:3000
# Login: admin/admin
# Navigate to: Dashboards → Service Overview
```

**Grafana Features:**
- **Dashboards:** Pre-configured panels
- **Explore:** Ad-hoc queries
- **Alerts:** Rule-based notifications
- **Variables:** Dynamic queries

**Important:** Grafana **does NOT store data** - it queries Prometheus in real-time!

---

## 🔍 Verification Checklist

### Prometheus Verification

- [ ] **Targets Status:** http://localhost:9090/targets
  - `demo-app` should be **UP**
  - `otel-collector` should be **UP**

- [ ] **Query App Metrics:**
  ```promql
  http_requests_total
  http_request_duration_seconds_bucket
  active_connections
  ```

- [ ] **Query OTel Metrics:**
  ```promql
  http_server_duration_milliseconds_count
  http_server_duration_milliseconds_sum
  ```

- [ ] **Query Collector Metrics:**
  ```promql
  otelcol_receiver_accepted_spans_total
  ```

### Grafana Verification

- [ ] **Datasource:** Configuration → Data Sources → Prometheus (should be green)
- [ ] **Dashboard:** Dashboards → Service Overview (should load)
- [ ] **Panels:** All 5 panels should show data
- [ ] **Explore:** Can query Prometheus directly

### Data Flow Verification

- [ ] **App → Prometheus (Direct):**
  ```bash
  curl http://localhost:3001/metrics | grep http_requests_total
  # Then check Prometheus has it
  curl 'http://localhost:9090/api/v1/query?query=http_requests_total'
  ```

- [ ] **App → Collector → Prometheus:**
  ```bash
  # Generate traffic
  curl http://localhost:3001/api/users
  # Check collector received
  docker compose logs otel-collector | grep -i "received"
  # Check Prometheus has OTel metrics
  curl 'http://localhost:9090/api/v1/query?query=http_server_duration_milliseconds_count'
  ```

- [ ] **Prometheus → Grafana:**
  ```bash
  # Open Grafana dashboard
  open http://localhost:3000/d/service-overview
  # Panels should show data from Prometheus
  ```

---

## 🎯 Key Differences: Prometheus vs Grafana

| Aspect | Prometheus | Grafana |
|--------|-----------|---------|
| **Role** | Storage & Query Engine | Visualization Layer |
| **Data Storage** | ✅ Stores time series | ❌ No storage (queries Prometheus) |
| **Query Language** | PromQL | PromQL (via Prometheus) |
| **Visualization** | Basic graphs | Rich dashboards, panels |
| **Alerts** | Alertmanager | Built-in alerting |
| **Data Source** | Scrapes endpoints | Reads from Prometheus |
| **Retention** | Configurable (1h in demo) | Real-time queries only |

---

## 🔍 How to Segregate OTel vs Direct Prometheus Metrics in Grafana

### Identifying Metrics by Source

In Grafana, you can distinguish metrics by their **metric names** and **labels**:

#### Direct Prometheus Metrics (from prom-client)

**Metric Name Patterns:**
- `http_requests_total` - Request counter
- `http_request_duration_seconds_*` - Duration histogram (seconds)
- `active_connections` - Connection gauge
- `process_*` - Node.js process metrics
- `nodejs_*` - Node.js runtime metrics

**Label Characteristics:**
- Labels: `route`, `status`, `method` (simple, custom labels)
- No `otel_scope_name` label
- No `job` label (or `job="demo-app"` from direct scrape)

**Example Query (Direct Prometheus Only):**
```promql
# Only direct Prometheus metrics
http_requests_total{route!=""}

# Exclude OTel metrics
{__name__=~"http_request.*", !otel_scope_name=~".*"}
```

#### OTel Metrics (via Collector)

**Metric Name Patterns:**
- `http_server_duration_milliseconds_*` - Duration histogram (milliseconds)
- `http_server_request_size` - Request size gauge
- `http_server_response_size` - Response size gauge
- `otelcol_*` - Collector internal metrics

**Label Characteristics:**
- Labels: `http_route`, `http_method`, `http_status_code` (OTel semantic conventions)
- **Always has:** `otel_scope_name` label (e.g., `@opentelemetry/instrumentation-http`)
- **Always has:** `job="demo-app"` label (from collector config)
- **May have:** `net_host_name`, `net_host_port` (network attributes)
- **May have:** `label1="value1"` (from collector const_labels)

**Example Query (OTel Only):**
```promql
# Only OTel metrics
http_server_duration_milliseconds_count{otel_scope_name=~".*"}

# Filter by OTel scope
{otel_scope_name=~"@opentelemetry.*"}
```

### Creating Segregated Panels in Grafana

#### Panel 1: Direct Prometheus Metrics Only

**Query:**
```promql
rate(http_requests_total[1m])
```

**Filter to exclude OTel:**
```promql
rate(http_requests_total{!otel_scope_name=~".*"}[1m])
```

**What Shows:**
- Metrics from `prom-client` library
- Custom app metrics
- Direct scrape metrics

---

#### Panel 2: OTel Metrics Only

**Query:**
```promql
rate(http_server_duration_milliseconds_count[1m])
```

**Filter by OTel scope:**
```promql
rate(http_server_duration_milliseconds_count{otel_scope_name=~"@opentelemetry.*"}[1m])
```

**What Shows:**
- Metrics from OTel auto-instrumentation
- Metrics via collector
- OTel semantic convention labels

---

#### Panel 3: Both Sources (Combined)

**Query:**
```promql
# Combine both sources
rate(http_requests_total[1m]) or rate(http_server_duration_milliseconds_count[1m])
```

**What Shows:**
- All metrics from both sources
- Can compare direct vs OTel metrics

---

### Quick Identification Guide

| Feature | Direct Prometheus | OTel (via Collector) |
|---------|------------------|----------------------|
| **Metric Prefix** | `http_request_*` | `http_server_*` |
| **Duration Unit** | `seconds` | `milliseconds` |
| **Label Style** | `route`, `status` | `http_route`, `http_status_code` |
| **OTel Scope Label** | ❌ No | ✅ Yes (`otel_scope_name`) |
| **Job Label** | `job="demo-app"` (from scrape) | `job="demo-app"` (from collector) |
| **Network Labels** | ❌ No | ✅ Yes (`net_host_name`, `net_host_port`) |
| **Source** | `/metrics` endpoint | OTLP → Collector → Exporter |

---

### Grafana Explore: Filtering by Source

**In Grafana Explore tab:**

1. **View Only Direct Prometheus Metrics:**
   ```promql
   {__name__=~"http_request.*", !otel_scope_name=~".*"}
   ```

2. **View Only OTel Metrics:**
   ```promql
   {otel_scope_name=~"@opentelemetry.*"}
   ```

3. **View Both (All HTTP Metrics):**
   ```promql
   {__name__=~"http.*"}
   ```

4. **Compare Direct vs OTel:**
   ```promql
   # Direct
   rate(http_requests_total[1m])
   
   # OTel
   rate(http_server_duration_milliseconds_count[1m])
   ```

---

## 📊 Complete Data Types Stored in Prometheus

### From Direct Prometheus Scrape (app:3001/metrics)

**Source:** `prom-client` library in app

**Data Types:**

1. **Counters:**
   - `http_requests_total` - Total HTTP requests
   - `process_cpu_user_seconds_total` - CPU user time
   - `process_cpu_system_seconds_total` - CPU system time

2. **Histograms:**
   - `http_request_duration_seconds_bucket` - Request duration buckets
   - `http_request_duration_seconds_sum` - Total duration sum
   - `http_request_duration_seconds_count` - Total request count

3. **Gauges:**
   - `active_connections` - Current active connections
   - `process_resident_memory_bytes` - Memory usage
   - `nodejs_heap_size_total_bytes` - Heap size

4. **Labels Used:**
   - `route` - API endpoint path
   - `status` - HTTP status code
   - `method` - HTTP method (GET, POST, etc.)

**Storage Format:**
- Time series with labels
- Scraped every 5 seconds
- Stored in Prometheus TSDB

---

### From OTel Collector (otel-collector:8889/metrics)

**Source:** OpenTelemetry SDK → Collector → Prometheus Exporter

**Data Types:**

1. **Histograms:**
   - `http_server_duration_milliseconds_bucket` - HTTP duration buckets (milliseconds)
   - `http_server_duration_milliseconds_sum` - Total duration sum
   - `http_server_duration_milliseconds_count` - Total request count

2. **Gauges:**
   - `http_server_request_size` - HTTP request body size
   - `http_server_response_size` - HTTP response body size

3. **Labels Used (OTel Semantic Conventions):**
   - `http_route` - HTTP route path
   - `http_method` - HTTP method
   - `http_status_code` - HTTP status code
   - `http_scheme` - HTTP scheme (http/https)
   - `http_flavor` - HTTP version (1.1, 2.0)
   - `net_host_name` - Network hostname
   - `net_host_port` - Network port
   - `otel_scope_name` - OTel instrumentation scope
   - `otel_scope_version` - OTel scope version
   - `job` - Job name (from collector config)
   - `label1` - Custom label (from collector config)

**Storage Format:**
- Time series with OTel semantic convention labels
- Scraped every 15 seconds
- Stored in Prometheus TSDB
- Includes trace-derived metrics

---

### From Collector Internal Telemetry (otel-collector:8888/metrics)

**Source:** OTel Collector itself

**Data Types:**

1. **Counters:**
   - `otelcol_receiver_accepted_spans_total` - Spans received
   - `otelcol_exporter_sent_spans_total` - Spans exported
   - `otelcol_processor_batch_batch_send_size_total` - Batch sizes

2. **Gauges:**
   - `otelcol_processor_batch_batch_send_size` - Current batch size
   - `otelcol_receiver_refused_spans` - Refused spans

3. **Labels Used:**
   - `otelcol_component_id` - Component identifier
   - `otelcol_component_kind` - Component type (receiver, processor, exporter)
   - `otelcol_signal` - Signal type (traces, metrics, logs)

**Storage Format:**
- Collector health and performance metrics
- Scraped every 15 seconds
- Stored in Prometheus TSDB

---

## 📝 Summary

### Prometheus (The Database)

**Stores ALL metrics from 3 sources:**

1. **Direct App Metrics (prom-client):**
   - Metric names: `http_request_*`, `active_connections`
   - Labels: `route`, `status`, `method`
   - Scraped from: `app:3001/metrics` (every 5s)
   - **Data Types:** Counters, Histograms, Gauges

2. **OTel Metrics (via Collector):**
   - Metric names: `http_server_*`
   - Labels: `http_route`, `http_method`, `otel_scope_name`, etc.
   - Scraped from: `otel-collector:8889/metrics` (every 15s)
   - **Data Types:** Histograms, Gauges (from OTel auto-instrumentation)

3. **Collector Internal Metrics:**
   - Metric names: `otelcol_*`
   - Labels: `otelcol_component_*`, `otelcol_signal`
   - Scraped from: `otel-collector:8888/metrics` (every 15s)
   - **Data Types:** Counters, Gauges (collector telemetry)

**Storage:**
- All metrics stored in Prometheus TSDB
- Time series format with labels
- Retention: 1 hour (demo config)
- Queryable via PromQL

### Grafana (The Visualizer)

**How to Segregate:**

1. **By Metric Name:**
   - Direct: `http_request_*` (seconds)
   - OTel: `http_server_*` (milliseconds)

2. **By Labels:**
   - Direct: Has `route`, `status` (no `otel_scope_name`)
   - OTel: Has `otel_scope_name`, `http_route`, `http_method`

3. **By Query Filter:**
   ```promql
   # Direct only
   {!otel_scope_name=~".*"}
   
   # OTel only
   {otel_scope_name=~"@opentelemetry.*"}
   ```

**Reads from Prometheus:**
- Queries Prometheus datasource in real-time
- No data storage (queries on-demand)
- Can filter/aggregate by source using PromQL

### Data Flow Summary
1. **App generates metrics** (prom-client + OTel SDK)
2. **Prometheus scrapes and stores** (direct + via collector)
3. **Grafana queries Prometheus** (real-time, can filter by source)
4. **Grafana visualizes** (dashboards, panels, alerts)

**Remember:** 
- **Prometheus stores everything** - both direct and OTel metrics
- **Grafana queries and filters** - use metric names and labels to segregate
- **OTel metrics have `otel_scope_name` label** - use this to identify OTel metrics
- **Direct metrics use simple labels** - `route`, `status`, `method`
