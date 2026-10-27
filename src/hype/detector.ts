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
};

const hypeKeywords =
  /\b(?:w|pog|poggers|lol|lmao|omo|ehen|haha|kekw|gg|clip it|lets go|let's go|e choke)\b/gi;
const recognizableEmotes = /\b(?:Kappa|PogChamp|LUL|KEKW)\b/g;

/** Scores per-second chat activity and emits threshold spikes with an EWMA baseline. */
export class HypeDetector {
  private readonly buckets = new Map<number, HypeBucket>();
  private lastSpike = -Infinity;
  private baseline = 0.5;
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

    const spike =
      bucket.score >= (this.options.floor ?? 8) &&
      bucket.score > this.baseline * (this.options.multiplier ?? 2.4) &&
      message.ts - this.lastSpike >= (this.options.cooldownMs ?? 30_000);

    if (spike) {
      this.lastSpike = message.ts;
    }

    return {
      score: bucket.score,
      baseline: this.baseline,
      spike,
      messages: bucket.messages.slice(),
    };
  }

  snapshot(timestamp = Date.now()): HypeResult {
    const second = Math.floor(timestamp / 1000);
    this.updateBaseline(second);
    const bucket = this.buckets.get(second);

    return {
      score: bucket?.score ?? 0,
      baseline: this.baseline,
      spike: false,
      messages: bucket?.messages.slice() ?? [],
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
      this.baseline = this.baseline * 0.85 + previousScore * 0.15;

      for (let elapsed = 1; elapsed < elapsedSeconds; elapsed += 1) {
        this.baseline *= 0.85;
      }
    }

    this.lastBaselineSecond = second;
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
