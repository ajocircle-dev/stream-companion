import type { AvailableClip, ClipResult, HelixClient } from './types.js';

type HelixResponse<T> = { data?: T[] };

/** Calls Twitch Helix endpoints for stream markers, clips, and chat replies. */
export class TwitchHelix implements HelixClient {
  constructor(
    private readonly clientId: string,
    private readonly token: string,
    private readonly broadcasterId: string,
    private readonly botUserId: string,
  ) {}

  async createMarker(description: string): Promise<{ id: string }> {
    const response = await this.request<HelixResponse<{ id: string }>>(
      '/streams/markers',
      {
        method: 'POST',
        body: JSON.stringify({
          user_id: this.broadcasterId,
          description: description.slice(0, 140),
        }),
      },
    );

    return { id: response.data?.[0]?.id ?? '' };
  }

  async createClip(): Promise<ClipResult> {
    const response = await this.request<
      HelixResponse<{ id: string; edit_url?: string }>
    >(`/clips?broadcaster_id=${encodeURIComponent(this.broadcasterId)}`, {
      method: 'POST',
    });
    const clip = response.data?.[0];

    if (!clip?.id) {
      throw new Error('Twitch did not create a clip.');
    }

    return { id: clip.id, editUrl: clip.edit_url ?? '' };
  }

  async getClip(id: string): Promise<AvailableClip | null> {
    const response = await this.request<HelixResponse<AvailableClip>>(
      `/clips?id=${encodeURIComponent(id)}`,
    );

    return response.data?.[0] ?? null;
  }

  async sendChatMessage(text: string): Promise<void> {
    await this.request('/chat/messages', {
      method: 'POST',
      body: JSON.stringify({
        broadcaster_id: this.broadcasterId,
        sender_id: this.botUserId,
        message: text,
      }),
    });
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`https://api.twitch.tv/helix${path}`, {
      ...init,
      headers: {
        'Client-Id': this.clientId,
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Twitch Helix ${path}: ${response.status} ${await response.text()}`,
      );
    }

    return (await response.json()) as T;
  }
}
