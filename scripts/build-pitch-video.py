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
RATE = "+8%"  # +8% needed after Scene 14 grew from "Talk soon" -> interview CTA

# 8 hand-picked slides. Narration ADDS context — not restates the slide.
# Target final ~2:50.
SCENES: list[tuple[int, str]] = [
    (1,
     "Conexple is an open consumer affiliate protocol on Solana. "
     "We redirect the merchant's existing affiliate budget — same money, different routing — "
     "to the people who actually buy. All on chain. Built from Bangkok."),
    (2,
     "Here's a routing problem nobody questions. "
     "Every time you click a discount code from a YouTuber, "
     "the merchant pays a commission. Real money — eighteen billion dollars globally, each year. "
     "The creator takes their cut. The platform takes theirs. "
     "And the buyer — the person who actually made the purchase — gets zero. "
     "Same product, full price."),
    (4,
     "Conexple takes that same merchant budget — not new money — and reroutes it. "
     "Each purchase splits into seven slots. "
     "Five go up the buyer's chain, five levels deep. "
     "One funds a public pool the network governs. "
     "One reserves for long-term active buyers. "
     "The merchant pays exactly what they paid before. "
     "The money just lands somewhere different."),
    (5,
     "Conexple is direct sale, on chain. "
     "Buyers refer buyers and get rewarded — that's the original idea. "
     "The problem has always been trust: no one verifies the margins or the rules. "
     "We put every rule on Solana, enforced in code: "
     "fifty percent margin cap, earnings tied to purchases, "
     "placements only from a referral, five level depth bounded, "
     "Apache 2.0 fork-able anytime."),
    (7,
     "Why Solana specifically. "
     "We're tracking commissions per purchase across four, five settlements at a time. "
     "On Ethereum, even L2s, that economic model burns the entire commission to gas. "
     "On Solana, sub-cent fees make it viable. "
     "USDC settles instantly. We use Helius — Frontier's official RPC partner — "
     "so mainnet migration is a config flag flip."),
    (8,
     "And here's what's actually live, today, on devnet. "
     "Four Anchor programs deployed. Twenty one positions across three trees. "
     "Six merchants on chain — three signed by us, three by independent keypairs — "
     "proving the protocol is truly open. "
     "Seven recorded purchases. Six thousand four hundred base units distributed automatically — "
     "every accrual verifiable on Solscan."),
    (10,
     "Now the market. "
     "We're a Thai team starting in Thailand because we understand the consumer behavior here. "
     "Eighty three percent of Thai shoppers buy on a creator's recommendation. "
     "Thailand is sixteen percent of Southeast Asia's e-commerce. "
     "The whole SEA influencer-driven market is up to forty six billion dollars. "
     "Twenty one billion is directly trackable affiliate — that's our addressable pool. "
     "Thailand first, then the ASEAN arc."),
    (14,
     "Conexple is open protocol — Apache 2.0, opting into the Public Goods award. "
     "Try the live network on devnet today — connect a wallet, see the splits in real time. "
     "Mainnet is next. Conexple Thailand will run as the first operator. "
     "The protocol stays open — fork it, run your own."),
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
