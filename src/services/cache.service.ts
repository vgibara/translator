import { prisma } from '../utils/prisma.js';
import crypto from 'crypto';

export interface TranslationCacheItem {
  sourceText: string;
  sourceLang: string;
  targetLang: string;
  translatedText: string;
}

export class CacheService {
  private getHash(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  /**
   * Splits a text into sentences to improve cache hits.
   * Only splits if text is long enough.
   */
  splitIntoSentences(text: string): string[] {
    if (text.length < 100) return [text];
    
    // Simple but effective sentence splitter regex
    // Splits on . ! ? followed by space and capital letter, while trying to ignore common abbreviations
    const sentences = text.match(/[^.!?]+[.!?]+(?=\s|[A-Z]|$)/g);
    
    if (!sentences || sentences.length <= 1) return [text];
    return sentences.map(s => s.trim());
  }

  async getCachedTranslations(
    texts: string[],
    sourceLang: string,
    targetLang: string
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    if (texts.length === 0) return results;

    const hashes = texts.map((t) => this.getHash(t));

    const cachedEntries = await prisma.translationCache.findMany({
      where: {
        sourceHash: { in: hashes },
        sourceLang,
        targetLang,
      },
    });

    for (const entry of cachedEntries) {
      results.set(entry.sourceText, entry.translatedText);
    }

    return results;
  }

  async saveTranslations(items: TranslationCacheItem[]): Promise<void> {
    if (items.length === 0) return;

    const data = items.map((item) => ({
      sourceHash: this.getHash(item.sourceText),
      sourceText: item.sourceText,
      sourceLang: item.sourceLang,
      targetLang: item.targetLang,
      translatedText: item.translatedText,
    }));

    // We use createMany with skipDuplicates to avoid errors if another worker 
    // saved the same translation in the meantime
    await prisma.translationCache.createMany({
      data,
      skipDuplicates: true,
    });
  }
}

export const cacheService = new CacheService();
