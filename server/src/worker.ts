import { logger } from './lib/logger.js';
import { startEmailWorker } from './jobs/email.worker.js';
import { startScoringWorker } from './jobs/scoring.worker.js';

const scoringWorker = startScoringWorker();
const emailWorker = startEmailWorker();

const shutdown = async (signal: string) => {
  logger.info(`${signal} received. Shutting down worker...`);
  await scoringWorker.close();
  await emailWorker.close();
  logger.info('All workers stopped');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

logger.info('🧠 Scoring & Email Workers process started');
