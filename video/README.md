# Leash demo video

Motion graphics in [Remotion](https://www.remotion.dev) around real screen recordings of Leash. 1920×1080, 30 fps, 2:03.
Output: `out/leash-demo.mp4`, `out/thumbnail.png` (1280×720), `out/leash-demo.gif` (13 s, for the README).

## Rebuild

```bash
# 0. the app, three servers (keys only where a scene needs them; .env is never printed)
npm ci && npm run web:build                                     # repo root
PAYPAL_CLIENT_ID= PAYPAL_CLIENT_SECRET= GEMINI_API_KEY= PORT=4400 LEASH_DB=/tmp/recA.db \
  node --env-file=.env --disable-warning=ExperimentalWarning server/index.ts   # SIMULATED: demo, ledger, mandate, author
PORT=4401 LEASH_DB=/tmp/recB.db \
  node --env-file=.env --disable-warning=ExperimentalWarning server/index.ts   # LIVE-FIRE: only for /proof (read-only GETs)

# 1. record (headless Chrome screencast, 1920×1080, visible cursor) → /recording (gitignored)
node video/record/record-app.mjs   http://127.0.0.1:4400 recording   # desktop.mp4 + phone.mp4
node video/record/record-proof.mjs http://127.0.0.1:4401 recording   # proof.mp4
node video/record/record-term.mjs  recording http://127.0.0.1:4400   # terminal.mp4 (real npm test + replay output)

# 2. cut, preview, render
cd video && npm install
bash cut_clips.sh                                   # → public/clips + public/thumb
npx remotion studio src/index.ts                    # preview + scrub
npm run render                                      # → out/leash-silent.mp4
npm run thumbnail                                   # → out/thumbnail.png

# 3. audio
bash make_music.sh 123.4                            # synthesized 120 BPM beat → out/music.wav
python -m venv .venv && .venv/Scripts/pip install google-genai python-dotenv
.venv/Scripts/python make_vo.py                     # Gemini TTS (voice Fenrir) → out/vo/NN.wav + timing.json, then transcribes each line
.venv/Scripts/python make_vo.py 11 12               # regenerate only lines 11 and 12
.venv/Scripts/python make_vo.py --check             # transcribe existing lines with Gemini and report
.venv/Scripts/python check_vo_local.py              # same check offline with Whisper (pip install faster-whisper)
.venv/Scripts/python mix_audio.py                   # ducked mix, -15 LUFS → out/leash-demo.mp4
```

Set `FFMPEG`/`FFPROBE` (and `CHROME` for the recorders) if they are not on PATH.
`make_vo.py` reads `GEMINI_API_KEY` from the repo's `.env`. Free-tier keys get 10 TTS requests per model per day; the
script takes one request per line, so a full run needs the quota for 16 lines (or `VO_MODEL=gemini-3.8-flash-lite-tts` for some).

## Honesty rules

- Every screen is an unedited recording, only sped up; the speed is on screen in each frame (`REAL UI · unedited · 1.4×`).
- Motion-graphics scenes carry a `MOTION GRAPHIC` label.
- The demo lanes are SIMULATED (fake captures, the final PayPal call is stubbed); every demo scene says so under the frame.
  The "without Leash" lane replays the agent's request; the recording server had no PayPal keys, so its badge reads SIMULATED.
- `/proof` was recorded on a separate server with sandbox keys: the "PayPal now" column was fetched live from PayPal while recording.
- The Author scene shows the recorded sample compile (keyless server), and says so.
- The phone scene is a phone-width browser (390×844), and says so.
- Numbers come from today's test run (103/103) and docs/Product/IMPACT_AND_EVIDENCE.md (benchmarks, with n on screen).
- No PayPal logo or other third-party branding.

## Scenes

| # | Scene | Source | Clip |
|---|---|---|---|
| 1–3 | Cold open, logo, problem | motion graphic | |
| 4 | Prompt injection: $200 vs BLOCKED | desktop 0:00.4–0:11.6 @1.4× | c1_inject |
| 5 | Honest $18 allowed | desktop 0:11.8–0:19.0 @1.4× | c2_allow |
| 6 | $75 escalates | desktop 0:19.1–0:26.0 @1.2× | c3_escalate |
| 7 | Approve on a phone | phone 0:00–0:13.4 @1.5× | c4_phone |
| 8 | Retry executes once | desktop 0:42.3–0:47.4 @1× | c5_retry |
| 9 | How it works | motion graphic | |
| 10 | Ledger | desktop 0:47.5–0:56.3 @1.4× | c6_ledger |
| 11 | Mandate | desktop 0:56.4–1:03.1 @1.2× | c7_mandate |
| 12 | Policy compiler | desktop 1:03.2–1:17.8 @1.8× | c8_author |
| 13 | Live sandbox proof | proof 0:00.4–0:12.6 @1.3× | c9_proof |
| 14 | Tests + replay | terminal 0:00.5–0:21.7 @2× | c10_tests |
| 15–16 | Stats, end card | motion graphic | |

Clip timings live in `src/clips.ts` and `cut_clips.sh` (keep them in sync); voice-over start times in `make_vo.py` follow the scene starts in `src/Root.tsx`.
