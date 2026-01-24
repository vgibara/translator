import * as deepl from 'deepl-node';
import { env } from '../config/env.js';

export class DeepLService {
  private translator: deepl.Translator;

  constructor() {
    this.translator = new deepl.Translator(env.DEEPL_AUTH_KEY);
  }

  async translate(
    texts: string[],
    sourceLang: deepl.SourceLanguageCode | null,
    targetLang: deepl.TargetLanguageCode,
    glossaryId?: string
  ): Promise<string[]> {
    if (texts.length === 0) return [];

    const results = await this.translator.translateText(
      texts,
      sourceLang,
      targetLang,
      { glossary: glossaryId }
    );

    if (Array.isArray(results)) {
      return results.map((r) => r.text);
    } else {
      return [(results as deepl.TextResult).text];
    }
  }

  async getGlossaries() {
    return await this.translator.listGlossaries();
  }
}

export const deeplService = new DeepLService();
