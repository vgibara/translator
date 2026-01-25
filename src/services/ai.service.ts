import OpenAI from 'openai';
import { env } from '../config/env.js';
import pino from 'pino';

const logger = pino();

export class AIService {
  private openai?: OpenAI;

  constructor() {
    if (env.AI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: env.AI_API_KEY,
        baseURL: env.AI_BASE_URL,
      });
    }
  }

  async shortenText(text: string, maxLength: number, language: string): Promise<string> {
    if (!this.openai) {
      logger.warn('AI_API_KEY not set, skipping shortening');
      return text;
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: env.AI_MODEL,
        messages: [
          {
            role: 'system',
            content: `You are a professional editor. Your task is to shorten the provided text in ${language} to be under ${maxLength} characters (including spaces). 
            Maintain the original tone and meaning as much as possible. 
            Output ONLY the shortened text, no explanations, no quotes.`,
          },
          {
            role: 'user',
            content: text,
          },
        ],
        temperature: 0.3,
      });

      const shortened = response.choices[0]?.message?.content?.trim() || text;
      
      // Safety check: if AI fails to respect length, we truncate (fallback)
      if (shortened.length > maxLength) {
        return shortened.substring(0, maxLength - 3) + '...';
      }

      return shortened;
    } catch (error: any) {
      logger.error({ error: error.message }, 'AI Shortening failed');
      return text.substring(0, maxLength); // Fallback brute
    }
  }
}

export const aiService = new AIService();
