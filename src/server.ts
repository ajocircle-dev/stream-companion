import express from 'express';
import { createServer, type Server } from 'node:http';
import { config } from './config.js';
import { MockChatSource } from './twitch/mock.js';

export interface State {
  hype: { score: number; baseline: number };
  moments: unknown[];
  translations: unknown[];
  vote: unknown;
}

/** Serves overlay assets, JSON snapshots, mock input, and broadcast SSE events. */
export function createApp(
  state: State,
  source: MockChatSource,
  mode = config.mode,
) {
  const app = express();
  const clients = new Set<express.Response>();
  const overlayDirectory = `${process.cwd()}/public/overlay`;

  app.use(express.json({ limit: '32kb' }));
  app.get('/overlay', (_request, response) => {
    response.sendFile(`${overlayDirectory}/index.html`);
  });
  app.use('/overlay', express.static(overlayDirectory));
  app.get('/events', (_request, response) => {
    response.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    response.flushHeaders();
    response.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`);
    clients.add(response);
    _request.on('close', () => clients.delete(response));
  });
  app.get('/state', (_request, response) => response.json(state));
  app.post('/mock/chat', (request, response) => {
    if (mode !== 'mock') {
      return response.status(404).json({ error: 'mock mode disabled' });
    }

    const { user, text, emotes, ts } = request.body ?? {};
    if (typeof user !== 'string' || typeof text !== 'string') {
      return response.status(400).json({ error: 'user and text are required' });
    }

    return response.json(source.push({ user, text, emotes, ts }));
  });

  return {
    app,
    emit(event: string, data: unknown): void {
      const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

      for (const client of clients) {
        client.write(message);
      }
    },
  };
}

/** Starts the Express application on the configured local port. */
export function listen(app: express.Express, port: number): Promise<Server> {
  return new Promise((resolve) => {
    const server = createServer(app).listen(port, () => resolve(server));
  });
}
