import { ConnectionOptions } from 'bullmq';
import { env } from '../config/env.js';

const redisUrl = new URL(env.REDIS_URL);

export const connection: ConnectionOptions = {
  host: redisUrl.hostname,
  port: parseInt(redisUrl.port),
  password: decodeURIComponent(redisUrl.password),
  username: redisUrl.username || undefined,
  // DO Managed Redis requires TLS
  ...(env.REDIS_URL.startsWith('rediss://')
    ? {
        tls: {
          rejectUnauthorized: false,
        },
      }
    : {}),
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  connectTimeout: 20000, // Increase to 20s for DO private network
};




