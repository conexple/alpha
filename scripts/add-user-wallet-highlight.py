"""Append a new scene that navigates to /explorer and highlights the user's
connected wallet (FABRyGWFkWLVCPUnTsX21DsU1jDQFuhgpEHHvtCJ7xCM) — the
position that just received a commission on chain from demo-X's purchase.

Inserts between the existing explorer scene and the close scene of tech-demo."""

from __future__ import annotations

import asyncio
import os
import re
import subprocess
from pathlib import Path

import edge_tts
from playwright.async_api import async_playwright, Page

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / "agent-temp" / "video" / "user-highlight"
RAW = WORK / "raw"
NARR_MP3 = WORK / "user_highlight.mp3"
RAW_WEBM = WORK / "user_highlight.webm"
SCENE_MP4 = WORK / "user_highlight.mp4"
OUT = ROOT / "submission" / "videos" / "tech-demo.mp4"

# Existing tech-demo scenes (rendered earlier by build-tech-screencast.py)
SCENES_DIR = ROOT / "agent-temp" / "video" / "screencast" / "scenes"
# Wallet scene from user's clip (already spliced once via splice-wallet.py)
WALLET_SCENE = ROOT / "agent-temp" / "video" / "wallet-splice" / "wallet_scene.mp4"

SITE = "https://conexple-worker-web.sornwin.workers.dev"
USER_WALLET = os.environ.get("USER_WALLET", "FABRyGWFkWLVCPUnTsX21DsU1jDQFuhgpEHHvtCJ7xCM")
USER_SHORT_PREFIX = USER_WALLET[:4]
USER_SHORT_SUFFIX = USER_WALLET[-4:]

VOICE = "en-US-AriaNeural"

NARRATION = (
    "And here's the proof, end to end. "
    "The user's connected wallet is in the network. "
    "A purchase from a downline just settled on chain — "
    "commission flows up to this position. "
    "Earned column updated, every accrual Solscan-verifiable."
)


def dur(path: Path) -> float:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(r.stdout.strip())


async def smooth_scroll(page: Page, y: int, ms: int = 1500) -> None:
    await page.evaluate(f"window.scrollTo({{top: {y}, behavior: 'smooth'}})")
    await asyncio.sleep(ms / 1000)


async def record_scene() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    for f in RAW.glob("*.webm"):
        f.unlink()

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            record_video_dir=str(RAW),
            record_video_size={"width": 1920, "height": 1080},
        )
        page = await context.new_page()
        await page.goto(f"{SITE}/explorer/")
        await page.wait_for_load_state("networkidle")
        await asyncio.sleep(2.5)

        # Scroll to position table area
        await smooth_scroll(page, 1400, 2000)
        await asyncio.sleep(2.0)
        await smooth_scroll(page, 2400, 1800)
        await asyncio.sleep(1.5)

        # Try to find the user wallet row — pubkey is rendered shortened.
        # Pattern: "{first 4}…{last 4}" or "{first 6}…{last 4}" depending on UI.
        # Search via text containing the prefix.
        try:
            pat = re.compile(rf"{USER_SHORT_PREFIX}.*{USER_SHORT_SUFFIX}")
            row = page.get_by_text(pat).first
            await row.scroll_into_view_if_needed()
            await asyncio.sleep(1.2)
            await row.hover()
            await asyncio.sleep(3.0)
        except Exception as e:
            print(f"  (user wallet row highlight skipped: {e})")
            # fall back — scroll the table area anyway
            await smooth_scroll(page, 2800, 1500)
            await asyncio.sleep(2.0)
        # Linger a moment on the area
        await asyncio.sleep(2.0)
        await context.close()
        await browser.close()

    webms = sorted(RAW.glob("*.webm"))
    if not webms:
        raise SystemExit("no webm recorded")
    latest = webms[-1]
    if latest != RAW_WEBM:
        if RAW_WEBM.exists():
            RAW_WEBM.unlink()
        latest.rename(RAW_WEBM)
    print(f"  raw recording: {RAW_WEBM} ({dur(RAW_WEBM):.1f}s)")


async def gen_narration() -> None:
    comm = edge_tts.Communicate(NARRATION, VOICE)
    await comm.save(str(NARR_MP3))
    print(f"  narration: {dur(NARR_MP3):.1f}s")


def composite_scene() -> None:
    """Pre-trim 1.0s flash + scale + fade + narration overlay."""
    narr_dur = dur(NARR_MP3)
    target = narr_dur + 0.5
    skip = 1.0
    fade = 0.5
    fade_out = max(target - fade, 0)
    raw_dur = dur(RAW_WEBM)
    usable = raw_dur - skip
    loop = "-1" if usable < target else "0"
    vf = (
        f"fade=t=in:st=0:d={fade},"
        f"fade=t=out:st={fade_out:.3f}:d={fade}"
    )
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-stream_loop", loop,
        "-i", str(RAW_WEBM),
        "-ss", f"{skip:.2f}",
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
    print(f"  user-highlight scene: {dur(SCENE_MP4):.1f}s")


def splice_final() -> None:
    """Splice full tech-demo with wallet + highlight scenes inserted."""
    order = [
        SCENES_DIR / "01_intro.mp4",
        WALLET_SCENE,                   # user's Phantom clip
        SCENES_DIR / "02_merchant.mp4",
        SCENES_DIR / "03_operator.mp4",
        SCENES_DIR / "04_explorer.mp4",
        SCENE_MP4,                       # NEW user_wallet highlight
        SCENES_DIR / "05_close.mp4",
    ]
    for p in order:
        if not p.exists():
            raise SystemExit(f"missing: {p}")

    list_file = WORK / "concat.txt"
    list_file.write_text("\n".join(f"file '{p.as_posix()}'" for p in order))

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
    WORK.mkdir(parents=True, exist_ok=True)

    print("[1/4] record user-wallet highlight scene on /explorer ...")
    await record_scene()

    print("[2/4] generate Aria narration ...")
    await gen_narration()

    print("[3/4] composite scene (fade + narration overlay) ...")
    composite_scene()

    print("[4/4] splice into full tech-demo ...")
    splice_final()

    print(f"\nDONE -> {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
