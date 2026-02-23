# Development Mode Guide

This guide explains how to run the observability stack in development mode, with the app and load-generator running locally.

## Architecture

In dev mode:
- **Docker**: Runs otel-collector, prometheus, grafana
- **Local**: Runs app and load-generator (for easier debugging)

## Quick Start

### Step 1: Start Observability Stack (Docker)

```bash
docker compose -f docker-compose-dev.yml up -d
```

This starts:
- OpenTelemetry Collector (ports 4317, 4318, 8889)
- Prometheus (port 9090)
- Grafana (port 3000)

### Step 2: Install Dependencies

```bash
# Install app dependencies
cd app
npm install

# Install load-generator dependencies
cd ../load-generator
npm install
```

### Step 3: Run App Locally

**Terminal 1:**
```bash
cd app
npm run dev
```

The app will start on `http://localhost:3000`

### Step 4: Run Load Generator Locally

**Terminal 2:**
```bash
cd load-generator
npm run dev
```

Or with CHAOS_MODE:
```bash
CHAOS_MODE=true npm run dev
```

## Environment Variables

### App (app/index.js)
- `OTEL_EXPORTER_OTLP_ENDPOINT`: Defaults to `http://localhost:4317` (OTel optional, disabled for now)
- `OTEL_SERVICE_NAME`: Defaults to `demo-app`
- `PORT`: Defaults to `3001` (3000 is used by Grafana)

### Load Generator (load-generator/load.js)
- `APP_URL`: Defaults to `http://localhost:3001`
- `CHAOS_MODE`: Set to `true` to enable chaos mode

## Access Services

- **App API**: http://localhost:3001 (port 3001 to avoid conflict with Grafana)
  - Health: http://localhost:3001/health
  - Metrics: http://localhost:3001/metrics
  - Endpoints: `/api/orders`, `/api/users`, `/api/slow`

- **Grafana**: http://localhost:3000
  - Username: `admin`
  - Password: `admin`
  - Dashboard: Service Overview

- **Prometheus**: http://localhost:9090
  - Targets: http://localhost:9090/targets
  - Graph: http://localhost:9090/graph

- **OTel Collector Metrics**: http://localhost:8889/metrics

## Troubleshooting

### App can't connect to OTel Collector

Make sure the collector is running:
```bash
docker compose -f docker-compose-dev.yml ps
```

Check collector logs:
```bash
docker compose -f docker-compose-dev.yml logs otel-collector
```

### Prometheus can't scrape app

The app runs on `localhost:3000` on your host machine. Prometheus in Docker uses `host.docker.internal:3000` to access it.

Verify:
1. App is running: `curl http://localhost:3000/metrics`
2. Prometheus config uses `host.docker.internal:3000` (see `prometheus/prometheus-dev.yml`)

### Package installation issues

If npm install fails, try:
```bash
# Clear npm cache
npm cache clean --force

# Remove node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Port conflicts

If ports are in use:
- Grafana (3000): Change in `docker-compose-dev.yml`
- Prometheus (9090): Change in `docker-compose-dev.yml`
- App (3000): Change `PORT` env var or update in code

## Stopping Services

```bash
# Stop Docker services
docker compose -f docker-compose-dev.yml down

# Stop local app/load-generator: Ctrl+C in their terminals
```

## Using the Helper Script

Alternatively, use the provided script:

```bash
./start-dev.sh
```

This will:
1. Start Docker services
2. Show instructions for running app/load-generator locally

## Development Workflow

1. **Start observability stack**: `docker compose -f docker-compose-dev.yml up -d`
2. **Run app locally**: `cd app && npm run dev`
3. **Run load generator**: `cd load-generator && npm run dev`
4. **Monitor in Grafana**: http://localhost:3000
5. **Debug**: Use console.log, debugger, or attach debugger to Node.js process

## Next Steps

Once everything works in dev mode:
- Test all endpoints
- Verify metrics appear in Prometheus
- Check traces in Grafana Explore
- Test CHAOS_MODE
- Then move to production mode with full Docker Compose
