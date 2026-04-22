import { randomUUID } from 'node:crypto';
import { getConfig } from '../config.js';
import { logger } from '../utils/logger.js';
import { runEventTick } from './poll.js';
import { runNotificationsTick } from './notifications-loop.js';
import { registerAllHandlers } from './handlers/index.js';

export interface WorkerHandle {
  workerId: string;
  stop: () => Promise<void>;
  done: Promise<void>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function startWorker(): WorkerHandle {
  const cfg = getConfig();
  const workerId = `worker-${randomUUID().slice(0, 8)}`;
  registerAllHandlers();
  logger.info(
    { workerId, interval: cfg.WORKER_POLL_INTERVAL_MS, batch: cfg.WORKER_BATCH_SIZE },
    'worker.starting',
  );

  let stopping = false;

  async function loop(name: string, tick: () => Promise<number>): Promise<void> {
    while (!stopping) {
      try {
        const n = await tick();
        if (n === 0) await sleep(cfg.WORKER_POLL_INTERVAL_MS);
      } catch (err) {
        logger.error({ err, loop: name }, 'worker.tick_failed');
        await sleep(cfg.WORKER_POLL_INTERVAL_MS);
      }
    }
  }

  const done = Promise.all([
    loop('events', () => runEventTick(workerId)),
    loop('notifications', () => runNotificationsTick(workerId)),
  ]).then(() => undefined);

  return {
    workerId,
    stop: async () => {
      stopping = true;
      await done;
    },
    done,
  };
}
