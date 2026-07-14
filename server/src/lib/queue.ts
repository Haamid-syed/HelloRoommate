import { Queue, type ConnectionOptions } from 'bullmq';
import { redis } from './redis.js';

export interface ScoringJobData {
  tenantProfileId: string;
  listingId: string;
}

export const SCORING_JOB_NAME = 'score-pair';

export const scoringQueue = new Queue<ScoringJobData, void, typeof SCORING_JOB_NAME>('scoring-queue', {
  // BullMQ's bundled ioredis declaration differs from the workspace declaration.
  // Both represent the same existing Redis client at runtime.
  connection: redis as unknown as ConnectionOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});
