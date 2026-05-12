"""One-off splice: insert user-recorded Phantom wallet clip into tech-demo
as scene 02 (between intro and merchant)."""

from __future__ import annotations

import asyncio
import json
import subprocess
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
USER_CLIP = Path(r"C:\Users\suanw\projects\conexple\clip\Conexple — Open consumer affiliate protocol on Solana - Google Chrome 2569-05-12 12-06-31.mp4")
WORK = ROOT / "agent-temp" / "video" / "wallet-splice"
NARR_MP3 = WORK / "wallet_narr.mp3"
SCENE_MP4 = WORK / "wallet_scene.mp4"
OUT = ROOT / "submission" / "videos" / "tech-demo.mp4"
SCENES_DIR = ROOT / "agent-temp" / "video" / "screencast" / "scenes"

NARRATION = (
    "On the consumer side. "
    "Click Select Wallet, choose Phantom on devnet. "
    "The wallet adapter builds a register-Position instruction client-side, "
    "the wallet signs, the Position lives on chain. "
    "No password, no signup form — just a wallet and a referral."
)


def dur(path: Path) -> float:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(r.stdout.strip())


async def gen_narration() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    comm = edge_tts.Communicate(NARRATION, "en-US-AriaNeural", rate="+0%")
    await comm.save(str(NARR_MP3))


def process_user_clip(narr_dur: float) -> None:
    target = narr_dur + 0.5
    skip_head = 1.0
    fade = 0.5
    fade_out = max(target - fade, 0)
    # Scale user's recording (likely 1280x720 or other) to fit 1920x1080 with
    # ink letterbox if aspect mismatch. Mute user audio.
    vf = (
        "scale=1920:1080:force_original_aspect_ratio=decrease,"
        "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0E1116,"
        f"fade=t=in:st=0:d={fade},"
        f"fade=t=out:st={fade_out:.3f}:d={fade}"
    )
    user_clip_dur = dur(USER_CLIP)
    usable = user_clip_dur - skip_head
    # If user clip shorter than narration, loop. Else trim.
    loop_flag = "-1" if usable < target else "0"
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-stream_loop", loop_flag,
        "-i", str(USER_CLIP),
        "-ss", f"{skip_head:.2f}",
        "-i", str(NARR_MP3),
        "-t", f"{target:.3f}",
        "-vf", vf,
        "-map", "0:v",
        "-map", "1:a",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30",
        "-c:a", "aac", "-b:a", "192k",
        str(SCENE_MP4),
    ]
    subprocess.run(cmd, check=True)
    print(f"  wallet scene: {dur(SCENE_MP4):.1f}s, user_clip raw {user_clip_dur:.1f}s")


def splice_into_tech_demo() -> None:
    scene_order = [
        SCENES_DIR / "01_intro.mp4",
        SCENE_MP4,  # NEW wallet scene
        SCENES_DIR / "02_merchant.mp4",
        SCENES_DIR / "03_operator.mp4",
        SCENES_DIR / "04_explorer.mp4",
        SCENES_DIR / "05_close.mp4",
    ]
    for p in scene_order:
        if not p.exists():
            raise SystemExit(f"missing: {p}")

    list_file = WORK / "concat.txt"
    list_file.write_text("\n".join(f"file '{p.as_posix()}'" for p in scene_order))

    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "concat", "-safe", "0", "-i", str(list_file),
        "-c", "copy",
        str(OUT),
    ]
    subprocess.run(cmd, check=True)
    total = dur(OUT)
    size_mb = OUT.stat().st_size / 1024 / 1024
    print(f"  tech-demo.mp4: {total:.1f}s, {size_mb:.1f}MB")


async def main() -> None:
    if not USER_CLIP.exists():
        raise SystemExit(f"user clip not found: {USER_CLIP}")

    print("[1/3] generate Aria narration for wallet scene...")
    await gen_narration()
    narr_dur = dur(NARR_MP3)
    print(f"  narration: {narr_dur:.1f}s")

    print("[2/3] process user wallet clip (scale, fade, overlay narration)...")
    process_user_clip(narr_dur)

    print("[3/3] splice into tech-demo (intro + WALLET + merchant + operator + explorer + close)...")
    splice_into_tech_demo()

    print("\nDONE -> submission/videos/tech-demo.mp4")


if __name__ == "__main__":
    asyncio.run(main())
