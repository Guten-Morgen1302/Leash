"""English voice-over for the Leash demo via Gemini TTS, one clip per scene → video/out/vo/NN.wav + timing.json.

  .venv/Scripts/python make_vo.py            # all lines, then transcribe each and regenerate any that came out wrong
  .venv/Scripts/python make_vo.py 7 8        # only (re)generate lines 7 and 8
  .venv/Scripts/python make_vo.py --check    # only transcribe the existing wavs and report

Each line has the scene start (seconds on the video timeline, from src/Root.tsx) and the max length it may take,
which ends 0.5 s before its scene does. No style prompt: this model reads style instructions aloud.
"""

from __future__ import annotations

import difflib
import json
import os
import re
import subprocess
import sys
import time
import wave
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import types

HERE = Path(__file__).resolve().parent
load_dotenv(HERE.parent / ".env")
OUT = HERE / "out" / "vo"
MODEL = os.getenv("VO_MODEL", "gemini-3.8-flash-tts")
VOICE = os.getenv("VO_VOICE", "Fenrir")
# text models for the transcription check, tried in order (any of them may be overloaded)
STT_MODELS = os.getenv("VO_STT_MODELS", "gemini-3.8-flash,gemini-3.7-flash,gemini-3.5-flash,gemini-2.5-flash").split(",")
FFMPEG = os.getenv("FFMPEG", "ffmpeg")
FFPROBE = os.getenv("FFPROBE", "ffprobe")

# (start_seconds, max_seconds, text)
LINES: list[tuple[float, float, str]] = [
    (0.25, 5.4, "A hidden line in a ticket. Your agent refunds two hundred dollars, not eighteen."),
    (6.35, 3.6, "Meet Leash."),
    (10.75, 7.4, "When an agent picks the refund amount, our tests saw it over-refund seventy percent of the time."),
    (18.75, 7.3, "Same agent, same injected ticket. Without Leash, two hundred dollars, gone. With Leash, blocked."),
    (26.75, 4.6, "An honest eighteen-dollar refund goes straight through."),
    (31.9, 5.1, "Seventy-five dollars is over the agent's limit, so a human decides."),
    (37.6, 8.3, "The approval opens on a phone. Approving refunds nothing by itself. It mints a one-time grant."),
    (46.55, 4.5, "The agent retries, and the grant works exactly once."),
    (51.65, 13.2, "Under the hood, the agent never holds the PayPal key. It names items, never amounts. "
                  "Leash prices them, checks live PayPal state, and reserves the money before PayPal is ever called."),
    (65.65, 5.7, "Every decision lands in a hash-chained ledger."),
    (71.95, 5.0, "The limits are plain JSON, shown in plain English."),
    (77.55, 7.5, "Paste in a real refund policy. You get a draft of the rules, and never an invented dollar limit."),
    (85.65, 8.8, "And it's real: refunds through the same gate, on the PayPal sandbox, re-read live from PayPal."),
    (95.05, 10.0, "One hundred and three tests, on two database drivers. Zero failures."),
    (105.65, 9.4, "Forty injected agent runs through the real proxy. Zero dollars over the legitimate refund."),
    (115.65, 6.6, "Leash. Give your agent a refund budget, not your PayPal keys."),
]


def client() -> genai.Client:
    return genai.Client(api_key=os.environ["GEMINI_API_KEY"].strip())


def tts(c: genai.Client, text: str) -> bytes:
    cfg = types.GenerateContentConfig(
        response_modalities=["AUDIO"],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=VOICE))),
    )
    for attempt in range(5):
        try:
            r = c.models.generate_content(model=MODEL, contents=text, config=cfg)
            return r.candidates[0].content.parts[0].inline_data.data
        except Exception as e:  # noqa: BLE001 (rate limits / transient errors: back off and retry)
            print(f"   retry {attempt + 1}: {type(e).__name__}: {str(e)[:120]}")
            time.sleep(6 * (attempt + 1))
    raise SystemExit(f"TTS failed for: {text[:60]}")


def write_wav(path: Path, pcm: bytes) -> float:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(24000)
        w.writeframes(pcm)
    return len(pcm) / 2 / 24000


def duration(path: Path) -> float:
    return float(subprocess.check_output([FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)]))


