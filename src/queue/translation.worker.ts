import { Worker, Job } from 'bullmq';
import { connection } from './connection.js';
import { TRANSLATION_QUEUE_NAME, TranslationJobData } from './translation.queue.js';
import { extractStrings, reconstructJson } from '../utils/json-traversal.js';
import { deeplService } from '../services/deepl.service.js';
import { aiService } from '../services/ai.service.js';
import { cacheService } from '../services/cache.service.js';
import { HtmlHandler } from '../utils/html-handler.js';
import { addCallbackJob } from './callback.queue.js';
import { prisma } from '../utils/prisma.js';
import * as deepl from 'deepl-node';
import pino from 'pino';

const logger = pino();

export const translationWorker = new Worker(
  TRANSLATION_QUEUE_NAME,
  async (job: Job<TranslationJobData>) => {
    const { json, constraints, sourceLang, targetLang, callbackUrl, glossaryId, metadata, apiKey } = job.data;
    const dbJobId = metadata?.dbJobId;
    const effectiveSourceLang = sourceLang || 'auto';

    try {
      logger.info({ jobId: job.id, dbJobId }, 'Processing translation job');

      const nodes = extractStrings(json);
      
      // 1. Process HTML and extract all text fragments
      const nodeProcessingMap = new Map<number, { isHtml: boolean; template?: string; fragments: string[] }>();
      const allFragments: string[] = [];

      nodes.forEach((node, nodeIdx) => {
        if (HtmlHandler.isHtml(node.value)) {
          const { template, fragments } = HtmlHandler.extract(node.value);
          nodeProcessingMap.set(nodeIdx, { isHtml: true, template, fragments });
          allFragments.push(...fragments);
        } else {
          nodeProcessingMap.set(nodeIdx, { isHtml: false, fragments: [node.value] });
          allFragments.push(node.value);
        }
      });

      // 2. Fragment fragments into sentences for even more granular caching
      const sentenceToFragmentMap = new Map<number, string[]>(); // fragmentIdx -> sentences
      const allSentences: string[] = [];

      allFragments.forEach((fragment, fragIdx) => {
        const sentences = cacheService.splitIntoSentences(fragment);
        sentenceToFragmentMap.set(fragIdx, sentences);
        allSentences.push(...sentences);
      });

      // 3. Deduplicate sentences
      const uniqueSentences = Array.from(new Set(allSentences));
      
      // 4. Check Cache for sentences
      const cacheMap = await cacheService.getCachedTranslations(
        uniqueSentences,
        effectiveSourceLang,
        targetLang
      );
      
      const missingSentences = uniqueSentences.filter(s => !cacheMap.has(s));
      
      // Calculate stats
      const totalSegments = allSentences.length;
      const cacheHits = allSentences.filter(s => cacheMap.has(s)).length;

      logger.info({ 
        nodes: nodes.length,
        totalSegments,
        cacheHits,
        uniqueSentences: uniqueSentences.length,
        missingSentences: missingSentences.length 
      }, 'Granular HTML-aware cache check completed');

      // 5. Translate missing sentences
      if (missingSentences.length > 0) {
        const CHUNK_SIZE = 50;
        const newTranslations: { sourceText: string; translatedText: string }[] = [];

        for (let i = 0; i < missingSentences.length; i += CHUNK_SIZE) {
          const chunk = missingSentences.slice(i, i + CHUNK_SIZE);
          const translatedChunk = await deeplService.translate(
            chunk,
            sourceLang as deepl.SourceLanguageCode | null,
            targetLang as deepl.TargetLanguageCode,
            glossaryId
          );
          
          chunk.forEach((text, index) => {
            newTranslations.push({
              sourceText: text,
              translatedText: translatedChunk[index]
            });
            cacheMap.set(text, translatedChunk[index]);
          });
        }

        // 6. Save new sentences to cache
        await cacheService.saveTranslations(
          newTranslations.map(t => ({
            ...t,
            sourceLang: effectiveSourceLang,
            targetLang
          }))
        );
      }

      // 7. Reconstruct fragments from sentences
      const translatedFragments = allFragments.map((_, fragIdx) => {
        const sentences = sentenceToFragmentMap.get(fragIdx) || [];
        return sentences.map(s => cacheMap.get(s) || s).join(' ');
      });

      // 8. Reconstruct original nodes (handling HTML)
      let fragPointer = 0;
      const translatedNodesValues = nodes.map((_, nodeIdx) => {
        const proc = nodeProcessingMap.get(nodeIdx)!;
        const nodeFragments = translatedFragments.slice(fragPointer, fragPointer + proc.fragments.length);
        fragPointer += proc.fragments.length;

        if (proc.isHtml && proc.template) {
          return HtmlHandler.restore(proc.template, nodeFragments);
        } else {
          return nodeFragments[0];
        }
      });

      // 9. Apply constraints (AI shortening)
      const processedTexts = await Promise.all(
        translatedNodesValues.map(async (text, index) => {
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
            totalSegments,
            cacheHits,
          },
        });
      }

      // Queue the callback
      await addCallbackJob({
        url: callbackUrl,
        apiKey,
        payload: {
          status: 'completed',
          data: translatedJson,
          sourceLang: sourceLang || 'auto',
          targetLang: targetLang,
          metadata,
          timestamp: new Date().toISOString(),
        },
      });

      logger.info({ jobId: job.id }, 'Translation completed and callback queued');
    } catch (error: any) {
      logger.error({ jobId: job.id, error: error.message }, 'Translation job failed');
      
      const { callbackUrl, apiKey, sourceLang, targetLang, metadata } = job.data;
      const errorDbJobId = metadata?.dbJobId;

      if (errorDbJobId) {
        await prisma.translationJob.update({
          where: { id: errorDbJobId },
          data: {
            status: 'FAILED',
            error: error.message,
          },
        });
      }

      await addCallbackJob({
        url: callbackUrl,
        apiKey,
        payload: {
          status: 'failed',
          error: error.message,
          sourceLang: sourceLang || 'auto',
          targetLang: targetLang || 'unknown',
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