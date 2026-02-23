const axios = require('axios');

const APP_URL = process.env.APP_URL || 'http://localhost:3001';
const CHAOS_MODE = process.env.CHAOS_MODE === 'true';
const REQUESTS_PER_SECOND = 10;
const DELAY_MS = 1000 / REQUESTS_PER_SECOND; // 100ms between requests

const endpoints = [
  { path: '/api/orders', weight: 1 },
  { path: '/api/users', weight: 1 },
  { path: '/api/slow', weight: 1 },
];

// In chaos mode, /api/slow gets 80% of traffic
const chaosEndpoints = [
  { path: '/api/slow', weight: 8 },
  { path: '/api/orders', weight: 1 },
  { path: '/api/users', weight: 1 },
];

function selectEndpoint() {
  const pool = CHAOS_MODE ? chaosEndpoints : endpoints;
  const totalWeight = pool.reduce((sum, ep) => sum + ep.weight, 0);
  let random = Math.random() * totalWeight;

  for (const endpoint of pool) {
    random -= endpoint.weight;
    if (random <= 0) {
      return endpoint.path;
    }
  }
  return pool[0].path;
}

async function makeRequest() {
  const endpoint = selectEndpoint();
  const url = `${APP_URL}${endpoint}`;

  try {
    // In chaos mode, force 20% error rate by adding error-inducing headers
    const config = CHAOS_MODE && Math.random() < 0.2
      ? { headers: { 'X-Force-Error': 'true' } }
      : {};

    const response = await axios.get(url, {
      ...config,
      timeout: 10000,
      validateStatus: () => true, // Don't throw on any status
    });

    if (response.status >= 500) {
      console.log(`[ERROR] ${endpoint} - Status: ${response.status}`);
    } else {
      console.log(`[OK] ${endpoint} - Status: ${response.status} - Latency: ${response.data?.latency_ms || 'N/A'}ms`);
    }
  } catch (error) {
    console.error(`[ERROR] ${endpoint} - ${error.message}`);
  }
}

async function run() {
  console.log('='.repeat(60));
  console.log('Load Generator Started');
  console.log(`Target: ${APP_URL}`);
  console.log(`Mode: ${CHAOS_MODE ? 'CHAOS MODE 🔥' : 'Normal Mode'}`);
  console.log(`Rate: ~${REQUESTS_PER_SECOND} requests/second`);
  console.log('='.repeat(60));
  console.log('');

  if (CHAOS_MODE) {
    console.log('⚠️  CHAOS MODE ACTIVE:');
    console.log('   - 80% of traffic going to /api/slow');
    console.log('   - 20% error rate forced');
    console.log('');
  }

  // Run continuously
  while (true) {
    makeRequest();
    await new Promise(resolve => setTimeout(resolve, DELAY_MS));
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('\nSIGTERM received: shutting down load generator');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received: shutting down load generator');
  process.exit(0);
});

// Start the load generator
run().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
