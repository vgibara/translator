import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { addTranslationJob } from '../queue/translation.queue.js';
import { authService } from '../services/auth.service.js';
import { prisma } from '../utils/prisma.js';

const translateSchema = z.object({
  json: z.any(),
  constraints: z.record(z.string(), z.number()).optional(),
  sourceLang: z.string().nullable().optional(),
  targetLang: z.string(),
  callbackUrl: z.string().url(),
  glossaryId: z.string().optional(),
  metadata: z.any().optional(),
});

export async function translationRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
  fastify.post('/translate', async (request, reply) => {
    const apiKey = request.headers['x-api-key'] as string;

    if (!apiKey) {
      return reply.status(401).send({ error: 'Missing API Key' });
    }

    const user = await authService.validateApiKey(apiKey);
    if (!user) {
      return reply.status(401).send({ error: 'Invalid API Key' });
    }

    const parseResult = translateSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Invalid request body',
        details: parseResult.error.format(),
      });
    }

    const { json, constraints, sourceLang, targetLang, callbackUrl, glossaryId, metadata } = parseResult.data;

    // 1. Create permanent record in PostgreSQL
    const dbJob = await prisma.translationJob.create({
      data: {
        userId: user.id,
        status: 'PENDING',
        sourceLang: sourceLang || null,
        targetLang,
        callbackUrl,
        inputJson: json,
        metadata,
      },
    });

    // 2. Add to BullMQ with the DB ID
    const job = await addTranslationJob({
      userId: user.id,
      apiKey,
      json,
      constraints,
      sourceLang,
      targetLang,
      callbackUrl,
      glossaryId,
      metadata: { ...metadata, dbJobId: dbJob.id },
    });

    // 3. Update DB with BullMQ ID
    await prisma.translationJob.update({
      where: { id: dbJob.id },
      data: { bullJobId: job.id },
    });

    return {
      message: 'Translation job queued',
      jobId: job.id,
      trackingId: dbJob.id,
    };
  });


  fastify.get('/health', async () => {
    return { status: 'ok' };
  });
}
