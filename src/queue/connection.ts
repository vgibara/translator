import { ConnectionOptions } from 'bullmq';
import { env } from '../config/env.js';

export const connection: ConnectionOptions = {
  url: env.REDIS_URL,
  // Digital Ocean Managed Redis and other providers often require TLS
  ...(env.REDIS_URL.startsWith('rediss://')
    ? {
        redis: {
          tls: {
            rejectUnauthorized: false, // Useful for self-signed or internal DO certificates
          },
        },
      }
    : {}),
};

