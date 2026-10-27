/** Covers vote parsing, replacement ballots, tallying, and quiet-start behavior. */
import { describe, expect, it, vi } from 'vitest';
import { tallyVotes, VoteGame } from '../src/game/vote.js';
import type { ChatMessage } from '../src/twitch/types.js';

function chat(text: string, user: string): ChatMessage {
  return { id: user, user, text, emotes: [], ts: 1_000 };
}

describe('vote tally', () => {
  it('counts the final vote per user after a voter changes their choice', () => {
    const game = new VoteGame(async () => {});
    game.current = {
      prompt: 'Pick one',
      options: ['a', 'b', 'c'],
      endsAt: 10_000,
      votes: new Map(),
    };

    game.handle(chat('!vote a', 'Viewer'));
    game.handle(chat('!vote b', 'viewer'));

    expect(tallyVotes(game.current.votes).counts).toEqual({ a: 0, b: 1, c: 0 });
  });

  it('counts valid options and ignores malformed vote commands', () => {
    const game = new VoteGame(async () => {});
    game.current = {
      prompt: 'Pick one',
      options: ['a', 'b', 'c'],
      endsAt: 10_000,
      votes: new Map(),
    };

    expect(game.handle(chat('!vote d', 'viewer'))).toBe(false);
    expect(game.handle(chat('!vote a please', 'viewer'))).toBe(false);
    expect(game.current.votes.size).toBe(0);
  });

  it('treats vote options case-insensitively', () => {
    const game = new VoteGame(async () => {});
    game.current = {
      prompt: 'Pick one',
      options: ['a', 'b', 'c'],
      endsAt: 10_000,
      votes: new Map(),
    };

    expect(game.handle(chat('!VOTE C', 'viewer'))).toBe(true);
    expect(tallyVotes(game.current.votes).counts.c).toBe(1);
  });

  it('returns the unique option with the highest count', () => {
    expect(tallyVotes({ first: 'a', second: 'b', third: 'b' })).toMatchObject({
      winner: 'b',
      tied: false,
    });
  });

  it('reports ties without selecting a winner', () => {
    expect(tallyVotes({ first: 'a', second: 'b' })).toMatchObject({
      winner: null,
      tied: true,
    });
  });

  it('handles an empty ballot without claiming a tie', () => {
    expect(tallyVotes({})).toMatchObject({
      counts: { a: 0, b: 0, c: 0 },
      winner: null,
      tied: false,
    });
  });
});

describe('quiet detector', () => {
  it('starts a vote after chat stays below the rate limit for the quiet period', async () => {
    const send = vi.fn(async () => {});
    const game = new VoteGame(send, undefined, {
      quietRate: 0.2,
      quietSeconds: 10,
      durationSeconds: 60,
      cooldownSeconds: 30,
    });

    game.observeRate(0.1, 100_000);
    game.observeRate(0.1, 109_000);
    expect(game.current).toBeUndefined();

    game.observeRate(0.1, 110_000);
    await Promise.resolve();

    expect(game.current).toBeDefined();
    expect(send).toHaveBeenCalledOnce();
    await game.end();
  });

  it('resets the quiet timer when chat becomes active', async () => {
    const game = new VoteGame(async () => {}, undefined, {
      quietRate: 0.2,
      quietSeconds: 10,
      durationSeconds: 60,
      cooldownSeconds: 30,
    });

    game.observeRate(0.1, 100_000);
    game.observeRate(1, 105_000);
    game.observeRate(0.1, 106_000);
    game.observeRate(0.1, 115_000);

    expect(game.current).toBeUndefined();
    game.observeRate(0.1, 116_000);
    await Promise.resolve();
    expect(game.current).toBeDefined();
    await game.end();
  });
});
