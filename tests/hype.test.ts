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

  it('spikes when several hype messages arrive within one second', () => {
    const detector = new HypeDetector({ floor: 8 });
    const results = Array.from({ length: 5 }, (_, index) =>
      detector.ingest(message('W POG', 60_000, ['pog'])),
    );

    expect(results.at(-1)?.score).toBeGreaterThan(8);
    expect(results.some((result) => result.spike)).toBe(true);
  });

  it('does not emit another spike during the configured cooldown', () => {
    const detector = new HypeDetector({ floor: 2, cooldownMs: 30_000 });
    const first = detector.ingest(message('W POG', 1000));
    const second = detector.ingest(message('W POG', 5000));

    expect(first.spike).toBe(true);
    expect(second.spike).toBe(false);
  });

  it('allows a new spike after the cooldown ends', () => {
    const detector = new HypeDetector({ floor: 2, cooldownMs: 30_000 });
    detector.ingest(message('W POG', 1000));
    const laterResults = Array.from({ length: 5 }, () =>
      detector.ingest(message('W POG', 32_000)),
    );

    expect(laterResults.some((result) => result.spike)).toBe(true);
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
