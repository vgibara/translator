import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3000').transform(Number),
  DEEPL_AUTH_KEY: z.string(),
  REDIS_URL: z.string().url().transform(v => v.trim()),
  DATABASE_URL: z.string().url(),
  CALLBACK_RETRY_LIMIT: z.string().default('5').transform(Number),
  TRANSLATION_RETRY_LIMIT: z.string().default('3').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('llama-3.3-70b-versatile'),
  AI_BASE_URL: z.string().default('https://api.groq.com/openai/v1'),
  ADMIN_API_KEY: z.string().default('admin-secret-change-me'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  SESSION_SECRET: z.string().default('a-very-long-and-secure-session-secret-key'),
  BASE_URL: z.string().default('http://localhost:3000'),
});




export const env = envSchema.parse(process.env);
