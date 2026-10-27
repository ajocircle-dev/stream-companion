/** Defines optional HTTP translation providers, all disabled without configuration. */
export interface TranslationProvider {
  readonly name: string;
  translate(
    text: string,
    source: string,
    target: string,
  ): Promise<{ translated: string; confidence: number } | null>;
}

/** Sends translations to a self-hosted LibreTranslate server when configured. */
export class LibreTranslateProvider implements TranslationProvider {
  readonly name = 'LibreTranslate';

  constructor(
    private readonly url: string,
    private readonly apiKey = '',
  ) {}

  async translate(text: string, source: string, target: string) {
    if (!this.url) {
      return null;
    }

    try {
      const response = await fetch(`${this.url.replace(/\/$/, '')}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: text,
          source: source === 'pcm' ? 'en' : source,
          target,
          format: 'text',
          ...(this.apiKey ? { api_key: this.apiKey } : {}),
        }),
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as { translatedText?: string };
      return data.translatedText
        ? { translated: data.translatedText, confidence: 0.7 }
        : null;
    } catch {
      return null;
    }
  }
}

/** Calls a compatible local NLLB endpoint for Yoruba language pairs. */
export class NllbProvider implements TranslationProvider {
  readonly name = 'NLLB';

  constructor(private readonly url: string) {}

  async translate(text: string, source: string, target: string) {
    if (!this.url || (source !== 'yo' && target !== 'yo')) {
      return null;
    }

    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Endpoint shape: request {text, source_lang, target_lang}; response {translation}.
        body: JSON.stringify({
          text,
          source_lang: source,
          target_lang: target,
        }),
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as { translation?: string };
      return data.translation
        ? { translated: data.translation, confidence: 0.55 }
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
