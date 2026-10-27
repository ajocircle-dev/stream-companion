import glossaryData from '../data/yoruba-glossary.json' with { type: 'json' };
import type { TranslationProvider } from './remote.js';

/** Provides conservative offline English glosses for common Yoruba phrases. */
export class YorubaGlossaryProvider implements TranslationProvider {
  readonly name = 'Yoruba glossary';
  private readonly phrases = Object.entries(glossaryData).sort(
    ([left], [right]) => right.length - left.length,
  );

  async translate(text: string, source: string, target: string) {
    if (source !== 'yo' || target !== 'en') {
      return null;
    }

    const phrase = this.phrases.find(([yoruba]) =>
      text.toLocaleLowerCase().includes(yoruba.toLocaleLowerCase()),
    );

    if (!phrase) {
      return null;
    }

    const [yoruba, english] = phrase;
    const translated = text.replace(
      new RegExp(yoruba.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'), 'i'),
      english,
    );

    return { translated, confidence: 0.3 };
  }
}
