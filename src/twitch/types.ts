/** Defines normalized chat and Helix interfaces shared by live and mock adapters. */
export interface ChatMessage {
  id: string;
  user: string;
  text: string;
  emotes: string[];
  ts: number;
}

export interface ChatSource {
  onMessage(handler: (message: ChatMessage) => void): void;
  start?(): Promise<void>;
  stop?(): void;
}

export interface ClipResult {
  id: string;
  editUrl: string;
}

export interface AvailableClip {
  id: string;
  url?: string;
  embed_url?: string;
}

export interface HelixClient {
  createMarker(description: string): Promise<{ id: string }>;
  createClip(): Promise<ClipResult>;
  getClip(id: string): Promise<AvailableClip | null>;
  sendChatMessage(text: string): Promise<void>;
}
