# Data Flow Verification Guide: Prometheus vs Grafana

## 📊 Complete Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Node.js App                              │
│  ┌────────────────────┐         ┌──────────────────────────┐  │
│  │  prom-client        │         │  OpenTelemetry SDK        │  │
│  │  (Custom Metrics)   │         │  (Auto-instrumentation)   │  │
│  └────────────────────┘         └──────────────────────────┘  │
│           │                                │                    │
│           │ /metrics endpoint              │ OTLP (gRPC)        │
│           │ (Prometheus format)           │ (port 4317)        │
└───────────┼────────────────────────────────┼────────────────────┘
            │                                │
            ▼                                ▼
┌──────────────────────┐         ┌──────────────────────────┐
│   Prometheus         │         │  OTel Collector          │
│   (Direct Scrape)    │         │  (Receives OTLP)         │
│                      │         └──────────────────────────┘
│  Scrapes:            │                    │
│  - app:3001/metrics  │                    │ Processes
│  - otel:8889/metrics │                    │ Exports
│  - otel:8888/metrics │                    │
└──────────────────────┘                    │
            │                                │
            │                                ▼
            │                    ┌──────────────────────────┐
            │                    │  Prometheus Exporter     │
            │                    │  (port 8889)             │
            │                    └──────────────────────────┘
            │                                │
            └────────────────────────────────┘
                        │
                        ▼
            ┌──────────────────────────┐
            │   Prometheus Storage     │
            │   (Time Series DB)       │
            │                          │
            │  Stores ALL metrics:     │
            │  - App metrics (prom)    │
            │  - OTel metrics          │
            │  - Collector metrics     │
            └──────────────────────────┘
                        │
                        │ Queries via PromQL
                        ▼
            ┌──────────────────────────┐
            │      Grafana              │
            │  (Visualization Layer)     │
            │                          │
            │  Reads from Prometheus:   │
            │  - Dashboard panels       │
            │  - Alerts                │
            │  - Explore queries       │
            └──────────────────────────┘
```

## 🔍 How Data Populates in Prometheus

### Path 1: Direct App Metrics (prom-client)

**Source:** `app/index.js` using `prom-client` library

**Metrics Generated:**
- `http_request_duration_seconds` (histogram)
- `http_requests_total` (counter)
- `active_connections` (gauge)

**Flow:**
```
App → /metrics endpoint → Prometheus scrapes (every 5s) → Stored in Prometheus
```

**Prometheus Configuration:**
```yaml
# prometheus/prometheus-dev.yml
- job_name: 'demo-app'
  targets: ['host.docker.internal:3001']
  metrics_path: '/metrics'
```

**Verify in Prometheus:**
```bash
# Query app metrics
curl 'http://localhost:9090/api/v1/query?query=http_requests_total'

