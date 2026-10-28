/** Covers language heuristics, offline providers, routing, and streamer commands. */
import { describe, expect, it, vi } from 'vitest';
import pidginPhrases from '../src/translate/data/pidgin-phrases.json' with { type: 'json' };
import yorubaGlossary from '../src/translate/data/yoruba-glossary.json' with { type: 'json' };
import { parseReplyCommand } from '../src/chat/commands.js';
import { detectLanguage } from '../src/translate/detect.js';
import { PidginPhraseProvider } from '../src/translate/providers/pidgin.js';
import {
  LibreTranslateProvider,
  NllbProvider,
  OpenAIProvider,
  type TranslationProvider,
} from '../src/translate/providers/remote.js';
import { Translator } from '../src/translate/router.js';

describe('language detection', () => {
  it('detects Nigerian Pidgin phrases', () => {
    expect(detectLanguage('Wetin dey happen?').lang).toBe('pcm');
  });

  it('detects Yoruba using diacritics', () => {
    expect(detectLanguage('Ẹ káàrọ̀, ẹ ṣé').lang).toBe('yo');
    expect(detectLanguage('ọmọ náà').lang).toBe('yo');
  });

  it('detects French chat', () => {
    expect(detectLanguage('Bonjour, merci à tous!').lang).toBe('fr');
  });

  it('detects English chat', () => {
    expect(detectLanguage('Thanks for the great game').lang).toBe('en');
  });

  it('returns unknown for text without useful language clues', () => {
    expect(detectLanguage('!!!').lang).toBe('unknown');
  });
});

describe('PidginPhraseProvider', () => {
  const provider = new PidginPhraseProvider();

  it('translates a Pidgin phrase to English without case sensitivity', () => {
    expect(provider.translate('HOW FAR?', 'en')?.translated).toBe(
      'how are you?',
    );
  });

  it('uses longest-match-first for overlapping Pidgin phrases', () => {
    expect(provider.translate('wetin dey happen', 'en')?.translated).toBe(
      'what is happening',
    );
  });

  it('translates an English phrase back to Pidgin', () => {
    expect(provider.translate('Please, no problem', 'pcm')?.translated).toBe(
      'abeg, no wahala',
    );
  });

  it('supports phrases embedded in surrounding text', () => {
    expect(provider.translate('Omo, that was close!', 'en')?.translated).toBe(
      'wow, that was close!',
    );
  });

  it('contains at least sixty offline phrase pairs', () => {
    expect(Object.keys(pidginPhrases).length).toBeGreaterThanOrEqual(120);
  });
});

