"""Offline fallback for the voice-over check when Gemini's text models are unavailable: transcribe every
out/vo/NN.wav with a local Whisper model (faster-whisper) and check each line's words and that it ends before its scene does.

  .venv/Scripts/python check_vo_local.py      (needs: pip install faster-whisper; FFMPEG env or ffmpeg on PATH)
"""
import importlib.util
import json
import os
import subprocess
import sys

import numpy as np
from faster_whisper import WhisperModel

sys.stdout.reconfigure(encoding="utf-8")
spec = importlib.util.spec_from_file_location("vo", "make_vo.py")
vo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vo)
FFMPEG = os.getenv("FFMPEG", "ffmpeg")
# scene end times on the timeline (src/Root.tsx), one per voice-over line
SCENE_END = [6.0, 10.5, 18.5, 26.5, 31.633, 37.367, 46.3, 51.4, 65.4, 71.7, 77.3, 85.4, 94.8, 105.4, 115.4, 123.4]
model = WhisperModel(os.getenv("WHISPER_MODEL", "medium.en"), device="cpu", compute_type="int8")
timing = json.load(open("out/vo/timing.json", encoding="utf-8"))
bad = 0
for i, (start, max_s, text) in enumerate(vo.LINES, 1):
    pcm = subprocess.check_output([FFMPEG, "-v", "error", "-i", f"out/vo/{i:02d}.wav", "-f", "s16le", "-ac", "1", "-ar", "16000", "-"])
    segs, _ = model.transcribe(np.frombuffer(pcm, np.int16).astype(np.float32) / 32768, beam_size=5, language="en",
                               initial_prompt="Leash is a refund gate for AI agents that use PayPal.")
    heard = " ".join(s.text.strip() for s in segs)
    score = vo.similar(text, heard)
    end = timing[f"{i:02d}"]["start"] + timing[f"{i:02d}"]["dur"]
    ok = score >= 0.85 and end <= SCENE_END[i - 1] - 0.2
    bad += not ok
    print(f"{i:02d} {'OK ' if ok else 'BAD'} match {score:.2f} · ends {end:6.2f}s, scene ends {SCENE_END[i - 1]:6.2f}s | {heard}")
print("all lines OK" if not bad else f"{bad} line(s) need a look")
