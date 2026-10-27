Phase 1 is built in the repo: mock-first TypeScript bot, Twitch live adapters, hype detection and clipper, translation routing, quiet-chat votes, SSE server, OBS overlay, scripted feeder, tests, and README.

Verified: `npm install` succeeded using a writable cache; typecheck, tests (8 passed), and build pass. The smoke test confirmed `/state` updates, mock clip creation, and both `!reply` examples. Processes were stopped.

Run `npm run demo -- --speed=2`, then open `http://localhost:3000/overlay?bg=1`. The install reported 3 dependency audit vulnerabilities (1 moderate, 2 critical). No commit or push was made.