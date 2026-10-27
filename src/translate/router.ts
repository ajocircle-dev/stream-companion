import type { Language } from './detect.js';
import { detectLanguage } from './detect.js';
import { YorubaGlossaryProvider } from './providers/glossary.js';
import { PidginPhraseProvider } from './providers/pidgin.js';
import {
  LibreTranslateProvider,
  NllbProvider,
  OpenAIProvider,
  type TranslationProvider,
} from './providers/remote.js';

export interface Translation {
  original: string;
  lang: Language;
  translated: string;
  provider: string;
  confidence: number;
}

/** Detects the source language and tries configured translation providers in order. */
export class Translator {
  constructor(
    private readonly providers: TranslationProvider[],
    private readonly pidgin = new PidginPhraseProvider(),
    private readonly yoruba = new YorubaGlossaryProvider(),
  ) {}

  async translate(text: string, target = 'en'): Promise<Translation> {
    const { lang, confidence } = detectLanguage(text);

    if ((lang === 'en' && target === 'en') || lang === target) {
      return {
        original: text,
        lang,
        translated: text,
        provider: 'passthrough',
        confidence: 1,
      };
    }

    if (this.pidgin.supports(lang, target)) {
      const result = this.pidgin.translate(text, target);

      if (result) {
        return {
          original: text,
          lang,
          translated: result.translated,
          provider: 'Pidgin phrases',
          confidence: result.confidence,
        };
      }
    }

    for (const provider of this.providers) {
      const result = await provider.translate(text, lang, target);

      if (result) {
        return {
          original: text,
          lang,
          translated: result.translated,
          provider: provider.name,
          confidence: result.confidence,
        };
      }
    }

    const glossaryResult = await this.yoruba.translate(text, lang, target);

    if (glossaryResult) {
      return {
        original: text,
        lang,
        translated: glossaryResult.translated,
        provider: this.yoruba.name,
        confidence: glossaryResult.confidence,
      };
    }

    return {
      original: text,
      lang,
      translated: text,
      provider: 'unavailable',
      confidence: Math.min(0.25, confidence),
    };
  }

  static fromConfig(config: {
    libreTranslateUrl: string;
    libreTranslateApiKey: string;
    nllbUrl: string;
    openAiEnabled: boolean;
    openAiApiKey: string;
  }): Translator {
    return new Translator([
      new NllbProvider(config.nllbUrl),
      new LibreTranslateProvider(
        config.libreTranslateUrl,
        config.libreTranslateApiKey,
      ),
      new OpenAIProvider(config.openAiEnabled, config.openAiApiKey),
    ]);
  }
}

export type { Language };
