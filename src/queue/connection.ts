import { ConnectionOptions } from 'bullmq';
import { env } from '../config/env.js';

export const connection: ConnectionOptions = {
  url: env.REDIS_URL,
  // DO Managed Redis requires TLS and specific options for BullMQ/ioredis
  ...(env.REDIS_URL.startsWith('rediss://')
    ? {
        tls: {
          rejectUnauthorized: false,
        },
      }
    : {}),
  maxRetriesPerRequest: null,
  connectTimeout: 10000, // 10 seconds timeout
};


