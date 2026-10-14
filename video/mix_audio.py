"""Mix out/music.wav + out/vo/*.wav onto the silent render: each line delayed to its start (timing.json),
music side-chain ducked under the voice, loudnorm -15 LUFS / -1.5 dBTP, limiter, 48 kHz AAC 192k, video stream copied.

  .venv/Scripts/python mix_audio.py   → out/leash-demo.mp4
"""
import json
import os
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
FFMPEG = os.getenv("FFMPEG", "ffmpeg")
timing = json.loads((OUT / "vo" / "timing.json").read_text())
keys = sorted(timing)
args = [FFMPEG, "-v", "error", "-y", "-i", str(OUT / "leash-silent.mp4"), "-i", str(OUT / "music.wav")]
for k in keys:
    args += ["-i", str(OUT / "vo" / f"{k}.wav")]
chains = []
for n, k in enumerate(keys):
    ms = int(timing[k]["start"] * 1000)
    chains.append(f"[{n + 2}:a]aformat=sample_rates=44100:channel_layouts=stereo,adelay={ms}|{ms}[v{n}]")
vo_in = "".join(f"[v{n}]" for n in range(len(keys)))
chains += [
    f"{vo_in}amix=inputs={len(keys)}:normalize=0,volume=1.6,apad[vo]",
    "[vo]asplit=2[vo_a][vo_key]",
    "[1:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=0.5[mus]",
    "[mus][vo_key]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=450:makeup=1[ducked]",
    "[ducked][vo_a]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.9,loudnorm=I=-15:TP=-1.5:LRA=9,alimiter=limit=0.84:level=false,aresample=48000[out]",
]
args += ["-filter_complex", ";".join(chains), "-map", "0:v", "-map", "[out]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
         "-shortest", "-movflags", "+faststart", str(OUT / "leash-demo.mp4")]
subprocess.run(args, check=True)
print("wrote", OUT / "leash-demo.mp4")
