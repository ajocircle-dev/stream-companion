/** Covers steady-state scoring, spike thresholds, cooldowns, and EWMA decay. */
import { describe, expect, it } from 'vitest';
import { HypeDetector } from '../src/hype/detector.js';
import type { ChatMessage } from '../src/twitch/types.js';

function message(
  text: string,
  timestamp: number,
  emotes: string[] = [],
): ChatMessage {
  return {
    id: `${timestamp}-${Math.random()}`,
    user: 'viewer',
    text,
    emotes,
    ts: timestamp,
  };
}

describe('HypeDetector', () => {
  it('does not spike during steady low-rate chat', () => {
    const detector = new HypeDetector({ floor: 8 });
    const results = Array.from({ length: 20 }, (_, index) =>
      detector.ingest(message('Nice gameplay', index * 1000)),
    );

    expect(results.some((result) => result.spike)).toBe(false);
  });

  it('does not spike on steady chat at a moderate three-message-per-second rate', () => {
    const detector = new HypeDetector();
    const results = Array.from({ length: 90 }, (_, index) =>
      detector.ingest(message('Nice gameplay', index * 333)),
    );

    expect(results.some((result) => result.spike)).toBe(false);
  });

  it('spikes when several hype messages arrive within one second', () => {
    const detector = new HypeDetector({ floor: 8 });
    const results = Array.from({ length: 5 }, (_, index) =>
      detector.ingest(message('W POG', 60_000, ['pog'])),
    );

    expect(results.at(-1)?.score).toBeGreaterThan(8);
    expect(results.some((result) => result.spike)).toBe(true);
  });

  it('lets a second burst spike after fifteen seconds with the default cooldown', () => {
    const detector = new HypeDetector();
    const firstBurst = Array.from({ length: 5 }, (_, index) =>
      detector.ingest(message('W POG KEKW', 1_000 + index * 100, ['PogChamp'])),
    );
    const secondBurst = Array.from({ length: 5 }, (_, index) =>
      detector.ingest(
        message('W POG KEKW', 16_000 + index * 100, ['PogChamp']),
      ),
    );

    expect(firstBurst.some((result) => result.spike)).toBe(true);
    expect(secondBurst.some((result) => result.spike)).toBe(true);
  });

  it('suppresses a second burst that occurs inside the default cooldown', () => {
    const detector = new HypeDetector();
    const firstBurst = Array.from({ length: 5 }, (_, index) =>
      detector.ingest(message('W POG KEKW', 1_000 + index * 100, ['PogChamp'])),
    );
    const secondBurst = Array.from({ length: 5 }, (_, index) =>
      detector.ingest(message('W POG KEKW', 9_000 + index * 100, ['PogChamp'])),
    );

    expect(firstBurst.some((result) => result.spike)).toBe(true);
    expect(secondBurst.some((result) => result.spike)).toBe(false);
  });

  it('spikes on a dense keyword and emote burst straddling a second boundary', () => {
    const detector = new HypeDetector();
    const results = Array.from({ length: 8 }, (_, index) =>
      detector.ingest(
        message(
          'W POG LUL',
          index < 3 ? 1_990 + index * 4 : 2_001 + (index - 3),
          ['PogChamp'],
        ),
      ),
    );

    expect(results.at(-1)?.score).toBeGreaterThanOrEqual(8);
    expect(results.some((result) => result.spike)).toBe(true);
    expect(results.at(-1)?.messages).toHaveLength(8);
  });

  it('decays the EWMA baseline through empty seconds', () => {
    const detector = new HypeDetector({ floor: 100 });
    detector.ingest(message('hello', 1000));
    const recent = detector.snapshot(2000).baseline;
    const quiet = detector.snapshot(32_000).baseline;

    expect(quiet).toBeLessThan(recent);
  });

  it('gives hype keywords more weight than plain chatter', () => {
    const normal = new HypeDetector({ floor: 100 }).ingest(
      message('hello', 1000),
    );
    const hype = new HypeDetector({ floor: 100 }).ingest(
      message('W POG LUL', 1000),
    );

    expect(hype.score).toBeGreaterThan(normal.score);
  });

  it('adds emote weight to a message score', () => {
    const plain = new HypeDetector({ floor: 100 }).ingest(
      message('nice', 1000),
    );
    const emote = new HypeDetector({ floor: 100 }).ingest(
      message('nice', 1000, ['PogChamp']),
    );

    expect(emote.score).toBeGreaterThan(plain.score);
  });

  it('recognizes textual Twitch emotes as emote weight', () => {
    const normal = new HypeDetector({ floor: 100 }).ingest(
      message('good one', 1000),
    );
    const emote = new HypeDetector({ floor: 100 }).ingest(
      message('good one KEKW', 1000),
    );

    expect(emote.score).toBeGreaterThan(normal.score);
  });
});