def trim_and_fit(src: Path, dst: Path, max_s: float) -> float:
    """Trim silence at both ends; speed up (≤ 1.2×) only if the line would overrun its scene."""
    tmp = dst.with_suffix(".trim.wav")
    trim = "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse"
    subprocess.run([FFMPEG, "-v", "error", "-y", "-i", str(src), "-af", trim, str(tmp)], check=True)
    dur = duration(tmp)
    tempo = max(1.0, dur / max_s)
    if tempo > 1.2:
        print(f"   ⚠️ {dst.name}: {dur:.1f}s for a {max_s}s slot, even 1.2× overruns; shorten the text")
        tempo = 1.2
    subprocess.run([FFMPEG, "-v", "error", "-y", "-i", str(tmp), "-af", f"atempo={tempo:.3f}", "-ar", "44100", str(dst)], check=True)
    tmp.unlink()
    return dur / tempo


NUM = {w: i for i, w in enumerate("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split())}
NUM.update({w: 10 * (i + 2) for i, w in enumerate("twenty thirty forty fifty sixty seventy eighty ninety".split())})


def words(t: str) -> list[str]:
    """Normalised words, so "$200" and "two hundred dollars" compare equal."""
    t = re.sub(r"\$(\d+)", r"\1 dollar", t.lower().replace("-", " ").replace("%", " percent"))
    t = re.sub(r"\bdollars\b", "dollar", t)
    out: list[str] = []
    n: int | None = None
    for w in re.sub(r"[^a-z0-9 ]+", " ", t).split():
        if w in NUM:
            n = (n or 0) + NUM[w]
        elif w == "hundred" and n is not None:
            n *= 100
        elif w == "and" and n is not None and n >= 100:
            continue
        else:
            if n is not None:
                out.append(str(n))
                n = None
            out.append(w)
    if n is not None:
        out.append(str(n))
    return out


def transcribe(c: genai.Client, wav: Path) -> str | None:
    audio = types.Part.from_bytes(data=wav.read_bytes(), mime_type="audio/wav")
    for model in STT_MODELS:
        for attempt in range(2):
            try:
                r = c.models.generate_content(model=model.strip(), contents=[audio, "Transcribe this audio exactly. Reply with the words only."])
                return (r.text or "").strip()
            except Exception as e:  # noqa: BLE001
                print(f"   stt {model} {attempt + 1}: {str(e)[:90]}")
                time.sleep(3)
    return None


def similar(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, words(a), words(b)).ratio()


def make(c: genai.Client, i: int, timing: dict) -> None:
    start, max_s, text = LINES[i - 1]
    raw = OUT / f"{i:02d}.raw.wav"
    final = OUT / f"{i:02d}.wav"
    print(f"{i:02d} @ {start:6.2f}s  {text[:70]}")
    write_wav(raw, tts(c, text))
    dur = trim_and_fit(raw, final, max_s)
    raw.unlink()
    timing[f"{i:02d}"] = {"start": start, "dur": round(dur, 2), "max": max_s, "end": round(start + dur, 2)}
    print(f"   → {dur:.2f}s (slot {max_s}s)")


def check(c: genai.Client, ids: list[int], timing: dict, regenerate: bool) -> list[int]:
    bad = []
    for i in ids:
        wav = OUT / f"{i:02d}.wav"
        heard = transcribe(c, wav)
        if heard is None:
            print(f"{i:02d} ⚠️ could not transcribe (all text models unavailable)")
            timing[f"{i:02d}"]["checked"] = "unavailable"
            continue
        score = similar(LINES[i - 1][2], heard)
        ok = score >= 0.85
        print(f"{i:02d} {'✓' if ok else '✗'} {score:.2f}  heard: {heard[:90]}")
        timing[f"{i:02d}"]["heard"] = heard
        timing[f"{i:02d}"]["match"] = round(score, 3)
        if not ok:
            bad.append(i)
    if regenerate:
        for i in bad:
            for attempt in range(3):
                make(c, i, timing)
                heard = transcribe(c, OUT / f"{i:02d}.wav") or ""
                score = similar(LINES[i - 1][2], heard)
                timing[f"{i:02d}"].update(heard=heard, match=round(score, 3))
                print(f"   re-check {score:.2f}: {heard[:90]}")
                if score >= 0.85:
                    break
    return bad


def main(args: list[str]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    c = client()
    timing_path = OUT / "timing.json"
    timing = json.loads(timing_path.read_text()) if timing_path.exists() else {}
    only_check = "--check" in args
    ids = [int(a) for a in args if a.isdigit()] or list(range(1, len(LINES) + 1))
    try:
        if not only_check:
            for i in ids:
                make(c, i, timing)
        check(c, ids, timing, regenerate=not only_check)
    finally:
        timing_path.write_text(json.dumps(timing, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main(sys.argv[1:])
