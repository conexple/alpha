"""Build the Conexple pitch video.

Pipeline:
  1. Render pitch-deck.pdf pages -> 1920x1080 PNG slides
  2. Generate Andrew TTS narration per scene (en-US)
  3. ffmpeg per-scene: loop slide image for audio duration -> scene.mp4
  4. ffmpeg concat -> submission/videos/pitch.mp4
"""

from __future__ import annotations

import asyncio
import json
import shutil
import subprocess
from pathlib import Path

import edge_tts
import pymupdf

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "submission" / "pitch-deck.pdf"
WORK = ROOT / "agent-temp" / "video" / "pitch"
SLIDES = WORK / "slides"
AUDIO = WORK / "audio"
SCENES_DIR = WORK / "scenes"
OUT = ROOT / "submission" / "videos" / "pitch.mp4"

VOICE = "en-US-AndrewMultilingualNeural"
RATE = "+8%"

# 8 hand-picked slides. v10 — title head, WHY second, TEAM short, Thank-you close.
# Slide numbers in post-WHY-insert deck:
#   1 title · 2 WHY · 3 problem · 4 broken · 5 ÷7 · 6 direct sale ·
#   7 traced · 8 why solana · 9 vision · 10 architecture · 11 market ·
#   12 business · 13 compliance · 14 TEAM · 15 thank you.
# Target ~1:55. Pitch video field cap = 2 min.
SCENES: list[tuple[int, str]] = [
    (1,
     "Conexple — an open consumer affiliate protocol on Solana. "
     "Built from Bangkok. Apache 2.0."),
    (2,
     "Conexple started because of one thing we couldn't unsee. "
     "AI is going to do more and more of what humans do for income. "
     "The answer can't be waiting for the state. "
     "But every purchase already pays a commission — "
     "it just stops at the influencer who pointed, never the buyer. "
     "What if it kept going? Down to the person who actually bought. "
     "Basic income, built from commerce itself."),
    (5,
     "So how does that work? "
     "Same merchant, same commission they were already paying. "
     "But instead of one influencer pocketing it, "
     "the protocol routes it up the buyer's own referral chain. "
     "A little to a public pool. A little to long-term active customers. "
     "The merchant doesn't notice — only the destination changes."),
    (6,
     "Buyers referring buyers, getting rewarded — that's not new. "
     "That's direct sale. "
     "What's always been broken is trust. Margins drift. Rules get tweaked. "
     "A customer can't audit the spreadsheet that decides their share. "
     "Conexple puts every rule in Rust on Solana. "
     "Not a spreadsheet. A contract."),
    (9,
     "A network like this usually gets stuck — "
     "the first people in stay at the top forever. "
     "Conexple does the opposite. "
     "Each position has a ceiling — ten times the entry spend. "
     "After that, or after inactivity, it expires. "
     "Newer wallets rise. Income opportunity doesn't pool — it moves."),
    (11,
     "Where does this start? "
     "Eighty three percent of Thai shoppers buy on a creator's recommendation. "
     "Forty six billion dollars in regional flow today — "
     "all of it routed past the consumers themselves. "
     "We start in Thailand. The arc moves outward."),
    (14,
     "Four of us, same Kasetsart cohort. Five years shipping together. "
     "Boss runs complex systems lean. "
     "Kan turns hard ideas into ones anyone can learn — teacher by training. "
     "Pee sees what small Thai merchants struggle with, daily. "
     "Ta has the patience only helpdesk teaches. "
     "Bangkok-based."),
    (15,
     "Thank you."),
]


def render_slides() -> None:
    SLIDES.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open(PDF)
    # PDF is 960x540, scale 2x -> 1920x1080
    matrix = pymupdf.Matrix(2.0, 2.0)
    for i, page in enumerate(doc):
        pix = page.get_pixmap(matrix=matrix)
        out = SLIDES / f"slide_{i + 1:02d}.png"
        pix.save(str(out))
    doc.close()
    print(f"  rendered {len(SCENES)} slides -> {SLIDES}")


async def render_audio() -> None:
    AUDIO.mkdir(parents=True, exist_ok=True)
    tasks = []
    for scene_num, text in SCENES:
        out = AUDIO / f"scene_{scene_num:02d}.mp3"
        tasks.append(_gen_one(scene_num, text, out))
    await asyncio.gather(*tasks)
    print(f"  generated {len(SCENES)} audio clips -> {AUDIO}")


async def _gen_one(scene_num: int, text: str, out: Path) -> None:
    communicate = edge_tts.Communicate(text, VOICE, rate=RATE)
    await communicate.save(str(out))


def ffprobe_duration(path: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "json", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(json.loads(result.stdout)["format"]["duration"])


def render_scenes() -> list[Path]:
    SCENES_DIR.mkdir(parents=True, exist_ok=True)
    scene_clips: list[Path] = []
    total = 0.0
    for scene_num, _ in SCENES:
        slide = SLIDES / f"slide_{scene_num:02d}.png"
        audio = AUDIO / f"scene_{scene_num:02d}.mp3"
        out = SCENES_DIR / f"scene_{scene_num:02d}.mp4"
        dur = ffprobe_duration(audio)
        total += dur
        # 0.5s of silence + slide-hold at scene tail = intentional pause between thoughts
        tail = 0.5
        cmd = [
            "ffmpeg", "-y", "-loglevel", "error",
            "-loop", "1", "-i", str(slide),
            "-i", str(audio),
            "-c:v", "libx264", "-tune", "stillimage", "-pix_fmt", "yuv420p",
            "-r", "30",
            "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
            "-af", f"apad=pad_dur={tail}",
            "-t", f"{dur + tail:.3f}",
            str(out),
        ]
        subprocess.run(cmd, check=True)
        scene_clips.append(out)
        print(f"  scene {scene_num:02d}: {dur:5.2f}s + {tail}s tail -> {out.name}")
    print(f"  total estimated duration: {total + len(SCENES) * 0.4:.1f}s")
    return scene_clips


def concat_final(scene_clips: list[Path]) -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    manifest = WORK / "concat.txt"
    with manifest.open("w", encoding="utf-8") as fh:
        for clip in scene_clips:
            fh.write(f"file '{clip.as_posix()}'\n")
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "concat", "-safe", "0", "-i", str(manifest),
        "-c", "copy",
        str(OUT),
    ]
    subprocess.run(cmd, check=True)
    final_dur = ffprobe_duration(OUT)
    size_mb = OUT.stat().st_size / (1024 * 1024)
    print(f"  pitch.mp4: {final_dur:.1f}s, {size_mb:.1f}MB -> {OUT}")


def check_tools() -> None:
    for tool in ("ffmpeg", "ffprobe"):
        if shutil.which(tool) is None:
            raise SystemExit(f"missing tool on PATH: {tool}")
    if not PDF.exists():
        raise SystemExit(f"missing PDF: {PDF}")


async def main() -> None:
    print("[1/4] check tools")
    check_tools()
    print("[2/4] render slides from PDF")
    render_slides()
    print("[3/4] generate TTS audio")
    await render_audio()
    print("[4/4] composite per-scene clips + concat")
    clips = render_scenes()
    concat_final(clips)
    print("\nDONE -> submission/videos/pitch.mp4")


if __name__ == "__main__":
    asyncio.run(main())
