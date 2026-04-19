// In-process Prometheus metric collection. Zero deps: we emit a handful of
// counters/histograms manually in the exposition format.
//
// Metrics recorded:
//   http_requests_total{method,route,status}     counter
//   http_request_duration_seconds_bucket{...}    histogram (le buckets)
//   http_request_duration_seconds_count/_sum     histogram aggregates
//   rate_limit_hits_total                        counter (status==429)
//
// DB pool and query metrics are not currently wired (would require hooking
// kysely events). `db_pool_connections_active` is emitted as a gauge read
// straight off the pg Pool.

import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { getPool } from '../db/index.js';
import { getConfig } from '../config.js';

const BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

interface HistogramSeries {
  buckets: number[];
  count: number;
  sum: number;
}

type RouteKey = string; // `${method} ${route} ${status}`

const requestCounts = new Map<RouteKey, number>();
const durations = new Map<RouteKey, HistogramSeries>();
const dbDurations = new Map<string, HistogramSeries>(); // keyed by operation kind
let rateLimitHits = 0;

function emptyHistogram(): HistogramSeries {
  return { buckets: new Array(BUCKETS.length).fill(0), count: 0, sum: 0 };
}

// Called by the Kysely metrics plugin on every completed query.
export function recordDbQuery(kind: string, durSec: number): void {
  const h = dbDurations.get(kind) ?? emptyHistogram();
  h.count += 1;
  h.sum += durSec;
  for (let i = 0; i < BUCKETS.length; i++) {
    if (durSec <= BUCKETS[i]!) h.buckets[i]! += 1;
  }
  dbDurations.set(kind, h);
}

export function registerMetricsPlugin(app: FastifyInstance): void {
  app.addHook('onResponse', async (req, reply) => {
    const route = req.routeOptions?.url ?? req.url.split('?')[0] ?? 'unknown';
    const method = req.method;
    const status = String(reply.statusCode);
    const key: RouteKey = `${method} ${route} ${status}`;
    requestCounts.set(key, (requestCounts.get(key) ?? 0) + 1);
    const durSec = (reply.elapsedTime ?? 0) / 1000;
    const h = durations.get(key) ?? emptyHistogram();
    h.count += 1;
    h.sum += durSec;
    for (let i = 0; i < BUCKETS.length; i++) {
      if (durSec <= BUCKETS[i]!) h.buckets[i]! += 1;
    }
    durations.set(key, h);
    if (reply.statusCode === 429) rateLimitHits += 1;
  });
}

export function registerMetricsRoutes(app: FastifyInstance): void {
  registerMetricsPlugin(app);
  app.get('/metrics', async (req, reply) => {
    const token = getConfig().METRICS_TOKEN;
    if (!token) {
      return reply.status(404).type('application/problem+json').send({
        type: 'https://scheduler.app/errors/not_found',
        title: 'Not Found',
        status: 404,
      });
    }
    const auth = req.headers['authorization'];
    const expected = `Bearer ${token}`;
    const a = Buffer.from(typeof auth === 'string' ? auth : '');
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return reply.status(401).type('application/problem+json').send({
        type: 'https://scheduler.app/errors/authentication_required',
        title: 'Authentication Required',
        status: 401,
      });
    }
    const lines: string[] = [];

    lines.push('# HELP http_requests_total Total HTTP requests.');
    lines.push('# TYPE http_requests_total counter');
    for (const [k, v] of requestCounts) {
      const [method, route, status] = k.split(' ');
      lines.push(`http_requests_total{method="${esc(method!)}",route="${esc(route!)}",status="${esc(status!)}"} ${v}`);
    }

    lines.push('# HELP http_request_duration_seconds Request duration.');
    lines.push('# TYPE http_request_duration_seconds histogram');
    for (const [k, h] of durations) {
      const [method, route, status] = k.split(' ');
      const labels = `method="${esc(method!)}",route="${esc(route!)}",status="${esc(status!)}"`;
      for (let i = 0; i < BUCKETS.length; i++) {
        lines.push(`http_request_duration_seconds_bucket{${labels},le="${BUCKETS[i]}"} ${h.buckets[i]}`);
      }
      lines.push(`http_request_duration_seconds_bucket{${labels},le="+Inf"} ${h.count}`);
      lines.push(`http_request_duration_seconds_sum{${labels}} ${h.sum}`);
      lines.push(`http_request_duration_seconds_count{${labels}} ${h.count}`);
    }

    lines.push('# HELP rate_limit_hits_total Requests blocked by rate limit.');
    lines.push('# TYPE rate_limit_hits_total counter');
    lines.push(`rate_limit_hits_total ${rateLimitHits}`);

    lines.push('# HELP db_query_duration_seconds DB query duration, labeled by operation kind.');
    lines.push('# TYPE db_query_duration_seconds histogram');
    for (const [kind, h] of dbDurations) {
      const labels = `kind="${esc(kind)}"`;
      for (let i = 0; i < BUCKETS.length; i++) {
        lines.push(`db_query_duration_seconds_bucket{${labels},le="${BUCKETS[i]}"} ${h.buckets[i]}`);
      }
      lines.push(`db_query_duration_seconds_bucket{${labels},le="+Inf"} ${h.count}`);
      lines.push(`db_query_duration_seconds_sum{${labels}} ${h.sum}`);
      lines.push(`db_query_duration_seconds_count{${labels}} ${h.count}`);
    }

    const pool = getPool();
    lines.push('# HELP db_pool_connections_active Active pg pool connections.');
    lines.push('# TYPE db_pool_connections_active gauge');
    // `totalCount - idleCount` approximates in-use connections.
    const total = (pool as unknown as { totalCount?: number }).totalCount ?? 0;
    const idle = (pool as unknown as { idleCount?: number }).idleCount ?? 0;
    lines.push(`db_pool_connections_active ${Math.max(0, total - idle)}`);

    return reply.type('text/plain; version=0.0.4; charset=utf-8').send(lines.join('\n') + '\n');
  });
}

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}
