# Open-Source Observability Stack Demo

A production-ready observability stack demonstration using **Prometheus**, **Grafana**, and **OpenTelemetry** to monitor a fake "SaaS app" (Node.js API). This demo showcases real-time metrics collection, incident detection, and root cause analysis using distributed tracing.

## 🎯 What This Demo Shows

- A complete observability stack with **zero manual configuration**
- Real-time metrics collection and visualization
- Live incident detection and diagnosis
- OpenTelemetry distributed tracing for root cause analysis
- Automated alerting with Grafana

## 🏗️ Architecture

```
┌─────────────────┐
│  Load Generator │ ────┐
└─────────────────┘     │
                        │
┌─────────────────┐     │     ┌──────────────────┐
│   Node.js App   │ ◄───┼─────┤  OTel Collector  │
│  (3 endpoints)  │     │     └──────────────────┘
│  /metrics       │     │              │
└─────────────────┘     │              │
         │               │              │
         │               │              ▼
         │               │     ┌──────────────────┐
         └───────────────┼─────┤   Prometheus     │
                         │     └──────────────────┘
                         │              │
                         │              ▼
                         │     ┌──────────────────┐
                         └─────┤     Grafana      │
                               │  (Dashboards +   │
                               │    Alerts)       │
                               └──────────────────┘
```

### Data Flow

- **Metrics**: App endpoints → `/metrics` → Prometheus (direct scraping, pull model)
- **Traces**: App endpoints → OpenTelemetry Collector → Prometheus (push model via OTLP)

## 📦 Services

| Service | Port | Purpose |
|---------|------|---------|
| **app** | 3000 | Node.js API with 3 endpoints (`/api/orders`, `/api/users`, `/api/slow`) |
| **load-generator** | - | Sends ~10 req/s traffic, supports CHAOS_MODE |
| **otel-collector** | 4317, 4318, 8889 | Receives traces, exports to Prometheus |
| **prometheus** | 9090 | Scrapes and stores metrics |
| **grafana** | 3000 | Dashboards and alerting |

## 🚀 Quick Start

### Prerequisites

- Docker Desktop (or Docker + Docker Compose)
- Ports available: `3000` (Grafana), `9090` (Prometheus)
- ~2GB RAM available
- ~5GB disk space

### Start the Stack

```bash
# Clone or navigate to the directory
cd Unified-Observability-Stack

# Start all services
docker compose up --build

# Wait for all services to be healthy (check with: docker compose ps)
```

### Access Services

- **Grafana**: http://localhost:3000
  - Username: `admin`
  - Password: `admin`
  - Dashboard: Navigate to "Service Overview"

- **Prometheus**: http://localhost:9090
  - Check targets: http://localhost:9090/targets
  - Query metrics: http://localhost:9090/graph

- **App API**: http://localhost:3000
  - Health: http://localhost:3000/health
  - Metrics: http://localhost:3000/metrics
  - Endpoints:
    - `GET /api/orders` - Random latency 50-300ms, 2% error rate
    - `GET /api/users` - Fast, stable (~10-50ms)
    - `GET /api/slow` - Latency spikes 2-5 seconds

## 📊 Demo Flow

### Step 1: Start Everything

```bash
docker compose up --build
```

**Actions:**
1. Wait for all services to be healthy (check with `docker compose ps`)
2. Open Grafana at http://localhost:3000
3. Login with `admin` / `admin`
4. Navigate to **Dashboards** → **Service Overview**
5. Verify all panels show green/healthy state

### Step 2: Show Normal Traffic

**What to observe:**
- **Request Rate panel**: Shows traffic across all three endpoints (~10 req/s total)
- **P99 Latency**: Stable, under 300ms for most routes
- **Error Rate**: Baseline 2% error rate on `/api/orders` (acceptable)
- **Active Connections**: Shows current connection count
- **Service Health**: Green indicator (< 5% error rate)

**Narrative points:**
- "This shows our real-time observability stack in action"
- "Metrics flow from app → Prometheus → Grafana"
- "We're monitoring request rate, latency, errors, and active connections"

### Step 3: Trigger the Incident (CHAOS MODE)

```bash
# Stop the normal load generator
docker compose stop load-generator

# Start chaos mode (in a new container)
docker compose run --rm -e CHAOS_MODE=true load-generator
```

**Alternative method (using docker-compose override):**
```bash
# Stop current load generator
docker compose stop load-generator

# Edit docker-compose.yml temporarily to set CHAOS_MODE=true, or:
# Use environment variable override
CHAOS_MODE=true docker compose up load-generator
```

**What happens:**
- Error rate climbs above 5%
- P99 latency on `/api/slow` spikes to seconds
- Service Health panel turns **RED**
- Alert fires (if configured) within 30 seconds

