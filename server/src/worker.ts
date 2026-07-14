import { logger } from './lib/logger.js';
import { startScoringWorker } from './jobs/scoring.worker.js';

const worker = startScoringWorker();

const shutdown = async (signal: string) => {
  logger.info(`${signal} received. Shutting down worker...`);
  await worker.close();
  logger.info('Scoring worker stopped');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

logger.info('🧠 Scoring worker process started');
