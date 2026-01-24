import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { addTranslationJob } from '../queue/translation.queue.js';

const translateSchema = z.object({
  json: z.any(),
  sourceLang: z.string().nullable().optional(),
  targetLang: z.string(),
  callbackUrl: z.string().url(),
  glossaryId: z.string().optional(),
  metadata: z.any().optional(),
});

export async function translationRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
  fastify.post('/translate', async (request, reply) => {
    const parseResult = translateSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: parseResult.error.format(),
      });
    }

    const job = await addTranslationJob(parseResult.data);

    return {
      message: 'Translation job queued',
      jobId: job.id,
    };
  });

  fastify.get('/health', async () => {
    return { status: 'ok' };
  });
}
