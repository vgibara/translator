import { Queue } from 'bullmq';
import { connection } from './connection.js';

export const TRANSLATION_QUEUE_NAME = 'translation-queue';

export const translationQueue = new Queue(TRANSLATION_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: true,
  },
});

export interface TranslationJobData {
  userId: string;
  json: any;
  constraints?: Record<string, number>;
 // Path -> MaxLength
  sourceLang?: string | null;

  targetLang: string;
  callbackUrl: string;
  glossaryId?: string;
  metadata?: any;
}

export async function addTranslationJob(data: TranslationJobData) {
  return await translationQueue.add('translate', data);
}
