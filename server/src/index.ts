import http from 'http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { startEmailWorker } from './jobs/email.worker.js';
import { startScoringWorker } from './jobs/scoring.worker.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { setupSocketIO } from './socket/index.js';

async function main() {
  const app = createApp();
  const server = http.createServer(app);
  setupSocketIO(server);
  const scoringWorker = startScoringWorker();
  const emailWorker = startEmailWorker();

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received. Shutting down gracefully...`);

    server.close(() => {
      logger.info('HTTP server closed');
    });

    await scoringWorker.close();
    logger.info('Scoring worker stopped');

    await emailWorker.close();
    logger.info('Email outbox worker stopped');

    await prisma.$disconnect();
    logger.info('Database disconnected');

    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  server.listen(env.PORT, () => {
    logger.info(`🚀 Server running on http://localhost:${env.PORT}`);
    logger.info(`📋 API docs: http://localhost:${env.PORT}/api/v1`);
    logger.info(`🏥 Health: http://localhost:${env.PORT}/healthz`);
    logger.info(`📌 Environment: ${env.NODE_ENV}`);
  });
}

main().catch((err) => {
  logger.error(err, 'Failed to start server');
  process.exit(1);
});
