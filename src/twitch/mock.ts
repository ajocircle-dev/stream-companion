import { appendFileSync, mkdirSync } from 'node:fs';
import type { ChatMessage, ChatSource, HelixClient } from './types.js';

/** Accepts local feeder messages and broadcasts normalized chat to subscribers. */
export class MockChatSource implements ChatSource {
  private readonly listeners: Array<(message: ChatMessage) => void> = [];

  onMessage(handler: (message: ChatMessage) => void): void {
    this.listeners.push(handler);
  }

  async start(): Promise<void> {}

  stop(): void {}

  push(
    input: Partial<ChatMessage> & Pick<ChatMessage, 'user' | 'text'>,
  ): ChatMessage {
    const message: ChatMessage = {
      id:
        input.id ??
        `mock-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      user: input.user,
      text: input.text,
      emotes: input.emotes ?? [],
      ts: input.ts ?? Date.now(),
    };
    this.listeners.forEach((listener) => listener(message));
    return message;
  }
}

/** Logs mock markers, clips, and chat replies without needing Twitch credentials. */
export class MockHelix implements HelixClient {
  private sequence = 0;

  constructor(
    private readonly logger: (line: string) => void = (line) => {
      mkdirSync('logs', { recursive: true });
      appendFileSync(
        'logs/mock-helix.log',
        `${new Date().toISOString()} ${line}\n`,
      );
      console.log(`[mock-helix] ${line}`);
    },
  ) {}

  async createMarker(description: string): Promise<{ id: string }> {
    const id = `marker-${++this.sequence}`;
    this.logger(`createMarker ${id}: ${description}`);
    return { id };
  }

  async createClip(): Promise<{ id: string; editUrl: string }> {
    const id = `clip-${++this.sequence}`;
    const editUrl = `https://clips.twitch.tv/${id}`;
    this.logger(`createClip ${id} ${editUrl}`);
    return { id, editUrl };
  }

  async getClip(id: string): Promise<{ id: string; url: string }> {
    this.logger(`getClip ${id}`);
    return { id, url: `https://clips.twitch.tv/${id}` };
  }

  async sendChatMessage(text: string): Promise<void> {
    this.logger(`sendChatMessage: ${text}`);
  }
}
