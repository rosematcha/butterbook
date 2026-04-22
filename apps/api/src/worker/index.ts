import { loadConfig } from '../config.js';
import { closeDb } from '../db/index.js';
import { logger } from '../utils/logger.js';
import { startWorker } from './run.js';

async function main(): Promise<void> {
  loadConfig();
  const handle = startWorker();

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ workerId: handle.workerId }, 'worker.shutdown');
    await handle.stop();
    await closeDb();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await handle.done;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    logger.error({ err }, 'worker.fatal');
    process.exit(1);
  });
}
