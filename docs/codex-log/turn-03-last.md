**Phase 2 is complete.** LibreTranslate now defaults to the local service, checks `/languages` with a 30-second cache, and fails soft to later providers. The local NLLB server loaded the CT2 int8 model; **149 Pidgin phrases** now support reverse replies, the overlay translations panel is right-aligned, and the feeder has a pause between bursts.

Verification passed: format, typecheck, build, Python syntax check, and **49 tests**. The mock smoke test showed French translated by LibreTranslate and Yoruba translated by NLLB. OpenAI stayed off; no paid APIs were called. No commit or push was made.

The old 30-second cooldown exceeded the roughly 11-second gap between bursts at `--speed=2`, suppressing the second spike. The default is now 12 seconds, with a 3-second rolling score and matching baseline; tests cover bursts 15 seconds apart, bursts inside cooldown, and a boundary-crossing burst. I also added a short feed pause so the demo clears the cooldown.

One model-quality caveat: NLLB loaded and translated `Ẹ ṣé` as “Thank you,” but a separate greeting probe produced inaccurate output. The glossary remains available when NLLB is unavailable.
