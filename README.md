# Stream Companion

A mock-first Twitch stream companion for Codex x TwitchCon Hackathon: a TypeScript chat bot that detects hype, saves clip moments, translates multilingual chat, runs quiet-chat votes, and drives a transparent OBS browser overlay. Mock mode runs end-to-end without Twitch credentials or paid APIs.

## Quick start

```sh
npm install
npm run demo -- --speed=2
```

Open [http://localhost:3000/overlay?bg=1](http://localhost:3000/overlay?bg=1) for the live demo with a preview background. `npm run demo` starts the server and 180-line scripted feeder; it exits when the feed ends. Use `--loop` to replay continuously and `--speed 10` (or `--speed=10`) to control pacing. For a static screenshot, use `/overlay?demo=1&bg=1`.

## Features and architecture

```text
Twitch EventSub / mock feeder
          │ normalized ChatMessage
          ▼
   hype detector ──► clipper ──► Helix marker + clip
          │
          ├──► translator chain ──► translations
          └──► quiet detector ──► vote game ──► chat reply
                         │
                         ▼
            Express state + SSE events
                         │
                         ▼
                OBS browser overlay
```

The overlay shows a live hype meter, ranked moments, translations with confidence, and an in-progress vote. `POST /mock/chat` accepts `{ "user": "name", "text": "message", "emotes": [] }` in mock mode. `/state` returns the latest snapshot; `/events` streams updates.

## OBS browser source

Add a Browser Source pointing to `http://localhost:3000/overlay`, set width `1920`, height `1080`, and enable shutdown/hide behavior as preferred. The page uses a transparent background. Add `?bg=1` to preview with a checker pattern. Keep the local app running while OBS uses the source.

## Environment

Copy `.env.example` to `.env`; mock mode is the default.

| Variable | Purpose | Default |
| --- | --- | --- |
| MODE | `mock` or `live` | `mock` |
| PORT | HTTP port | `3000` |
| TWITCH_CLIENT_ID | Twitch developer app client ID | empty |
| TWITCH_USER_TOKEN | User OAuth token | empty |
| TWITCH_BROADCASTER_ID | Streamer's Twitch user ID | empty |
| TWITCH_BOT_USER_ID | Sending bot user ID | empty |
| TWITCH_BROADCASTER_NAME | Username allowed to use `!reply` | `streamer` |
| LIBRETRANSLATE_URL | Self-hosted LibreTranslate base URL | disabled |
| LIBRETRANSLATE_API_KEY | Optional LibreTranslate key | empty |
| OPENAI_ENABLED / OPENAI_API_KEY | Optional translation provider; off by default | `false` / empty |
| NLLB_URL | Optional NLLB translation endpoint | disabled |
| HYPE_MULTIPLIER / HYPE_FLOOR / HYPE_COOLDOWN_MS / HYPE_TOP_N | Hype and moment tuning | see `.env.example` |
| QUIET_RATE / QUIET_SECONDS / VOTE_DURATION_SECONDS / GAME_COOLDOWN_SECONDS | Vote-game tuning | see `.env.example` |

Self-host LibreTranslate (no paid API): `docker run -p 5000:5000 libretranslate/libretranslate`, then set `LIBRETRANSLATE_URL=http://localhost:5000`. Yoruba NLLB integration is an optional HTTP adapter expecting `POST {"text","source_lang","target_lang"}` and response `{"translation":"..."}`; host a compatible NLLB inference service and set `NLLB_URL`. Built-in Pidgin phrase translation and a 100+ entry Pidgin phrase list and a common-phrase Yoruba glossary work offline.

## Live Twitch setup

Create a Twitch developer application and obtain a user token for the broadcaster. Set `MODE=live`, client ID, token, broadcaster ID, and bot user ID. Grant `user:read:chat`, `user:write:chat`, `channel:manage:broadcast`, and `clips:edit` scopes. EventSub subscribes to `channel.chat.message`; Helix creates markers/clips and sends chat messages. Twitch live connectivity requires valid credentials and an active stream; this path is compile-ready and mock mode is the supported demo path.

## Development

```sh
npm run dev       # mock server
npm run feed -- --speed 10  # feed quickly into a running mock server
npm run feed -- --loop      # keep replaying the chat script
npm test
npm run typecheck
npm run build
npm run format
```

`!vote a|b|c` casts a vote. The broadcaster can use `!reply <lang> <text>` (default broadcaster name `streamer`; configure `TWITCH_BROADCASTER_NAME` to override) to translate English into a target language and send it to chat.

## Built with OpenAI Codex

Stream Companion was built with OpenAI Codex for the Codex x TwitchCon Hackathon.
