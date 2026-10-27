/** Covers language heuristics, offline providers, routing, and streamer commands. */
import { describe, expect, it, vi } from 'vitest';
import pidginPhrases from '../src/translate/data/pidgin-phrases.json' with { type: 'json' };
import yorubaGlossary from '../src/translate/data/yoruba-glossary.json' with { type: 'json' };
import { parseReplyCommand } from '../src/chat/commands.js';
import { detectLanguage } from '../src/translate/detect.js';
import { PidginPhraseProvider } from '../src/translate/providers/pidgin.js';
import { LibreTranslateProvider } from '../src/translate/providers/remote.js';
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
    expect(Object.keys(pidginPhrases).length).toBeGreaterThanOrEqual(60);
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
