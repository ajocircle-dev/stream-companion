/** Identifies common chat languages with small, explainable lexical heuristics. */
export type Language = 'pcm' | 'yo' | 'fr' | 'es' | 'en' | 'unknown';

const markers: Record<Exclude<Language, 'unknown'>, string[]> = {
  pcm: [
    'how far',
    'wetin',
    'abeg',
    'wahala',
    'e choke',
    'i no fit',
    'na wa',
    'omo',
    'dey',
    'una',
    'abi',
    'sabi',
    'sha',
  ],
  yo: ['ẹ káàrọ̀', 'báwo', 'ẹ ṣé', 'mo fẹ́', 'ọmọ', 'ẹ jọ̀ọ́', 'ṣe'],
  fr: [
    'bonjour',
    'merci',
    'salut',
    'ça',
    'tous',
    'beaucoup',
    'bien',
    'oui',
    'pour',
    'avec',
  ],
  es: ['hola', 'gracias', 'buenos', 'estás', 'vamos', 'por', 'pero', 'muchas'],
  en: ['the', 'and', 'you', 'this', 'is', 'are', 'hello', 'thanks'],
};

/** Returns the best supported language guess and an approximate confidence. */
export function detectLanguage(text: string): {
  lang: Language;
  confidence: number;
} {
  const normalized = text.toLocaleLowerCase();

  if (/[ẹọṣ]/i.test(normalized)) {
    return { lang: 'yo', confidence: 0.92 };
  }

  const yorubaHits = countMarkers(normalized, markers.yo);
  if (yorubaHits > 0) {
    return { lang: 'yo', confidence: 0.78 };
  }

  const pidginHits = countMarkers(normalized, markers.pcm);
  if (pidginHits > 0) {
    return {
      lang: 'pcm',
      confidence: Math.min(0.95, 0.65 + pidginHits * 0.08),
    };
  }

  const frenchHits = countMarkers(normalized, markers.fr);
  if (frenchHits > 0 || /[àâçéèêëîïôùûüÿœ]/i.test(normalized)) {
    return { lang: 'fr', confidence: 0.72 };
  }

  const spanishHits = countMarkers(normalized, markers.es);
  if (spanishHits > 0 || /[¿¡ñ]/i.test(normalized)) {
    return { lang: 'es', confidence: 0.72 };
  }

  if (countMarkers(normalized, markers.en) > 0) {
    return { lang: 'en', confidence: 0.55 };
  }

  return { lang: 'unknown', confidence: 0.2 };
}

function countMarkers(text: string, words: string[]): number {
  return words.reduce((count, word) => {
    const expression = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'i');
    return count + Number(expression.test(text));
  }, 0);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
}
