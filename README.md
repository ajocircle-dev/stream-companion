# Stream Companion

A mock-first Twitch stream companion built for the **Codex x TwitchCon Hackathon**. It is a Node.js + TypeScript bot that detects chat hype, creates stream markers and clips, translates multilingual chat (including Nigerian Pidgin and Yoruba), runs quiet-chat votes, and drives a transparent OBS browser overlay.

**Mock mode works with zero Twitch credentials and zero paid APIs.** That is the supported demo path for judges.

- Hackathon: [Codex x TwitchCon](https://twitchcon-codex.devpost.com/)
- Codex session ID: `01a17cc0-fef4-7b01-8ddb-2a1e98983343`
- License: MIT

## Quick start (mock demo, no credentials)

Requires Node.js 20+.

```sh
git clone https://github.com/ajocircle-dev/stream-companion.git
cd stream-companion
npm install
cp .env.example .env
npm run demo -- --speed=2
```

Then open [http://localhost:3000/overlay?bg=1](http://localhost:3000/overlay?bg=1) in a browser. The demo starts the mock server and a scripted feeder (180 chat lines across English, Pidgin, Yoruba, French, and Spanish). It includes hype bursts, a quiet stretch that triggers a vote, votes, and streamer `!reply` examples.

Useful variants:

```sh
npm run demo -- --speed=10          # faster chat
npm run demo -- --speed=2 --loop    # replay continuously
# static preview without the feeder:
# start server with npm run dev, then open /overlay?demo=1&bg=1
```

## Features

- **Hype detection** with cooldown and a short rolling window, then Helix markers/clips (mocked in mock mode)
- **Multilingual translation** chain: Pidgin phrase list, Yoruba glossary, optional local LibreTranslate, optional local NLLB (Yoruba), optional OpenAI (off by default)
- **Quiet-chat vote game** (`!vote a|b|c`) when chat slows down
- **Streamer `!reply <lang> <text>`** to push a translated reply into chat
- **OBS browser overlay** over Server-Sent Events (hype meter, moments, translations, active vote)

```text
Twitch EventSub / mock feeder
          | normalized ChatMessage
          v
   hype detector --> clipper --> Helix marker + clip
          |
          |--> translator chain --> translations
          +--> quiet detector --> vote game --> chat reply
                         |
                         v
            Express state + SSE events
                         |
                         v
                OBS browser overlay
```

`POST /mock/chat` accepts `{ "user": "name", "text": "message", "emotes": [] }` in mock mode. `/state` returns the latest snapshot; `/events` streams updates.

## How Codex was used

All application code in this repo was written with **OpenAI Codex CLI** in one continuous thread during the hackathon window (27 to 28 Oct 2026 WAT).

| Turn | Focus |
| --- | --- |
| 1 | Phase 1 scaffold: mock Twitch layer, hype clipper, translator, vote game, SSE overlay, feeder, tests, README |
| 2 | Readability pass, Prettier, split tests, richer Pidgin/Yoruba data, overlay polish |
| 3 | Phase 2: LibreTranslate health + wiring, local NLLB Yoruba server, Pidgin phrase expansion, overlay and hype fixes |

Prompt and turn logs live under [`docs/codex-log/`](docs/codex-log/). Overlay screenshots: [`docs/shots/`](docs/shots/).

## Optional local translation services

Mock demo already works without these. They only improve translation quality when available.

**LibreTranslate** (optional):

```sh
docker run -p 5000:5000 libretranslate/libretranslate
# then keep LIBRETRANSLATE_URL=http://127.0.0.1:5000 in .env
```

**Local NLLB** (optional Yoruba/English). Set `NLLB_MODEL_PATH` to a CTranslate2 int8 NLLB-200 distilled 600M directory, install `ctranslate2` and `transformers` in your Python env, then:

```sh
export NLLB_MODEL_PATH=/path/to/nllb-200-distilled-600M-ct2-int8
npm run nllb
```

If LibreTranslate or NLLB is down, the app fails soft to the next provider (Pidgin phrases and Yoruba glossary stay offline).

OpenAI translation stays **off** (`OPENAI_ENABLED=false`). This project does not require paid APIs.

## OBS browser source

Add a Browser Source pointing to `http://localhost:3000/overlay`, width `1920`, height `1080`. The page uses a transparent background. Add `?bg=1` for a checker preview. Keep the local app running while OBS uses the source.

## Environment

Copy `.env.example` to `.env`. Mock mode is the default.

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
| HYPE_* / QUIET_* / VOTE_* / GAME_* | Tuning knobs | see `.env.example` |

## Live Twitch setup (optional)

Create a free Twitch developer application and a user token. Set `MODE=live`, client ID, token, broadcaster ID, and bot user ID. Grant scopes: `user:read:chat`, `user:write:chat`, `channel:manage:broadcast`, `clips:edit`. EventSub listens for `channel.chat.message`; Helix creates markers/clips and sends chat. Live mode needs valid credentials and an active stream. Mock mode remains the supported judge demo path.

## Development

```sh
npm run dev                 # mock server
npm run feed -- --speed 10  # feed into a running mock server
npm run feed -- --loop      # replay continuously
npm run nllb                # optional local NLLB service
npm test
npm run typecheck
npm run build
npm run format
```

## Tech stack

- Node.js 20+, TypeScript, Express
- vitest, tsx, Prettier
- Twitch EventSub + Helix (live mode)
- LibreTranslate / CTranslate2 NLLB (optional local)
- Vanilla HTML/CSS/JS overlay over SSE

## License

MIT. See [LICENSE](LICENSE).
