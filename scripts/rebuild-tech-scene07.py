"""Surgical re-build of just Scene 7 (outro) in the tech demo.

Reuses existing github.png screenshot. Re-generates audio + scene mp4 only.
Then polish-videos.py concats everything.

Why surgical: full build-tech-video.py would re-capture all screenshots
including /explorer, which could drift away from pitch's "6,417 base units"
claim if more settlements happened on chain since the initial capture.
"""

from __future__ import annotations

import asyncio
import json
import subprocess
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "agent-temp" / "video" / "tech" / "shots"
AUDIO = ROOT / "agent-temp" / "video" / "tech" / "audio"
SCENES_DIR = ROOT / "agent-temp" / "video" / "tech" / "scenes"

VOICE = "en-US-AriaNeural"
RATE = "+0%"
SCENE_ID = "07_outro"
NARRATION = (
    "Everything you just saw is live on devnet right now. "
    "Open the demo URL, connect a wallet, and trace any transaction on Solscan yourself. "
    "Code is at github.com slash conexple slash alpha — Apache 2.0, unaudited alpha."
)


async def gen_audio(out: Path) -> None:
    comm = edge_tts.Communicate(NARRATION, VOICE, rate=RATE)
    await comm.save(str(out))


def ffprobe_duration(path: Path) -> float:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "json", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(json.loads(r.stdout)["format"]["duration"])


async def main() -> None:
    audio_path = AUDIO / f"{SCENE_ID}.mp3"
    img_path = SHOTS / "github.png"
    scene_out = SCENES_DIR / f"{SCENE_ID}.mp4"

    if not img_path.exists():
        raise SystemExit(f"missing screenshot: {img_path}")

    print(f"  regen audio -> {audio_path.name}")
    await gen_audio(audio_path)

    dur = ffprobe_duration(audio_path)
    tail = 0.4
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-loop", "1", "-i", str(img_path),
        "-i", str(audio_path),
        "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,"
               "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=#0E1116",
        "-c:v", "libx264", "-tune", "stillimage", "-pix_fmt", "yuv420p",
        "-r", "30",
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
        "-af", f"apad=pad_dur={tail}",
        "-t", f"{dur + tail:.3f}",
        str(scene_out),
    ]
    subprocess.run(cmd, check=True)
    print(f"  -> {scene_out.name} ({dur:.2f}s narration + {tail}s tail)")


if __name__ == "__main__":
    asyncio.run(main())
