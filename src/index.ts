import { parseReplyCommand } from './chat/commands.js';
import { config } from './config.js';
import { VoteGame } from './game/vote.js';
import { HypeClipper } from './hype/clipper.js';
import { HypeDetector } from './hype/detector.js';
import { createApp, listen } from './server.js';
import { Translator } from './translate/router.js';
import { EventSubChatSource } from './twitch/eventsub.js';
import { TwitchHelix } from './twitch/helix.js';
import { MockChatSource, MockHelix } from './twitch/mock.js';
import type { ChatSource } from './twitch/types.js';

/** Connects the chat, hype, translation, voting, and overlay services. */
const isMockMode = config.mode === 'mock';
const chatSource: ChatSource = isMockMode
  ? new MockChatSource()
  : new EventSubChatSource(
      config.twitchClientId,
      config.twitchUserToken,
      config.broadcasterId,
      config.botUserId,
    );
const mockChatSource = isMockMode
  ? (chatSource as MockChatSource)
  : new MockChatSource();
const helix = isMockMode
  ? new MockHelix()
  : new TwitchHelix(
      config.twitchClientId,
      config.twitchUserToken,
      config.broadcasterId,
      config.botUserId,
    );
const state = {
  hype: { score: 0, baseline: 0 },
  moments: [] as unknown[],
  translations: [] as unknown[],
  vote: null as unknown,
};
const { app, emit } = createApp(state, mockChatSource, config.mode);
const detector = new HypeDetector({
  multiplier: config.hypeMultiplier,
  floor: config.hypeFloor,
  cooldownMs: config.hypeCooldownMs,
});
const clipper = new HypeClipper(helix, config.hypeTopN, (event, data) => {
  state.moments = clipper.moments;
  emit(event, data);
});
const translator = Translator.fromConfig(config);
const game = new VoteGame(
  (text) => helix.sendChatMessage(text),
  (event, data) => {
    state.vote = event === 'vote:end' ? null : data;
    emit(event, data);
  },
  {
    quietRate: config.quietRate,
    quietSeconds: config.quietSeconds,
    durationSeconds: config.voteDurationSeconds,
    cooldownSeconds: config.gameCooldownSeconds,
  },
);
let recentMessageTimestamps: number[] = [];

chatSource.onMessage((message) => {
  const hypeResult = detector.ingest(message);
  state.hype = {
    score: hypeResult.score,
    baseline: hypeResult.baseline,
  };

  if (hypeResult.spike) {
    void clipper.onSpike(hypeResult, message.ts);
  }

  recentMessageTimestamps.push(message.ts);
  recentMessageTimestamps = recentMessageTimestamps.filter(
    (timestamp) => message.ts - timestamp < 10_000,
  );
  game.observeRate(recentMessageTimestamps.length / 10, message.ts);
  game.handle(message);

  const replyCommand = parseReplyCommand(message.text);
  const isBroadcaster =
    message.user.toLocaleLowerCase() ===
    config.broadcasterName.toLocaleLowerCase();

  if (replyCommand && isBroadcaster) {
    void translator
      .translate(replyCommand.text, replyCommand.language)
      .then((translation) => helix.sendChatMessage(translation.translated));
  }

  if (!message.text.startsWith('!')) {
    void translator.translate(message.text).then((translation) => {
      if (
        translation.lang !== 'en' &&
        translation.translated !== translation.original
      ) {
        state.translations = [translation, ...state.translations].slice(0, 20);
        emit('translation:new', translation);
      }
    });
  }
});

setInterval(() => {
  const now = Date.now();
  recentMessageTimestamps = recentMessageTimestamps.filter(
    (timestamp) => now - timestamp < 10_000,
  );
  game.observeRate(recentMessageTimestamps.length / 10, now);
  state.hype = detector.snapshot(now);
  emit('hype:score', state.hype);
}, 500);

if (!isMockMode) {
  void chatSource.start?.();
}

const server = await listen(app, config.port);
console.log(
  `Stream Companion (${config.mode}) listening at http://localhost:${config.port}/overlay`,
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    chatSource.stop?.();
    server.close(() => process.exit(0));
  });
}
