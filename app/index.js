// Initialize OpenTelemetry FIRST (before any other imports)
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-otlp-http');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { Resource } = require('@opentelemetry/resources');
const { SEMRESATTRS_SERVICE_NAME } = require('@opentelemetry/semantic-conventions');

const sdk = new NodeSDK({
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'demo-app',
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://otel-collector:4318',
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
console.log('OpenTelemetry SDK initialized');

// Now import Express and other modules
const express = require('express');
const client = require('prom-client');

const app = express();
const PORT = 3000;

// Create a Registry to register the metrics
const register = new client.Registry();

// Add default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({ register });

// Create custom metrics
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['route', 'status', 'method'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['route', 'status', 'method'],
  registers: [register],
});

const activeConnections = new client.Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
  registers: [register],
});

let connectionCount = 0;

// Middleware to track connections
app.use((req, res, next) => {
  connectionCount++;
  activeConnections.set(connectionCount);

  const start = Date.now();
  const route = req.path;
  const method = req.method;

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const status = res.statusCode;

    httpRequestDuration.observe({ route, status, method }, duration);
    httpRequestsTotal.inc({ route, status, method });
    
    connectionCount--;
    activeConnections.set(connectionCount);
  });

  next();
});

// Helper function to simulate random delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to get random number between min and max
const randomBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// GET /api/orders - Random latency 50-300ms, 2% error rate
app.get('/api/orders', async (req, res) => {
  const latency = randomBetween(50, 300);
  await delay(latency);

  // Force error if header is present (chaos mode) or 2% natural error rate
  if (req.headers['x-force-error'] === 'true' || Math.random() < 0.02) {
    return res.status(500).json({
      error: 'Order service temporarily unavailable',
      timestamp: new Date().toISOString(),
    });
  }

  res.json({
    orders: [
      { id: 1, product: 'Widget A', quantity: 10, price: 29.99 },
      { id: 2, product: 'Widget B', quantity: 5, price: 49.99 },
    ],
    latency_ms: latency,
    timestamp: new Date().toISOString(),
  });
});

// GET /api/users - Fast, stable, always 200 (unless forced error)
app.get('/api/users', async (req, res) => {
  const latency = randomBetween(10, 50);
  await delay(latency);

  // Force error if header is present (chaos mode)
  if (req.headers['x-force-error'] === 'true') {
    return res.status(500).json({
      error: 'User service temporarily unavailable',
      timestamp: new Date().toISOString(),
    });
  }

  res.json({
    users: [
      { id: 1, name: 'Alice', email: 'alice@example.com' },
      { id: 2, name: 'Bob', email: 'bob@example.com' },
    ],
    latency_ms: latency,
    timestamp: new Date().toISOString(),
  });
});

// GET /api/slow - Latency spikes 2-5 seconds
app.get('/api/slow', async (req, res) => {
  const latency = randomBetween(2000, 5000);
  await delay(latency);

  // Force error if header is present (chaos mode)
  if (req.headers['x-force-error'] === 'true') {
    return res.status(500).json({
      error: 'Slow service temporarily unavailable',
      timestamp: new Date().toISOString(),
    });
  }

  res.json({
    message: 'This endpoint simulates slow database queries',
    latency_ms: latency,
    timestamp: new Date().toISOString(),
  });
});

// GET /metrics - Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Demo app listening on port ${PORT}`);
  console.log(`Metrics available at http://localhost:${PORT}/metrics`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  sdk.shutdown()
    .then(() => console.log('OpenTelemetry SDK shut down'))
    .catch((error) => console.log('Error shutting down SDK', error))
    .finally(() => process.exit(0));
});
