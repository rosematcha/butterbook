import { loadConfig, getConfig } from './config.js';
import { buildApp } from './app.js';
import { closeDb } from './db/index.js';
import { startWorker, type WorkerHandle } from './worker/run.js';

async function main(): Promise<void> {
  loadConfig();
  const cfg = getConfig();
  const app = await buildApp();
  try {
    await app.listen({ port: cfg.PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error({ err }, 'failed to start');
    process.exit(1);
  }

  // Run the event + notifications poll loops inside the API process so a single
  // Coolify container owns both HTTP traffic and background delivery. If the
  // deployment ever outgrows this (multiple API replicas competing for rows is
  // fine thanks to FOR UPDATE SKIP LOCKED, but the per-process load grows with
  // traffic), split the worker back out via `start:worker`.
  let worker: WorkerHandle | null = null;
  if (cfg.NOTIFICATIONS_ENABLED) {
    worker = startWorker();
  }

  const shutdown = async (): Promise<void> => {
    try {
      if (worker) await worker.stop();
      await app.close();
      await closeDb();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
