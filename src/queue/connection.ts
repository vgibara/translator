import { ConnectionOptions } from 'bullmq';
import { env } from '../config/env.js';

export const connection: ConnectionOptions = {
  url: env.REDIS_URL,
};
