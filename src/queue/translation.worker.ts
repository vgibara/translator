import { Worker, Job } from 'bullmq';
import { connection } from './connection.js';
import { TRANSLATION_QUEUE_NAME, TranslationJobData } from './translation.queue.js';
import { extractStrings, reconstructJson } from '../utils/json-traversal.js';
import { deeplService } from '../services/deepl.service.js';
import { sendCallback, sendErrorCallback } from '../services/callback.service.js';
import * as deepl from 'deepl-node';
import pino from 'pino';

const logger = pino();

export const translationWorker = new Worker(
  TRANSLATION_QUEUE_NAME,
  async (job: Job<TranslationJobData>) => {
    const { json, sourceLang, targetLang, callbackUrl, glossaryId, metadata } = job.data;

    try {
      logger.info({ jobId: job.id }, 'Processing translation job');

      // 1. Extract strings
      const nodes = extractStrings(json);
      const textsToTranslate = nodes.map((n) => n.value);

      // 2. Translate in batches if necessary (DeepL handles large arrays, but we should be mindful)
      // For very massive JSON, we might want to split into chunks of 50 texts.
      const CHUNK_SIZE = 50;
      let translatedTexts: string[] = [];

      for (let i = 0; i < textsToTranslate.length; i += CHUNK_SIZE) {
        const chunk = textsToTranslate.slice(i, i + CHUNK_SIZE);
        const translatedChunk = await deeplService.translate(
          chunk,
          sourceLang as deepl.SourceLanguageCode | null,
          targetLang as deepl.TargetLanguageCode,
          glossaryId
        );
        translatedTexts = translatedTexts.concat(translatedChunk);
      }

      // 3. Reconstruct JSON
      const translatedNodes = nodes.map((node, index) => ({
        path: node.path,
        value: translatedTexts[index],
      }));

      const translatedJson = reconstructJson(json, translatedNodes);

      // 4. Send callback
      await sendCallback(callbackUrl, translatedJson, metadata);

      logger.info({ jobId: job.id }, 'Translation job completed');
    } catch (error: any) {
      logger.error({ jobId: job.id, error: error.message }, 'Translation job failed');
      
      // If it's the last attempt, notify the callback about the failure
      if (job.attemptsMade + 1 >= (job.opts.attempts || 3)) {
        await sendErrorCallback(callbackUrl, error.message, metadata);
      }
      
      throw error; // Let BullMQ handle retries
    }
  },
  { connection, concurrency: 5 }
);

translationWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, 'Job failed permanently');
});
