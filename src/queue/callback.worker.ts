import { Worker, Job } from 'bullmq';
import { connection } from './connection.js';
import { CALLBACK_QUEUE_NAME, CallbackJobData } from './callback.queue.js';
import axios from 'axios';
import pino from 'pino';

const logger = pino();

export const callbackWorker = new Worker(
  CALLBACK_QUEUE_NAME,
  async (job: Job<CallbackJobData>) => {
    const { url, payload } = job.data;
    
    try {
      await axios.post(url, payload);
      logger.info({ url, jobId: job.id }, 'Callback delivered successfully');
    } catch (error: any) {
      const status = error.response?.status;
      logger.error({ url, status, error: error.message }, 'Callback delivery failed');
      
      // Si c'est un 429, on peut logger spécifiquement
      if (status === 429) {
        logger.warn('Rate limit hit on callback URL, retrying later...');
      }
      
      throw error; // BullMQ gérera le retry exponentiel
    }
  },
  { connection, concurrency: 10 }
);
