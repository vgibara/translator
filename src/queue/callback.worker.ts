import { Worker, Job } from 'bullmq';
import { connection } from './connection.js';
import { CALLBACK_QUEUE_NAME, CallbackJobData } from './callback.queue.js';
import { prisma } from '../utils/prisma.js';
import axios from 'axios';
import pino from 'pino';

const logger = pino();

export const callbackWorker = new Worker(
  CALLBACK_QUEUE_NAME,
  async (job: Job<CallbackJobData>) => {
    const { url, payload } = job.data;
    const dbJobId = (payload.metadata as any)?.dbJobId;
    
    try {
      const response = await axios.post(url, payload);
      
      if (dbJobId) {
        await prisma.callbackLog.create({
          data: {
            jobId: dbJobId,
            status: response.status,
            response: JSON.stringify(response.data).substring(0, 1000),
          }
        });
      }

      logger.info({ url, jobId: job.id }, 'Callback delivered successfully');
    } catch (error: any) {
      const status = error.response?.status || 0;
      
      if (dbJobId) {
        await prisma.callbackLog.create({
          data: {
            jobId: dbJobId,
            status: status,
            error: error.message,
            response: error.response?.data ? JSON.stringify(error.response.data).substring(0, 1000) : undefined,
          }
        });
      }

      logger.error({ url, status, error: error.message }, 'Callback delivery failed');
      throw error;
    }
  },
  { connection, concurrency: 10 }
);
