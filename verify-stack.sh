#!/bin/bash
# Quick verification: collector, Prometheus, Grafana and OTel metrics flow.
# Run after: docker compose -f docker-compose-dev.yml up -d, then app + load-generator (or generate traffic).

set -e
echo "=== 1. Collector :8889 (app metrics) ==="
curl -sf -o /dev/null "http://localhost:8889/metrics" && echo "OK" || echo "FAIL (is Docker stack up? port 8889 exposed?)"
echo ""
echo "=== 2. Prometheus targets ==="
curl -s "http://localhost:9090/api/v1/targets" | grep -o '"health":"[^"]*"' | head -5
echo ""
echo "=== 3. Prometheus query (OTel metric) ==="
HITS=$(curl -s 'http://localhost:9090/api/v1/query?query=http_server_duration_milliseconds_count' | grep -c '"http_route"' || true)
if [ "$HITS" -gt 0 ]; then echo "OK ($HITS series)"; else echo "FAIL (no data - generate traffic to app, wait ~15s)"; fi
echo ""
echo "=== 4. Grafana health ==="
curl -sf -o /dev/null "http://localhost:3000/api/health" && echo "OK" || echo "FAIL (Grafana on 3000?)"
echo ""
echo "Done. Open http://localhost:3000 (admin/admin) → Dashboards → Service Overview. Time range: Last 15 minutes."
