import type { ChatMessage, ChatSource } from './types.js';

type EventSubEnvelope = {
  metadata?: { message_type?: string };
  payload?: any;
};

/** Maintains a Twitch EventSub WebSocket and subscribes to broadcaster chat. */
export class EventSubChatSource implements ChatSource {
  private readonly listeners: Array<(message: ChatMessage) => void> = [];
  private socket?: WebSocket;
  private sessionId = '';
  private stopped = false;

  constructor(
    private readonly clientId: string,
    private readonly token: string,
    private readonly broadcasterId: string,
    private readonly botUserId = broadcasterId,
  ) {}

  onMessage(handler: (message: ChatMessage) => void): void {
    this.listeners.push(handler);
  }

  async start(): Promise<void> {
    this.stopped = false;
    this.connect('wss://eventsub.wss.twitch.tv/ws');
  }

  stop(): void {
    this.stopped = true;
    this.socket?.close();
  }

  private connect(url: string): void {
    const socket = new WebSocket(url);
    this.socket = socket;
    socket.onmessage = (event) => {
      void this.handle(JSON.parse(String(event.data)) as EventSubEnvelope);
    };
    socket.onclose = () => {
      if (!this.stopped) {
        setTimeout(() => this.connect('wss://eventsub.wss.twitch.tv/ws'), 1500);
      }
    };
    socket.onerror = () => socket.close();
  }

  private async handle(envelope: EventSubEnvelope): Promise<void> {
    const { metadata, payload } = envelope;

    switch (metadata?.message_type) {
      case 'session_welcome':
        this.sessionId = payload.session.id;
        await this.subscribe();
        break;
      case 'session_keepalive':
        break;
      case 'session_reconnect':
        this.connect(payload.session.reconnect_url);
        break;
      case 'revocation':
        console.error('EventSub subscription revoked', payload.subscription);
        break;
      case 'notification':
        this.handleNotification(payload);
        break;
    }
  }

  private handleNotification(payload: any): void {
    if (payload.subscription?.type !== 'channel.chat.message') {
      return;
    }

    const event = payload.event;
    const message: ChatMessage = {
      id: event.message_id,
      user: event.chatter_user_name,
      text: event.message?.text ?? '',
      emotes: (event.message?.fragments ?? [])
        .filter((fragment: any) => fragment.type === 'emote')
        .map((fragment: any) => fragment.text),
      ts: Date.now(),
    };

    this.listeners.forEach((listener) => listener(message));
  }

  private async subscribe(): Promise<void> {
    const response = await fetch(
      'https://api.twitch.tv/helix/eventsub/subscriptions',
      {
        method: 'POST',
        headers: {
          'Client-Id': this.clientId,
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'channel.chat.message',
          version: '1',
          condition: {
            broadcaster_user_id: this.broadcasterId,
            user_id: this.botUserId,
          },
          transport: { method: 'websocket', session_id: this.sessionId },
        }),
      },
    );

    if (!response.ok) {
      console.error(
        'EventSub subscribe failed',
        response.status,
        await response.text(),
      );
    }
  }
}
