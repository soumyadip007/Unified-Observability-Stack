// Initialize OpenTelemetry FIRST (before any other imports)
let sdk = null;
try {
  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-grpc');
  const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-grpc');
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
  const { Resource } = require('@opentelemetry/resources');
  const { SEMRESATTRS_SERVICE_NAME } = require('@opentelemetry/semantic-conventions');
  const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');

  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317';

  sdk = new NodeSDK({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'demo-app',
    }),
    traceExporter: new OTLPTraceExporter({
      url: otlpEndpoint,
    }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: otlpEndpoint,
      }),
      exportIntervalMillis: 5000, // Export every 5 seconds
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();
  console.log('✅ OpenTelemetry SDK initialized');
  console.log(`   Sending traces/metrics to: ${otlpEndpoint}`);
  console.log('   Protocol: gRPC (OTLP)');
} catch (error) {
  console.warn('⚠️  OpenTelemetry not available (optional):', error.message);
  console.log('   Running without distributed tracing - metrics only');
}

// Now import Express and other modules
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3001;

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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Demo app listening on port ${PORT}`);
  console.log('Metrics via OpenTelemetry only (no /metrics endpoint)');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  if (sdk) {
    sdk.shutdown()
      .then(() => console.log('OpenTelemetry SDK shut down'))
      .catch((error) => console.log('Error shutting down SDK', error))
      .finally(() => process.exit(0));
  } else {
    process.exit(0);
  }
});