**Narrative points:**
- "Now let's simulate an incident"
- "Notice the error rate climbing above our 5% threshold"
- "Latency is spiking on the slow endpoint"
- "Our service health indicator has turned red"
- "The alert fired within 30 seconds - this is fast MTTD"

### Step 4: Diagnose with Traces

**In Grafana:**
1. Go to **Explore** tab
2. Select **Prometheus** datasource
3. Query for trace metrics or span data
4. Show span waterfall for slow requests

**Narrative points:**
- "Let's look at a trace from the slow endpoint"
- "Here we can see exactly where the time is being spent"
- "This is where OpenTelemetry earns its place - full request journey visibility"

### Step 5: Fix It

```bash
# Stop chaos mode
docker compose stop load-generator

# Restart with normal mode
docker compose up load-generator
```

**What happens:**
- Error rate drops back to baseline
- Latency returns to normal
- Service Health panel turns **GREEN**
- Dashboard recovers in real-time

**Narrative points:**
- "Now let's stop the chaos"
- "Watch the dashboard recover in real-time"
- "Error rate is dropping, health is recovering"
- "This is what MTTD improvement looks like - we caught this in 30 seconds"

## 📈 Grafana Dashboard Panels

The **Service Overview** dashboard includes:

1. **Request Rate by Route** - `rate(http_requests_total[1m])`
2. **Error Rate by Route** - Percentage of 5xx errors
3. **P99 Latency by Route** - 99th percentile latency
4. **Active Connections** - Current connection gauge
5. **Overall Service Health** - Green/Red health indicator

## 🚨 Alerting

### Configure Alert (Manual Setup)

1. Go to **Alerting** → **Alert rules** in Grafana
2. Click **Create alert rule**
3. Configure:
   - **Name**: High Error Rate Detected
   - **Query**: `sum(rate(http_requests_total{status=~"5.."}[1m])) / sum(rate(http_requests_total[1m])) * 100`
   - **Condition**: IS ABOVE `5`
   - **Evaluation**: Every `15s`
   - **For**: `30s`
   - **Severity**: Critical

## 🔧 Configuration

### Environment Variables

**Load Generator:**
- `APP_URL`: Target app URL (default: `http://app:3000`)
- `CHAOS_MODE`: Set to `true` to trigger incident (default: `false`)

**App:**
- `OTEL_EXPORTER_OTLP_ENDPOINT`: OTel Collector endpoint
- `OTEL_SERVICE_NAME`: Service name for traces

### Metrics Exposed

- `http_request_duration_seconds` (Histogram) - Request latency
- `http_requests_total` (Counter) - Total requests
- `active_connections` (Gauge) - Active connections

## 🐛 Troubleshooting

### Services won't start
```bash
# Check Docker is running
docker ps

# Check logs
docker compose logs [service-name]

# Check port conflicts
lsof -i :3000
lsof -i :9090
```

### Metrics not appearing
1. Verify app is exposing `/metrics`: http://localhost:3000/metrics
2. Check Prometheus targets: http://localhost:9090/targets
3. Verify scrape config in `prometheus/prometheus.yml`

### Dashboard not loading
1. Check Grafana logs: `docker compose logs grafana`
2. Verify datasource is provisioned (should be automatic)
3. Check dashboard JSON is valid

### Traces not visible
1. Verify OTel Collector is receiving traces: `docker compose logs otel-collector`
2. Check collector config: `otel-collector/otel-collector-config.yml`
3. Verify OTLP endpoint in app environment variables

## 📁 Project Structure

```
Unified-Observability-Stack/
├── docker-compose.yml          # Main orchestration file
├── README.md                    # This file
├── app/                         # Node.js API
│   ├── Dockerfile
│   ├── index.js
│   └── package.json
├── load-generator/              # Traffic generator
│   ├── Dockerfile
│   ├── load.js
│   └── package.json
├── otel-collector/
│   └── otel-collector-config.yml
├── prometheus/
│   └── prometheus.yml
└── grafana/
    ├── provisioning/
    │   ├── datasources/
    │   │   └── datasources.yml
    │   ├── dashboards/
    │   │   └── dashboards.yml
    │   └── alerting/
    │       └── alert-rules.yml
    └── dashboards/
        └── service-overview.json
```

## 🛑 Stop the Stack

```bash
# Stop all services
docker compose down

# Stop and remove volumes (clean slate)
docker compose down -v
```

## 📚 Learn More

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)

## 📝 License

See [LICENSE](LICENSE) file for details.

## 🤝 Contributing

This is a demo project. Feel free to fork and modify for your own presentations and learning!

---

**Built for FOSSASIA** - Demonstrating open-source observability best practices.
