import { loadConfig, getConfig } from './config.js';
import { buildApp } from './app.js';
import { closeDb } from './db/index.js';

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

  const shutdown = async (): Promise<void> => {
    try {
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
