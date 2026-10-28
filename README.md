# Stream Companion

A mock-first Twitch stream companion for Codex x TwitchCon Hackathon: a Node.js TypeScript bot that detects hype, creates stream markers and clips, translates multilingual chat, runs quiet-chat votes, and drives a transparent OBS browser overlay. Phase 2 connects local LibreTranslate and an optional local NLLB model; mock mode still works without Twitch credentials.

## Mock demo

The prepared workspace has LibreTranslate running on `127.0.0.1:5000`. Start NLLB in another terminal, then run:

```sh
npm run nllb
npm run demo -- --speed=2
```

Open `http://localhost:3000/overlay?bg=1` to preview the live overlay against the checker background. For static sample data, open `/overlay?demo=1&bg=1`. The feeder sends 180 scripted lines across English, Nigerian Pidgin, Yoruba, French, and Spanish from 25 viewer names. It includes two hype bursts, a quiet stretch for the vote, votes, and streamer `!reply` examples. Use `--loop` to replay continuously; `--speed 10` or `--speed=10` changes chat pacing.

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

The overlay shows a rolling hype meter, ranked moments, live translations with confidence, and an active vote. `POST /mock/chat` accepts `{ "user": "name", "text": "message", "emotes": [] }` in mock mode. `/state` returns the latest snapshot; `/events` streams updates.

## Local translation services

LibreTranslate can run from the prepared virtual environment with:

```sh
LIBRETRANSLATE_HOST=127.0.0.1 LIBRETRANSLATE_PORT=5000 /workspace/lt-venv/bin/libretranslate
```

The app defaults `LIBRETRANSLATE_URL` to `http://127.0.0.1:5000`. It checks `/languages`, caches that health result for 30 seconds, and fails soft to the next provider if the service is unavailable. French, Spanish, German, and Portuguese use their standard LibreTranslate language codes.

The local NLLB HTTP adapter uses the prepared CTranslate2 int8 model and listens only on localhost port 5001:

```sh
npm run nllb
# equivalent: /workspace/lt-venv/bin/python scripts/nllb_server.py
```

It loads `/workspace/models/nllb-200-distilled-600M-ct2-int8` on startup and exposes `GET /health` and `POST /translate` with `{ "text", "source_lang", "target_lang" }`. The adapter maps `yo` to `yor_Latn` and `en` to `eng_Latn`, and supports both translation directions. If the model cannot load or the service is stopped, the app falls through to the offline Yoruba phrase glossary.

The Pidgin phrase list supports both directions and longest phrase matching. The Yoruba glossary supplies lower-confidence common phrase translations when NLLB is unavailable. OpenAI remains an optional provider and is **off by default** (`OPENAI_ENABLED=false`); this project does not require it.

## OBS browser source

Add a Browser Source pointing to `http://localhost:3000/overlay`, set width `1920`, height `1080`, and enable shutdown/hide behavior as preferred. The page keeps a transparent background for OBS. Add `?bg=1` to preview with the checker pattern. The left column contains hype and moments, translations stay at the right edge, and the active vote sits at bottom center.

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
| LIBRETRANSLATE_URL | Local LibreTranslate base URL | `http://127.0.0.1:5000` |
| LIBRETRANSLATE_API_KEY | Optional LibreTranslate key | empty |
| NLLB_URL | Local NLLB translate endpoint | `http://127.0.0.1:5001/translate` |
| OPENAI_ENABLED / OPENAI_API_KEY | Optional translation provider; off by default | `false` / empty |
| HYPE_MULTIPLIER / HYPE_FLOOR / HYPE_COOLDOWN_MS / HYPE_TOP_N | Hype and moment tuning | see `.env.example` |
| QUIET_RATE / QUIET_SECONDS / VOTE_DURATION_SECONDS / GAME_COOLDOWN_SECONDS | Vote-game tuning | see `.env.example` |

## Live Twitch setup

Create a Twitch developer application and obtain a user token for the account that will read and send chat. Set `MODE=live`, client ID, token, broadcaster ID, and bot user ID. Grant `user:read:chat`, `user:write:chat`, `channel:manage:broadcast`, and `clips:edit` scopes. EventSub subscribes to `channel.chat.message`; Helix creates markers and clips and sends chat messages. Live connectivity requires valid Twitch credentials and an active stream; mock mode is the supported demo path.

## Development

```sh
npm run dev                 # mock server
npm run feed -- --speed 10  # feed quickly into a running mock server
npm run feed -- --loop      # replay continuously
npm run nllb                # local NLLB service
npm test
npm run typecheck
npm run build
npm run format
```

`!vote a|b|c` casts a vote. The broadcaster can use `!reply <lang> <text>` (default name `streamer`; configure `TWITCH_BROADCASTER_NAME` to override) to translate English into Pidgin (`pcm`), Yoruba (`yo`), French (`fr`), Spanish (`es`), and other loaded LibreTranslate languages, then send the result to chat.

## Built with OpenAI Codex

Stream Companion was built with OpenAI Codex for the Codex x TwitchCon Hackathon. The Codex session ID is `01a17cc0-fef4-7b01-8ddb-2a1e98983343`.
