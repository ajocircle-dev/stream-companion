import phraseData from '../data/pidgin-phrases.json' with { type: 'json' };
import type { Language } from '../detect.js';

/** Translates known Pidgin and English phrases, preferring the longest match. */
export class PidginPhraseProvider {
  private readonly phrases = Object.entries(phraseData);

  supports(source: Language, target: string): boolean {
    return (
      (source === 'pcm' && target === 'en') ||
      (source === 'en' && target === 'pcm')
    );
  }

  translate(
    text: string,
    target: string,
  ): { translated: string; confidence: number } | null {
    if (target !== 'en' && target !== 'pcm') {
      return null;
    }

    const candidates = this.phrases
      .map(([pidgin, english]) =>
        target === 'en'
          ? { source: pidgin, target: english }
          : { source: english, target: pidgin },
      )
      .sort((left, right) => right.source.length - left.source.length);
    let translated = text;
    let matchedPhrase = false;

    for (const phrase of candidates) {
      const expression = new RegExp(
        `\\b${this.escapeRegExp(phrase.source)}\\b`,
        'gi',
      );

      if (expression.test(translated)) {
        matchedPhrase = true;
        translated = translated.replace(expression, phrase.target);
      }
    }

    return matchedPhrase ? { translated, confidence: 0.9 } : null;
  }

  private containsPhrase(text: string, phrase: string): boolean {
    return new RegExp(`\\b${this.escapeRegExp(phrase)}\\b`, 'i').test(text);
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
  }
}
