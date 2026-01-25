import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3000').transform(Number),
  DEEPL_AUTH_KEY: z.string(),
  REDIS_URL: z.string().url().transform(v => v.trim()),
  CALLBACK_RETRY_LIMIT: z.string().default('5').transform(Number),
  TRANSLATION_RETRY_LIMIT: z.string().default('3').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export const env = envSchema.parse(process.env);
