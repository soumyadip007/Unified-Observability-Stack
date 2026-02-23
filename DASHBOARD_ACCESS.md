# Grafana Dashboard Access Guide

## Dashboard Location

The **Service Overview** dashboard is automatically provisioned when Grafana starts.

## Access Steps

1. **Open Grafana**: http://localhost:3000
2. **Login**:
   - Username: `admin`
   - Password: `admin`
3. **Navigate to Dashboard**:
   - Click on **"Dashboards"** in the left sidebar
   - Click **"Browse"**
   - Look for **"Service Overview"** dashboard
   - OR go directly to: http://localhost:3000/d/service-overview

## Dashboard Panels

The dashboard includes 5 panels:

1. **Request Rate by Route** - Shows requests per second for each endpoint
2. **Error Rate by Route** - Shows percentage of errors (5xx) by route
3. **P99 Latency by Route** - Shows 99th percentile latency
4. **Active Connections** - Gauge showing current connections
5. **Overall Service Health** - Green/Red health indicator

## If Dashboard Not Visible

### Check Dashboard Provisioning

1. Check Grafana logs:
   ```bash
   docker compose -f docker-compose-dev.yml logs grafana | grep -i dashboard
   ```

2. Verify dashboard file exists:
   ```bash
   ls -la grafana/dashboards/service-overview.json
   ```

3. Check provisioning config:
   ```bash
   cat grafana/provisioning/dashboards/dashboards.yml
   ```

### Manual Import (if needed)

1. Go to Grafana: http://localhost:3000
2. Click **"+"** → **"Import"**
3. Upload `grafana/dashboards/service-overview.json`
4. Select **Prometheus** as datasource
5. Click **"Import"**

## Verify Data is Flowing

1. **Check Prometheus Targets**: http://localhost:9090/targets
   - `demo-app` should show as **UP**
   - Should scrape `host.docker.internal:3001/metrics`

2. **Check Metrics in Prometheus**: http://localhost:9090/graph
   - Query: `rate(http_requests_total[1m])`
   - Should show data if app is receiving traffic

3. **Generate Traffic**:
   ```bash
   # Run load generator or use Postman collection
   cd load-generator && npm run dev
   ```

## Troubleshooting

### Dashboard shows "No Data"

1. **Check Prometheus has data**:
   - Go to http://localhost:9090/graph
   - Query: `http_requests_total`
   - If no data, app might not be running or Prometheus can't scrape it

2. **Check app is running**:
   ```bash
   curl http://localhost:3001/health
   curl http://localhost:3001/metrics
   ```

3. **Check Prometheus can reach app**:
   - Prometheus runs in Docker, app runs on host
   - Prometheus uses `host.docker.internal:3001` to reach host
   - On Linux, might need to use `host.docker.internal` or gateway IP

### Dashboard not appearing

1. **Restart Grafana**:
   ```bash
   docker compose -f docker-compose-dev.yml restart grafana
   ```

2. **Check file permissions**:
   ```bash
   ls -la grafana/dashboards/service-overview.json
   ```

3. **Verify JSON is valid**:
   ```bash
   python3 -m json.tool grafana/dashboards/service-overview.json > /dev/null && echo "Valid JSON"
   ```

## Direct Dashboard URL

Once logged in, you can access directly:
- http://localhost:3000/d/service-overview

## Quick Test

Run this to generate traffic and see dashboard update:

```bash
# Terminal 1: Make sure app is running
curl http://localhost:3001/api/users

# Terminal 2: Generate traffic
for i in {1..20}; do curl -s http://localhost:3001/api/users > /dev/null; sleep 0.1; done

# Then refresh Grafana dashboard - you should see the request rate increase
```
