/** Defines optional HTTP translation providers, all disabled without configuration. */
export interface TranslationProvider {
  readonly name: string;
  translate(
    text: string,
    source: string,
    target: string,
  ): Promise<{ translated: string; confidence: number } | null>;
}

/** Sends translations to LibreTranslate after a cached local health check. */
export class LibreTranslateProvider implements TranslationProvider {
  readonly name = 'LibreTranslate';
  private healthCache?: { healthy: boolean; checkedAt: number };
  private readonly healthCacheMs = 30_000;

  constructor(
    private readonly url: string,
    private readonly apiKey = '',
  ) {}

  async healthCheck(): Promise<boolean> {
    if (!this.url) {
      return false;
    }

    const now = Date.now();
    if (
      this.healthCache &&
      now - this.healthCache.checkedAt < this.healthCacheMs
    ) {
      return this.healthCache.healthy;
    }

    let healthy = false;
    try {
      const response = await fetch(`${this.url.replace(/\/$/, '')}/languages`, {
        signal: AbortSignal.timeout(4000),
      });
      if (response.ok) {
        const languages = (await response.json()) as unknown;
        healthy = Array.isArray(languages) && languages.length > 0;
      }
    } catch {
      healthy = false;
    }

    this.healthCache = { healthy, checkedAt: now };
    return healthy;
  }

  async translate(text: string, source: string, target: string) {
    if (!(await this.healthCheck())) {
      return null;
    }

    try {
      const response = await fetch(`${this.url.replace(/\/$/, '')}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          q: text,
          source: mapLibreLanguage(source),
          target: mapLibreLanguage(target),
          format: 'text',
          ...(this.apiKey ? { api_key: this.apiKey } : {}),
        }),
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as { translatedText?: string };
      return data.translatedText
        ? { translated: data.translatedText, confidence: 0.75 }
        : null;
    } catch {
      return null;
    }
  }
}

const libreLanguageCodes: Record<string, string> = {
  pcm: 'en',
  en: 'en',
  fr: 'fr',
  es: 'es',
  de: 'de',
  pt: 'pt',
};

function mapLibreLanguage(language: string): string {
  const normalized = language.toLocaleLowerCase();
  return libreLanguageCodes[normalized] ?? normalized;
}

/** Calls a compatible local NLLB endpoint for Yoruba and English pairs. */
export class NllbProvider implements TranslationProvider {
  readonly name = 'NLLB';
  private readonly languageCodes: Record<string, string> = {
    yo: 'yor_Latn',
    en: 'eng_Latn',
  };

  constructor(private readonly url: string) {}

  async translate(text: string, source: string, target: string) {
    const sourceCode = this.languageCodes[source];
    const targetCode = this.languageCodes[target];
    const isYorubaPair =
      (source === 'yo' && target === 'en') ||
      (source === 'en' && target === 'yo');

    if (!this.url || !isYorubaPair || !sourceCode || !targetCode) {
      return null;
    }

    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          text,
          source_lang: sourceCode,
          target_lang: targetCode,
        }),
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as { translation?: string };
      return data.translation
        ? { translated: data.translation, confidence: 0.75 }
        : null;
    } catch {
      return null;
    }
  }
}

/** Uses OpenAI chat completions only when explicitly enabled and keyed. */
export class OpenAIProvider implements TranslationProvider {
  readonly name = 'OpenAI';

  constructor(
    private readonly enabled: boolean,
    private readonly key: string,
  ) {}

  async translate(text: string, source: string, target: string) {
    if (!this.enabled || !this.key) {
      return null;
    }

    try {
      const response = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: `Translate from ${source} to ${target}. Return translation only.`,
              },
              { role: 'user', content: text },
            ],
          }),
        },
      );

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const translated = data.choices?.[0]?.message?.content?.trim();
      return translated ? { translated, confidence: 0.7 } : null;
    } catch {
      return null;
    }
  }
}
