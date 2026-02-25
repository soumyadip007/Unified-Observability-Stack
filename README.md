# Open-Source Observability Stack Demo

A production-ready observability stack demonstration using **Prometheus**, **Grafana**, and **OpenTelemetry** to monitor a fake "SaaS app" (Node.js API). This demo showcases real-time metrics collection, incident detection, and root cause analysis using distributed tracing.

## 🎯 What This Demo Shows

- A complete observability stack with **zero manual configuration**
- Real-time metrics collection and visualization
- Live incident detection and diagnosis
- OpenTelemetry distributed tracing for root cause analysis
- Automated alerting with Grafana

## 🏗️ Architecture (OTel-first, single pipeline)

```
┌─────────────────┐
│  Load Generator │ ────┐
└─────────────────┘     │
                        │
┌─────────────────┐     │     ┌──────────────────┐
│   Node.js App   │ ◄───┼─────┤  OTel Collector  │
│  (OTel SDK only)│     │     │  :4317, :8889    │
│                 │     │     └────────┬─────────┘
└────────┬────────┘     │              │
         │ OTLP push    │              │ Prometheus scrapes
         └──────────────┼──────────────┼──────────────┐
                        │              ▼              │
                        │     ┌──────────────────┐   │
                        │     │   Prometheus     │   │
                        │     └────────┬─────────┘   │
                        │              │             │
                        │              ▼             │
                        │     ┌──────────────────┐  │
                        └─────┤     Grafana       │  │
                              │  (Dashboards +    │  │
                              │    Alerts)       │  │
                              └──────────────────┘  │
```

### Data Flow

- **Metrics & traces**: App → OpenTelemetry (OTLP push) → OTel Collector → Prometheus scrapes collector only. No app `/metrics`; no direct scrape of the app.

## 📦 Services

| Service | Port | Purpose |
|---------|------|---------|
| **app** | 3000 | Node.js API with 3 endpoints (`/api/orders`, `/api/users`, `/api/slow`). Metrics via OTel only (no `/metrics`). |
| **load-generator** | - | Sends ~10 req/s traffic, supports CHAOS_MODE |
| **otel-collector** | 4317, 4318, 8889, 8888 | Receives OTLP (metrics + traces), exports to Prometheus (:8889) |
| **prometheus** | 9090 | Scrapes collector only (no app scrape) |
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

- **App API**: http://localhost:3000 (or 3001 in dev)
  - Health: http://localhost:3000/health
  - Endpoints (metrics via OTel only; no `/metrics` on app):
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
- **Service Health**: Green indicator (< 5% error rate)

**Narrative points:**
- "This shows our real-time observability stack in action"
- "Metrics flow from app → OTel Collector → Prometheus → Grafana (single pipeline)"
- "We're monitoring request rate, latency, and errors via OpenTelemetry"

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

## 📈 Grafana Dashboards

- **Service Overview** – Request rate, error rate %, P99 latency, overall health (OTel metrics: `http_server_duration_milliseconds_*`, `http_route`, `http_status_code`).
- **Service – Request / HTTP** – Request rate by route, method, status.
- **Service – Latency / SLO** – P50, P95, P99 and average latency by route.
- **Service – Errors** – Error rate by route, 4xx vs 5xx, top error routes.
- **Service – OTel & Collector** – OTel app metrics and collector telemetry.
- **Service – Traces** – Placeholder for when a trace backend (e.g. Tempo) is added.

## 🚨 Alerting

### Configure Alert (Manual Setup)

1. Go to **Alerting** → **Alert rules** in Grafana
2. Click **Create alert rule**
3. Configure:
   - **Name**: High Error Rate Detected
   - **Query**: `sum(rate(http_server_duration_milliseconds_count{http_status_code=~"5.."}[1m])) / sum(rate(http_server_duration_milliseconds_count[1m])) * 100`
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

### Metrics (OTel only)

Metrics come from the app via OpenTelemetry (auto-instrumentation) and are exposed by the collector at `:8889/metrics`. Prometheus scrapes only the collector. Example metrics: `http_server_duration_milliseconds_count`, `http_server_duration_milliseconds_bucket`, with labels `http_route`, `http_status_code`, `http_method`.

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
1. Verify OTel collector is receiving data: http://localhost:8889/metrics (when running in Docker, or from host if port is mapped)
2. Check Prometheus targets: http://localhost:9090/targets (only otel-collector and prometheus; no app scrape)
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
├── docs/                        # Documentation
│   ├── ARCHITECTURE_AND_DATA_FLOW.md
│   ├── ProposedRevampPlan.md
│   └── OptionA-ImplementationPlan.md
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

## 📚 Documentation

- **[Architecture & Data Flow](docs/ARCHITECTURE_AND_DATA_FLOW.md)** — Pull vs push model, OTel vs Prometheus relationship, and data flow
- **[Proposed Revamp Plan](docs/ProposedRevampPlan.md)** — Simplified, industry-standard architecture options (OTel-first vs Prometheus-first vs document-only)
- **[Option A Implementation Plan](docs/OptionA-ImplementationPlan.md)** — Step-by-step plan to implement OTel-first (single pipeline): what to remove and what to change
- [VERIFICATION_GUIDE.md](VERIFICATION_GUIDE.md) — How data populates in Prometheus and Grafana, segregation of OTel vs direct metrics

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
