import client from 'prom-client';

// Enable default Node.js metrics (memory, CPU, event loop)
client.collectDefaultMetrics({ prefix: 'oto_content_' });

export const requestCounter = new client.Counter({
  name: 'oto_content_requests_total',
  help: 'Total HTTP requests to content service',
  labelNames: ['route', 'method'],
});

export const cacheHitCounter = new client.Counter({
  name: 'oto_content_cache_hits_total',
  help: 'Total Redis cache hits',
  labelNames: ['route'],
});

export const apiLatency = new client.Histogram({
  name: 'oto_content_request_duration_seconds',
  help: 'Request duration in seconds',
  labelNames: ['route', 'status'],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5],
});

export const register = client.register;
