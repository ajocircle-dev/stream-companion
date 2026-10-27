import type { ChatMessage, HelixClient } from '../twitch/types.js';
import type { HypeResult } from './detector.js';

export interface Moment {
  id: string;
  ts: number;
  score: number;
  peakMessages: ChatMessage[];
  markerId?: string;
  clipId?: string;
  clipUrl?: string;
  status: 'creating' | 'ready' | 'error';
  error?: string;
}

/** Turns hype spikes into markers and clips, polling briefly until the clip URL is available. */
export class HypeClipper {
  readonly moments: Moment[] = [];
  private sequence = 0;

  constructor(
    private readonly helix: HelixClient,
    private readonly topN = 5,
    private readonly emit: (event: string, data: unknown) => void = () => {},
    private readonly pollIntervalMs = 1000,
    private readonly maxPollAttempts = 5,
  ) {}

  async onSpike(result: HypeResult, timestamp = Date.now()): Promise<Moment> {
    const moment: Moment = {
      id: `moment-${++this.sequence}`,
      ts: timestamp,
      score: result.score,
      peakMessages: result.messages.slice(-12),
      status: 'creating',
    };

    this.moments.push(moment);
    this.sortAndTrim();
    this.emit('moment:new', moment);

    try {
      const [marker, clip] = await Promise.all([
        this.helix.createMarker(
          `Stream Companion hype ${Math.round(result.score)}`,
        ),
        this.helix.createClip(),
      ]);
      const availableClip = await this.pollForClip(clip.id);

      moment.markerId = marker.id;
      moment.clipId = clip.id;
      moment.clipUrl = availableClip?.url ?? clip.editUrl;
      moment.status = 'ready';
    } catch (error) {
      moment.status = 'error';
      moment.error = error instanceof Error ? error.message : String(error);
    }

    this.sortAndTrim();
    this.emit('moment:update', moment);
    return moment;
  }

  private async pollForClip(id: string) {
    for (let attempt = 0; attempt < this.maxPollAttempts; attempt += 1) {
      const clip = await this.helix.getClip(id);

      if (clip) {
        return clip;
      }

      if (attempt < this.maxPollAttempts - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, this.pollIntervalMs),
        );
      }
    }

    return null;
  }

  private sortAndTrim(): void {
    this.moments.sort((left, right) => right.score - left.score);
    this.moments.splice(this.topN);
  }
}
