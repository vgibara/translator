import { Worker, Job } from 'bullmq';
import { connection } from './connection.js';
import { TRANSLATION_QUEUE_NAME, TranslationJobData } from './translation.queue.js';
import { extractStrings, reconstructJson } from '../utils/json-traversal.js';
import { deeplService } from '../services/deepl.service.js';
import { aiService } from '../services/ai.service.js';
import { addCallbackJob } from './callback.queue.js';
import { prisma } from '../utils/prisma.js';
import * as deepl from 'deepl-node';
import pino from 'pino';

const logger = pino();

export const translationWorker = new Worker(
  TRANSLATION_QUEUE_NAME,
  async (job: Job<TranslationJobData>) => {
    const { json, constraints, sourceLang, targetLang, callbackUrl, glossaryId, metadata } = job.data;
    const dbJobId = metadata?.dbJobId;

    try {
      logger.info({ jobId: job.id, dbJobId }, 'Processing translation job');

      const nodes = extractStrings(json);
      const textsToTranslate = nodes.map((n) => n.value);

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

      const processedTexts = await Promise.all(
        translatedTexts.map(async (text, index) => {
          const pathString = nodes[index].path.join('.');
          const maxLength = constraints?.[pathString];

          if (maxLength && text.length > maxLength) {
            logger.info({ path: pathString, length: text.length, maxLength }, 'Text exceeds limit, shortening via AI...');
            return await aiService.shortenText(text, maxLength, targetLang);
          }
          return text;
        })
      );

      const translatedNodes = nodes.map((node, index) => ({
        path: node.path,
        value: processedTexts[index],
      }));

      const translatedJson = reconstructJson(json, translatedNodes);

      // Update PostgreSQL
      if (dbJobId) {
        await prisma.translationJob.update({
          where: { id: dbJobId },
          data: {
            status: 'COMPLETED',
            outputJson: translatedJson,
          },
        });
      }

      // Queue the callback
      await addCallbackJob({
        url: callbackUrl,
        payload: {
          status: 'completed',
          data: translatedJson,
          metadata,
          timestamp: new Date().toISOString(),
        },
      });

      logger.info({ jobId: job.id }, 'Translation completed and callback queued');
    } catch (error: any) {
      logger.error({ jobId: job.id, error: error.message }, 'Translation job failed');
      
      if (dbJobId) {
        await prisma.translationJob.update({
          where: { id: dbJobId },
          data: {
            status: 'FAILED',
            error: error.message,
          },
        });
      }

      await addCallbackJob({
        url: callbackUrl,
        payload: {
          status: 'failed',
          error: error.message,
          metadata,
          timestamp: new Date().toISOString(),
        },
      });
      
      throw error;
    }
  },

  { connection, concurrency: 5 }
);

translationWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, 'Job failed permanently');
});
