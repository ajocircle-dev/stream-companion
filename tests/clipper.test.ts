/** Covers Helix clip creation, polling, event emission, and top-moment ranking. */
import { describe, expect, it, vi } from 'vitest';
import { HypeClipper } from '../src/hype/clipper.js';
import type { HypeResult } from '../src/hype/detector.js';
import type { HelixClient } from '../src/twitch/types.js';

function result(score: number): HypeResult {
  return { score, baseline: 1, spike: true, messages: [] };
}

function mockHelix(): HelixClient {
  let sequence = 0;

  return {
    createMarker: vi.fn(async () => ({ id: `marker-${++sequence}` })),
    createClip: vi.fn(async () => ({
      id: `clip-${++sequence}`,
      editUrl: 'edit-url',
    })),
    getClip: vi.fn(async (id: string) => ({
      id,
      url: `https://clips.test/${id}`,
    })),
    sendChatMessage: vi.fn(async () => {}),
  };
}

describe('HypeClipper', () => {
  it('creates a marker and clip, then records a ready moment with its URL', async () => {
    const helix = mockHelix();
    const clipper = new HypeClipper(helix);
    const moment = await clipper.onSpike(result(12), 5_000);

    expect(helix.createMarker).toHaveBeenCalledOnce();
    expect(helix.createClip).toHaveBeenCalledOnce();
    expect(helix.getClip).toHaveBeenCalledWith('clip-2');
    expect(moment).toMatchObject({
      markerId: 'marker-1',
      clipId: 'clip-2',
      clipUrl: 'https://clips.test/clip-2',
      status: 'ready',
    });
  });

  it('falls back to the edit URL when clip polling times out', async () => {
    const helix = mockHelix();
    vi.mocked(helix.getClip).mockResolvedValue(null);
    const clipper = new HypeClipper(helix, 5, undefined, 0, 2);
    const moment = await clipper.onSpike(result(10));

    expect(moment.clipUrl).toBe('edit-url');
    expect(moment.status).toBe('ready');
    expect(helix.getClip).toHaveBeenCalledTimes(2);
  });

  it('keeps only the highest-scoring moments in descending order', async () => {
    const clipper = new HypeClipper(mockHelix(), 2);

    await clipper.onSpike(result(6), 1_000);
    await clipper.onSpike(result(12), 2_000);
    await clipper.onSpike(result(9), 3_000);

    expect(clipper.moments.map((moment) => moment.score)).toEqual([12, 9]);
  });

  it('emits moment creation and completion events', async () => {
    const emit = vi.fn();
    const clipper = new HypeClipper(mockHelix(), 5, emit);

    await clipper.onSpike(result(8));

    expect(emit.mock.calls.map(([event]) => event)).toEqual([
      'moment:new',
      'moment:update',
    ]);
  });
});
