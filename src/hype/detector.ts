import type { ChatMessage } from '../twitch/types.js';

export interface HypeResult {
  score: number;
  baseline: number;
  spike: boolean;
  messages: ChatMessage[];
}

type HypeBucket = { score: number; messages: ChatMessage[] };
type HypeDetectorOptions = {
  multiplier?: number;
  floor?: number;
  cooldownMs?: number;
  windowSeconds?: number;
  spikeWindowSeconds?: number;
};

const hypeKeywords =
  /\b(?:w|pog|poggers|lol|lmao|omo|ehen|haha|kekw|gg|clip it|lets go|let's go|e choke)\b/gi;
const recognizableEmotes = /\b(?:Kappa|PogChamp|LUL|KEKW)\b/g;

/** Scores a rolling three-second chat burst against a decaying per-second EWMA baseline. */
export class HypeDetector {
  private readonly buckets = new Map<number, HypeBucket>();
  private lastSpike = -Infinity;
  private baselinePerSecond = 2;
  private lastBaselineSecond?: number;

  constructor(private readonly options: HypeDetectorOptions = {}) {}

  ingest(message: ChatMessage): HypeResult {
    const second = Math.floor(message.ts / 1000);
    this.updateBaseline(second);

    const bucket = this.buckets.get(second) ?? { score: 0, messages: [] };
    const keywordHits = [...message.text.matchAll(hypeKeywords)].length;
    const emoteCount =
      message.emotes.length ||
      (message.text.match(recognizableEmotes) ?? []).length;

    bucket.score +=
      1 + Math.min(2, keywordHits * 0.6) + Math.min(2, emoteCount * 0.7);
    bucket.messages.push(message);
    this.buckets.set(second, bucket);
    this.pruneBuckets(second);

    const score = this.rollingScore(second);
    const spike =
      score >= (this.options.floor ?? 8) &&
      score > this.rollingBaseline() * (this.options.multiplier ?? 2.4) &&
      message.ts - this.lastSpike >= (this.options.cooldownMs ?? 12_000);

    if (spike) {
      this.lastSpike = message.ts;
    }

    return {
      score,
      baseline: this.rollingBaseline(),
      spike,
      messages: this.rollingMessages(second),
    };
  }

  snapshot(timestamp = Date.now()): HypeResult {
    const second = Math.floor(timestamp / 1000);
    this.updateBaseline(second);

    return {
      score: this.rollingScore(second),
      baseline: this.rollingBaseline(),
      spike: false,
      messages: this.rollingMessages(second),
    };
  }

  private updateBaseline(second: number): void {
    if (
      this.lastBaselineSecond !== undefined &&
      second > this.lastBaselineSecond
    ) {
      const elapsedSeconds = Math.min(second - this.lastBaselineSecond, 60);
      const previousScore =
        this.buckets.get(this.lastBaselineSecond)?.score ?? 0;
      this.baselinePerSecond =
        this.baselinePerSecond * 0.85 + previousScore * 0.15;

      for (let elapsed = 1; elapsed < elapsedSeconds; elapsed += 1) {
        this.baselinePerSecond *= 0.85;
      }
    }

    this.lastBaselineSecond = second;
  }

  private rollingScore(currentSecond: number): number {
    const windowSeconds = this.options.spikeWindowSeconds ?? 3;
    let score = 0;

    for (let offset = 0; offset < windowSeconds; offset += 1) {
      score += this.buckets.get(currentSecond - offset)?.score ?? 0;
    }

    return score;
  }

  private rollingBaseline(): number {
    return this.baselinePerSecond * (this.options.spikeWindowSeconds ?? 3);
  }

  private rollingMessages(currentSecond: number): ChatMessage[] {
    const windowSeconds = this.options.spikeWindowSeconds ?? 3;
    const messages: ChatMessage[] = [];

    for (let offset = windowSeconds - 1; offset >= 0; offset -= 1) {
      messages.push(
        ...(this.buckets.get(currentSecond - offset)?.messages ?? []),
      );
    }

    return messages;
  }

  private pruneBuckets(currentSecond: number): void {
    const windowSeconds = this.options.windowSeconds ?? 60;

    for (const second of this.buckets.keys()) {
      if (second < currentSecond - windowSeconds) {
        this.buckets.delete(second);
      }
    }
  }
}
