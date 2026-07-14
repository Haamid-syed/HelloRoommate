import Redis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from './logger.js';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on('connect', () => {
  logger.info('✅ Redis connected');
});

redis.on('error', (err) => {
  logger.error({ err }, '❌ Redis connection error');
});

// Create a subscriber connection for Socket.IO adapter
export const createRedisSubscriber = () => {
  const subscriber = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  subscriber.on('error', (err) => {
    logger.error({ err }, '❌ Redis subscriber connection error');
  });

  return subscriber;
};
