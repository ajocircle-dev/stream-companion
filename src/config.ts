/** Loads environment settings and exposes typed defaults for the bot and overlay. */
import 'dotenv/config';

function readNumber(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

export const config = {
  mode: process.env.MODE === 'live' ? 'live' : 'mock',
  port: readNumber('PORT', 3000),
  twitchClientId: process.env.TWITCH_CLIENT_ID ?? '',
  twitchUserToken: process.env.TWITCH_USER_TOKEN ?? '',
  broadcasterId: process.env.TWITCH_BROADCASTER_ID ?? '',
  botUserId: process.env.TWITCH_BOT_USER_ID ?? '',
  broadcasterName: process.env.TWITCH_BROADCASTER_NAME ?? 'streamer',
  libreTranslateUrl: process.env.LIBRETRANSLATE_URL ?? 'http://127.0.0.1:5000',
  libreTranslateApiKey: process.env.LIBRETRANSLATE_API_KEY ?? '',
  openAiEnabled: process.env.OPENAI_ENABLED === 'true',
  openAiApiKey: process.env.OPENAI_API_KEY ?? '',
  nllbUrl: process.env.NLLB_URL ?? 'http://127.0.0.1:5001/translate',
  hypeMultiplier: readNumber('HYPE_MULTIPLIER', 2.4),
  hypeFloor: readNumber('HYPE_FLOOR', 8),
  hypeCooldownMs: readNumber('HYPE_COOLDOWN_MS', 12_000),
  hypeTopN: readNumber('HYPE_TOP_N', 5),
  quietRate: readNumber('QUIET_RATE', 0.15),
  quietSeconds: readNumber('QUIET_SECONDS', 18),
  voteDurationSeconds: readNumber('VOTE_DURATION_SECONDS', 25),
  gameCooldownSeconds: readNumber('GAME_COOLDOWN_SECONDS', 60),
};
