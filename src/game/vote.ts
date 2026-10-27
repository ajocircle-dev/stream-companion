import type { ChatMessage } from '../twitch/types.js';

export type Option = 'a' | 'b' | 'c';
export type VoteCounts = Record<Option, number>;
export type VoteTally = {
  counts: VoteCounts;
  winner: Option | null;
  tied: boolean;
};

type VoteState = {
  prompt: string;
  options: Option[];
  endsAt: number;
  votes: Map<string, Option>;
};

type VoteSettings = {
  quietRate: number;
  quietSeconds: number;
  durationSeconds: number;
  cooldownSeconds: number;
};

export const prompts = [
  'Next challenge? a) no-scope run b) speedrun c) viewer picks',
  'Choose the next game: a) racers b) puzzles c) surprise me',
  'What should happen next? a) hard mode b) side quest c) chat decides',
];

/** Counts valid votes, with each supplied user vote treated as their final choice. */
export function tallyVotes(
  votes: Map<string, string> | Record<string, string>,
): VoteTally {
  const counts: VoteCounts = { a: 0, b: 0, c: 0 };
  const values =
    votes instanceof Map ? [...votes.values()] : Object.values(votes);

  for (const value of values) {
    if (value === 'a' || value === 'b' || value === 'c') {
      counts[value] += 1;
    }
  }

  const maximum = Math.max(...Object.values(counts));
  const winners = (['a', 'b', 'c'] as const).filter(
    (option) => counts[option] === maximum && maximum > 0,
  );

  return {
    counts,
    winner: winners.length === 1 ? winners[0] : null,
    tied: winners.length > 1,
  };
}

/** Starts votes after sustained quiet, accepts one replaceable vote per username, then announces results. */
export class VoteGame {
  current?: VoteState;
  private lastGame = -Infinity;
  private quietSince?: number;
  private promptIndex = 0;
  private timer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly send: (text: string) => Promise<void>,
    private readonly emit: (event: string, data: unknown) => void = () => {},
    private readonly settings: VoteSettings = {
      quietRate: 0.15,
      quietSeconds: 18,
      durationSeconds: 25,
      cooldownSeconds: 60,
    },
  ) {}

  observeRate(rate: number, timestamp = Date.now()): void {
    if (this.current) {
      return;
    }

    if (rate > this.settings.quietRate) {
      this.quietSince = undefined;
      return;
    }

    this.quietSince ??= timestamp;
    const quietDuration = (timestamp - this.quietSince) / 1000;
    const cooldownDuration = (timestamp - this.lastGame) / 1000;

    if (
      quietDuration >= this.settings.quietSeconds &&
      cooldownDuration >= this.settings.cooldownSeconds
    ) {
      void this.start(timestamp);
    }
  }

  async start(timestamp = Date.now()): Promise<void> {
    if (this.current) {
      return;
    }

    this.lastGame = timestamp;
    this.quietSince = undefined;
    this.current = {
      prompt: prompts[this.promptIndex++ % prompts.length]!,
      options: ['a', 'b', 'c'],
      endsAt: timestamp + this.settings.durationSeconds * 1000,
      votes: new Map(),
    };

    this.emit('vote:start', this.snapshot());
    await this.send(
      `${this.current.prompt} Vote with !vote a, !vote b, or !vote c. (${this.settings.durationSeconds}s)`,
    );
    this.timer = setTimeout(
      () => void this.end(),
      this.settings.durationSeconds * 1000,
    );
  }

  handle(message: ChatMessage): boolean {
    const match = message.text.match(/^!vote\s+([abc])\s*$/i);

    if (!this.current || !match) {
      return false;
    }

    this.current.votes.set(
      message.user.toLocaleLowerCase(),
      match[1]!.toLowerCase() as Option,
    );
    this.emit('vote:update', this.snapshot());
    return true;
  }

  snapshot() {
    if (!this.current) {
      return null;
    }

    const tally = tallyVotes(this.current.votes);

    return {
      prompt: this.current.prompt,
      options: this.current.options,
      endsAt: this.current.endsAt,
      votes: this.current.votes.size,
      counts: tally.counts,
    };
  }

  async end(): Promise<void> {
    if (!this.current) {
      return;
    }

    if (this.timer) {
      clearTimeout(this.timer);
    }

    const tally = tallyVotes(this.current.votes);
    const data = { ...this.snapshot(), ...tally };
    this.emit('vote:end', data);

    if (tally.winner) {
      await this.send(
        `Vote winner: ${tally.winner} (${tally.counts[tally.winner]} votes).`,
      );
    } else if (tally.tied) {
      await this.send('Vote ended in a tie!');
    } else {
      await this.send('Vote ended with no votes.');
    }

    this.current = undefined;
  }
}
