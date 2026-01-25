import { ConnectionOptions } from 'bullmq';
import { env } from '../config/env.js';

export const connection: ConnectionOptions = {
  url: env.REDIS_URL,
  // DO Managed Redis requires specific ioredis settings
  ...(env.REDIS_URL.startsWith('rediss://')
    ? {
        tls: {
          rejectUnauthorized: false,
        },
      }
    : {}),
  maxRetriesPerRequest: null,
  enableReadyCheck: false, // Recommended for some Redis providers
  connectTimeout: 15000,
  retryStrategy(times) {
    return Math.min(times * 500, 2000);
  },
};



