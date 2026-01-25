import Fastify from 'fastify';
import { env } from './config/env.js';
import { translationRoutes } from './routes/translate.js';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter } from '@bull-board/fastify';
import { translationQueue } from './queue/translation.queue.js';
import { callbackQueue } from './queue/callback.queue.js';

const logger = pino({
  transport: {
    target: 'pino-pretty',
  },
});

const fastify = Fastify({
  logger: {
    transport: env.NODE_ENV === 'development' ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
      },
    } : undefined,
  },
});

const serverAdapter = new FastifyAdapter();

createBullBoard({
  queues: [
    new BullMQAdapter(translationQueue),
    new BullMQAdapter(callbackQueue),
  ],
  serverAdapter,
});

serverAdapter.setBasePath('/admin/queues');

async function start() {
  try {
    // Test Redis connection (non-blocking)
    translationQueue.client.then(() => {
      console.log('Successfully connected to Redis');
    }).catch(err => {
      console.error('Redis connection error:', err.message);
    });

    // Register routes
    await fastify.register(translationRoutes);

    await fastify.register(serverAdapter.registerPlugin(), { prefix: '/admin/queues' });

    await fastify.listen({ port: env.PORT, host: '0.0.0.0' });
    console.log(`Server listening on http://localhost:${env.PORT}`);
    console.log(`Dashboard available at http://localhost:${env.PORT}/admin/queues`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