describe('Translator routing', () => {
  it('passes English through unchanged', async () => {
    const result = await new Translator([]).translate('Thanks for the game');

    expect(result).toMatchObject({
      lang: 'en',
      translated: 'Thanks for the game',
      provider: 'passthrough',
      confidence: 1,
    });
  });

  it('falls back to the Yoruba glossary when remote providers are unconfigured', async () => {
    const translator = Translator.fromConfig({
      libreTranslateUrl: '',
      libreTranslateApiKey: '',
      nllbUrl: '',
      openAiEnabled: false,
      openAiApiKey: '',
    });
    const result = await translator.translate('Ẹ ṣé');

    expect(result).toMatchObject({
      lang: 'yo',
      translated: 'thank you',
      provider: 'Yoruba glossary',
    });
  });

  it('returns the original text when the configured provider chain has no match', async () => {
    const result = await new Translator([]).translate('Bonjour');

    expect(result).toMatchObject({
      lang: 'fr',
      translated: 'Bonjour',
      provider: 'unavailable',
    });
  });

  it('uses the phrase list to translate an English streamer reply to Pidgin', async () => {
    const result = await new Translator([]).translate('thank you all', 'pcm');

    expect(result).toMatchObject({ lang: 'en', translated: 'una too much' });
  });

  it('uses LibreTranslate after a healthy language-list check', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ code: 'en' }, { code: 'fr' }]), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ translatedText: 'Hello everyone' }), {
          status: 200,
        }),
      );
    const provider = new LibreTranslateProvider('http://lt.test:5000');

    const result = await provider.translate(
      'Bonjour tout le monde',
      'fr',
      'en',
    );
    const requestBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));

    expect(result).toEqual({ translated: 'Hello everyone', confidence: 0.75 });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://lt.test:5000/languages');
    expect(requestBody).toMatchObject({ source: 'fr', target: 'en' });
    expect(await provider.healthCheck()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockRestore();
  });

  it('caches LibreTranslate health results for thirty seconds', async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () =>
        fetchMock.mock.calls.length === 1
          ? new Response(JSON.stringify([{ code: 'en' }]), { status: 200 })
          : new Response('unavailable', { status: 503 }),
      );
    const provider = new LibreTranslateProvider('http://lt.test');

    expect(await provider.healthCheck()).toBe(true);
    expect(await provider.healthCheck()).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(30_001);
    expect(await provider.healthCheck()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockRestore();
    vi.useRealTimers();
  });

  it('routes LibreTranslate language codes for French, Spanish, German, and Portuguese', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        const url = String(input);
        return url.endsWith('/languages')
          ? new Response(JSON.stringify([{ code: 'en' }]), { status: 200 })
          : new Response(JSON.stringify({ translatedText: 'translated' }), {
              status: 200,
            });
      });
    const provider = new LibreTranslateProvider('http://lt.test');

    for (const language of ['fr', 'es', 'de', 'pt']) {
      await provider.translate('Thanks', 'en', language);
    }

    const requestBodies = fetchMock.mock.calls
      .filter(([input]) => !String(input).endsWith('/languages'))
      .map(([, init]) => JSON.parse(String(init?.body)));

    expect(requestBodies.map((body) => body.target)).toEqual([
      'fr',
      'es',
      'de',
      'pt',
    ]);
    fetchMock.mockRestore();
  });

  it('falls through to the next provider when LibreTranslate health check fails', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('unavailable', { status: 503 }));
    const fallback: TranslationProvider = {
      name: 'Fallback',
      translate: vi.fn(async () => ({
        translated: 'Fallback text',
        confidence: 0.4,
      })),
    };
    const result = await new Translator([
      new LibreTranslateProvider('http://lt.test'),
      fallback,
    ]).translate('Bonjour');

    expect(result).toMatchObject({
      translated: 'Fallback text',
      provider: 'Fallback',
    });
    expect(fallback.translate).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    fetchMock.mockRestore();
  });

  it('uses the mocked local NLLB endpoint for Yoruba-English in both directions', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ translation: 'Good morning' }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ translation: 'Ẹ káàrọ̀' }), {
          status: 200,
        }),
      );
    const provider = new NllbProvider('http://127.0.0.1:5001/translate');

    const toEnglish = await provider.translate('Ẹ káàrọ̀', 'yo', 'en');
    const toYoruba = await provider.translate('Good morning', 'en', 'yo');
    const requests = fetchMock.mock.calls.map(([, init]) =>
      JSON.parse(String(init?.body)),
    );

    expect(toEnglish?.translated).toBe('Good morning');
    expect(toYoruba?.translated).toBe('Ẹ káàrọ̀');
    expect(requests).toEqual([
      { text: 'Ẹ káàrọ̀', source_lang: 'yor_Latn', target_lang: 'eng_Latn' },
      {
        text: 'Good morning',
        source_lang: 'eng_Latn',
        target_lang: 'yor_Latn',
      },
    ]);
    fetchMock.mockRestore();
  });

  it('falls back to the Yoruba glossary when local NLLB is down', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('connection refused'));
    const result = await new Translator([
      new NllbProvider('http://127.0.0.1:5001/translate'),
    ]).translate('Ẹ ṣé');

    expect(result).toMatchObject({
      translated: 'thank you',
      provider: 'Yoruba glossary',
    });
    fetchMock.mockRestore();
  });

  it('keeps the optional OpenAI provider inactive without an explicit opt-in', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const result = await new OpenAIProvider(false, 'unused-key').translate(
      'Bonjour',
      'fr',
      'en',
    );

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it('routes English streamer replies through Pidgin, NLLB, and LibreTranslate', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.endsWith('/languages')) {
          return new Response(
            JSON.stringify([{ code: 'en' }, { code: 'fr' }]),
            {
              status: 200,
            },
          );
        }

        const body = JSON.parse(String(init?.body));
        return new Response(
          JSON.stringify(
            body.source_lang
              ? { translation: 'Ẹ káàrọ̀' }
              : { translatedText: `${body.target} reply` },
          ),
          { status: 200 },
        );
      });
    const translator = new Translator([
      new NllbProvider('http://nllb.test/translate'),
      new LibreTranslateProvider('http://lt.test'),
    ]);

    const pidginReply = await translator.translate('thank you all', 'pcm');
    const yorubaReply = await translator.translate('Good morning', 'yo');
    const frenchReply = await translator.translate('Thank you all', 'fr');
    const spanishReply = await translator.translate('Thank you all', 'es');

    expect(pidginReply).toMatchObject({
      translated: 'una too much',
      provider: 'Pidgin phrases',
    });
    expect(yorubaReply).toMatchObject({
      translated: 'Ẹ káàrọ̀',
      provider: 'NLLB',
    });
    expect(frenchReply).toMatchObject({
      translated: 'fr reply',
      provider: 'LibreTranslate',
    });
    expect(spanishReply).toMatchObject({
      translated: 'es reply',
      provider: 'LibreTranslate',
    });
    fetchMock.mockRestore();
  });

  it('keeps at least twenty-five Yoruba glossary phrases available offline', () => {
    expect(Object.keys(yorubaGlossary).length).toBeGreaterThanOrEqual(25);
  });

  it('does not call LibreTranslate when its URL is missing', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const result = await new LibreTranslateProvider('').translate(
      'Bonjour',
      'fr',
      'en',
    );

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });
});

describe('!reply command parser', () => {
  it('parses a target language and keeps the full message text', () => {
    expect(parseReplyCommand('!reply fr Merci à tous')).toEqual({
      language: 'fr',
      text: 'Merci à tous',
    });
  });

  it('normalizes the target code and trims the reply text', () => {
    expect(parseReplyCommand('!REPLY PCM   thank you all  ')).toEqual({
      language: 'pcm',
      text: 'thank you all',
    });
  });

  it('rejects commands with missing language or text', () => {
    expect(parseReplyCommand('!reply fr')).toBeNull();
    expect(parseReplyCommand('!reply')).toBeNull();
  });
});