# Check target status
open http://localhost:9090/targets
# Should see: demo-app: UP ✅
```

**Example Metrics in Prometheus:**
```
http_requests_total{route="/api/orders",status="200",method="GET"} 150
http_request_duration_seconds_bucket{route="/api/orders",le="0.1"} 45
active_connections 3
```

---

### Path 2: OTel Metrics via Collector

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

---

### Path 3: Collector Internal Metrics

**Source:** OTel Collector itself (telemetry)

**Metrics Generated:**
- `otelcol_receiver_accepted_spans_total`
- `otelcol_exporter_sent_spans_total`
- `otelcol_processor_batch_batch_send_size`

**Flow:**
```
OTel Collector → Internal telemetry (port 8888) → Prometheus scrapes → Stored in Prometheus
```

**Note:** This is collector health/performance metrics, not application metrics.

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

### Grafana Dashboard: Service Overview

**Location:** `grafana/dashboards/service-overview.json`

**Data Source:** All panels query from **Prometheus** datasource

#### Panel 1: Request Rate by Route

**PromQL Query:**
```promql
rate(http_requests_total[1m])
```

**Data Source in Prometheus:**
- **Metric:** `http_requests_total` (from app's prom-client)
- **Path:** Direct scrape from `app:3001/metrics`
- **Labels:** `route`, `status`, `method`

**How it Populates:**
1. App generates `http_requests_total` counter
2. Prometheus scrapes every 5s
3. Grafana queries `rate(http_requests_total[1m])` from Prometheus
4. Panel displays time series

---

#### Panel 2: Error Rate by Route

**PromQL Query:**
```promql
sum(rate(http_requests_total{status=~"5.."}[1m])) by (route)
/
sum(rate(http_requests_total[1m])) by (route)
* 100
```

**Data Source in Prometheus:**
- **Metric:** `http_requests_total` (from app's prom-client)
- **Path:** Direct scrape from `app:3001/metrics`
- **Filters:** `status=~"5.."` (5xx errors)

**How it Populates:**
1. App increments `http_requests_total{status="500"}` on errors
2. Prometheus stores with status label
3. Grafana calculates error rate percentage
4. Panel shows error rate over time

---

#### Panel 3: P99 Latency by Route

**PromQL Query:**
```promql
histogram_quantile(0.99, 
  sum(rate(http_request_duration_seconds_bucket[1m])) by (le, route)
)
```

**Data Source in Prometheus:**
- **Metric:** `http_request_duration_seconds_bucket` (from app's prom-client)
- **Path:** Direct scrape from `app:3001/metrics`
- **Calculation:** Uses histogram buckets to compute 99th percentile

**How it Populates:**
1. App records latency in histogram buckets
2. Prometheus stores bucket counts
3. Grafana calculates P99 using `histogram_quantile()`
4. Panel displays latency percentiles

---

#### Panel 4: Active Connections

**PromQL Query:**
```promql
active_connections
```

**Data Source in Prometheus:**
- **Metric:** `active_connections` (from app's prom-client)
- **Path:** Direct scrape from `app:3001/metrics`
- **Type:** Gauge (current value)

**How it Populates:**
1. App updates gauge on each connection
2. Prometheus scrapes current value
3. Grafana displays as gauge panel
4. Shows real-time connection count

---

#### Panel 5: Overall Service Health

**PromQL Query:**
```promql
sum(rate(http_requests_total{status=~"5.."}[1m])) 
/ 
sum(rate(http_requests_total[1m])) 
* 100
```

**Data Source in Prometheus:**
- **Metric:** `http_requests_total` (from app's prom-client)
- **Path:** Direct scrape from `app:3001/metrics`
- **Calculation:** Overall error rate percentage

**How it Populates:**
1. App tracks all requests with status codes
2. Prometheus stores aggregated counters
3. Grafana calculates overall error rate
4. Panel shows green (<5%) or red (>5%)

---

## 🔄 Complete Data Journey

### Example: Single API Request

**1. Request Made:**
```bash
curl http://localhost:3001/api/orders
```

**2. App Processes:**
- Express handles request
- **prom-client** increments `http_requests_total{route="/api/orders",status="200"}`
- **prom-client** records `http_request_duration_seconds` in histogram
- **OTel SDK** creates span and sends to collector via OTLP
- **OTel SDK** sends metrics to collector via OTLP

**3. Prometheus Scrapes (Path 1 - Direct):**
- Scrapes `app:3001/metrics` every 5s
- Receives: `http_requests_total`, `http_request_duration_seconds`, `active_connections`
- Stores in time series database

**4. OTel Collector Processes (Path 2 - Via OTel):**
- Receives OTLP data on port 4317
- Processes traces and metrics
- Exports metrics to `otel-collector:8889/metrics`

**5. Prometheus Scrapes (Path 2 - Via Collector):**
- Scrapes `otel-collector:8889/metrics` every 15s
- Receives: `http_server_duration_milliseconds`, etc.
- Stores in time series database

**6. Grafana Queries:**
- Dashboard panel queries: `rate(http_requests_total[1m])`
- Grafana sends PromQL query to Prometheus
- Prometheus returns time series data
- Grafana renders graph/panel

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

## 📝 Summary

### Prometheus (The Database)
- **Stores:** All metrics from app (direct) and OTel (via collector)
- **Scrapes:** `app:3001/metrics` and `otel-collector:8889/metrics`
- **Queries:** PromQL for instant and range queries
- **Access:** http://localhost:9090

### Grafana (The Visualizer)
- **Reads:** From Prometheus datasource (doesn't store)
- **Shows:** Pre-built dashboards with panels
- **Queries:** Sends PromQL to Prometheus, displays results
- **Access:** http://localhost:3000

### Data Flow Summary
1. **App generates metrics** (prom-client + OTel SDK)
2. **Prometheus scrapes and stores** (direct + via collector)
3. **Grafana queries Prometheus** (real-time)
4. **Grafana visualizes** (dashboards, panels, alerts)

**Remember:** Grafana is a visualization tool - it doesn't store data, it queries Prometheus on-demand!
