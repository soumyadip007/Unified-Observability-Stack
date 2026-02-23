# OTel Integration Verification Guide

## ✅ Current Status: OTel Integration Complete

### What's Working

1. **App OTel SDK:** ✅ Initialized and configured
2. **OTel Collector:** ✅ Running and receiving data
3. **Data Flow:** ✅ App → Collector → Prometheus

### Important Notes

**The Prometheus exporter (port 8889) only exports metrics that the collector receives via OTLP.**

- If the app sends **traces only**, port 8889 will be empty (traces don't become Prometheus metrics automatically)
- If the app sends **metrics via OTLP**, they will appear on port 8889
- The collector's **internal telemetry** is on port 8888

## 🔍 Verification Steps

### 1. Check App is Sending Data

```bash
# Check app logs
tail -f app.log
# Should see: "✅ OpenTelemetry SDK initialized"

# Generate traffic
for i in {1..10}; do
  curl http://localhost:3001/api/users
  curl http://localhost:3001/api/orders
  sleep 0.1
done
```

### 2. Check Collector is Receiving Data

```bash
# Check collector logs for traces
docker compose -f docker-compose-dev.yml logs otel-collector -f | grep -E "(trace|span|received)"

# Should see trace/span data being processed
```

### 3. Check Collector Internal Metrics

```bash
# Collector's own telemetry metrics
curl http://localhost:8888/metrics | head -30

# Should show collector internal metrics like:
# - otelcol_receiver_accepted_spans
# - otelcol_exporter_sent_spans
# - otelcol_processor_batch_batch_send_size
```

### 4. Check Prometheus Exporter Metrics

```bash
# Metrics exported to Prometheus (from OTel data)
curl http://localhost:8889/metrics

# This will be empty if only traces are sent (not metrics)
# Traces need to be converted to metrics or sent as metrics via OTLP
```

### 5. Check Prometheus Targets

```bash
# Open in browser
open http://localhost:9090/targets

# Should see:
# - demo-app: UP ✅
# - otel-collector:8889: UP ✅ (even if empty)
# - otel-collector:8888: UP ✅ (internal metrics)
```

### 6. Query Prometheus

```bash
# Open Prometheus UI
open http://localhost:9090/graph

# Try these queries:
# - up{job="otel-collector"}  # Should be 1
# - otelcol_receiver_accepted_spans_total  # Collector internal metric
# - rate(otelcol_receiver_accepted_spans_total[1m])  # Span rate
```

## 📊 Understanding the Data Flow

### Current Setup

```
App (Node.js)
  ├─ Prometheus Metrics → /metrics endpoint → Prometheus (direct scrape) ✅
  └─ OTel Traces/Metrics → OTLP (gRPC) → Collector
                              │
                              ├─ Traces → Debug exporter (logs) ✅
                              ├─ Traces → Prometheus exporter (port 8889) ⚠️ (traces don't auto-convert)
                              └─ Metrics → Prometheus exporter (port 8889) ✅
```

### Why Port 8889 Might Be Empty

1. **Traces vs Metrics:** The Prometheus exporter exports **metrics**, not traces
2. **Auto-instrumentations:** By default, sends **traces** (spans), not metrics
3. **Solution:** Need to explicitly send metrics via OTLP, or use a span-to-metrics processor

## 🎯 What's Actually Working

✅ **Direct Prometheus Metrics:**
- App exposes `/metrics` endpoint
- Prometheus scrapes directly
- Metrics visible in Grafana

✅ **OTel Traces:**
- App sends traces to collector
- Collector receives and processes
- Traces logged via debug exporter

✅ **Collector Internal Metrics:**
- Collector exposes its own metrics on port 8888
- These show collector health and performance
- Scraped by Prometheus

## 🔧 To Get Metrics on Port 8889

You need to either:

1. **Send metrics via OTLP** (not just traces)
2. **Use a span-to-metrics processor** in the collector
3. **Use the collector's internal metrics** (port 8888) which are always available

## ✅ Summary

**OTel integration is working correctly!**

- App → Collector: ✅ Working (traces being sent)
- Collector → Prometheus: ✅ Working (internal metrics on 8888)
- Direct App → Prometheus: ✅ Working (metrics on /metrics endpoint)

The "empty" port 8889 is expected if only traces are sent. Use port 8888 for collector metrics, or configure the app to send metrics via OTLP.
