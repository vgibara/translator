import { Queue } from 'bullmq';
import { connection } from './connection.js';

export const CALLBACK_QUEUE_NAME = 'callback-queue';

export const callbackQueue = new Queue(CALLBACK_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 10, // Plus de tentatives pour les webhooks
    backoff: {
      type: 'exponential',
      delay: 10000, // Commencer par 10s pour laisser respirer le récepteur
    },
    removeOnComplete: true,
  },
});

export interface CallbackJobData {
  url: string;
  apiKey: string;
  payload: {
    status: 'completed' | 'failed';
    data?: any;
    error?: string;
    sourceLang?: string | null;
    targetLang: string;
    metadata?: any;
    timestamp: string;
  };
}

export async function addCallbackJob(data: CallbackJobData) {
  return await callbackQueue.add('send-callback', data);
}
