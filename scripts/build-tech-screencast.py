"""Build the Conexple technical demo as a live screencast.

Pipeline:
  1. Playwright records actual browser interactions (scroll, click, hover)
     as webm video per scene
  2. Generate Aria TTS narration per scene
  3. ffmpeg: trim/pad video to narration length, overlay narration audio
  4. ffmpeg concat -> submission/videos/tech-demo.mp4

Different from build-tech-video.py: that one used static screenshots.
This one records the actual product in use, per Frontier brief:
"Should show the live product, not a slide deck, not a code walkthrough."
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

import edge_tts
from playwright.async_api import async_playwright, Page

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / "agent-temp" / "video" / "screencast"
RAW = WORK / "raw"
SCENES_DIR = WORK / "scenes"
AUDIO = WORK / "audio"
OUT = ROOT / "submission" / "videos" / "tech-demo.mp4"

VOICE = "en-US-AriaNeural"
RATE = "+0%"

SITE = "https://conexple-worker-web.sornwin.workers.dev"


async def smooth_scroll(page: Page, target_y: int, duration_ms: int = 1500) -> None:
    """Smooth scroll to a y-position using JS easing."""
    await page.evaluate(
        f"window.scrollTo({{top: {target_y}, behavior: 'smooth'}})"
    )
    await asyncio.sleep(duration_ms / 1000)


async def scene_home(page: Page) -> None:
    """Quick intro — home page hero + scroll past the ecosystem diagram."""
    await page.goto(f"{SITE}/")
    await page.wait_for_load_state("networkidle")
    await asyncio.sleep(1.8)
    await smooth_scroll(page, 600, 1800)
    await asyncio.sleep(1.5)
    await smooth_scroll(page, 1400, 1800)
    await asyncio.sleep(2.0)


async def scene_dashboard(page: Page) -> None:
    """Consumer wallet flow — actually click Select Wallet, modal opens."""
    await page.goto(f"{SITE}/dashboard/")
    await page.wait_for_load_state("networkidle")
    await asyncio.sleep(2.0)
    # Scroll a bit so the dashboard hero (with faucet hint) is visible too
    await smooth_scroll(page, 200, 1200)
    await asyncio.sleep(1.5)
    # Click "Select Wallet" — modal with Phantom/Solflare options opens
    try:
        wallet_btn = page.get_by_role(
            "button", name=re.compile("(Select|Connect) Wallet", re.IGNORECASE)
        ).first
        await wallet_btn.scroll_into_view_if_needed()
        await asyncio.sleep(0.6)
        await wallet_btn.hover()
        await asyncio.sleep(0.5)
        await wallet_btn.click()
        # Wallet adapter modal renders into the page DOM. Wait for it.
        await asyncio.sleep(3.0)
        # Close modal — press Escape (modal-react listens for it)
        await page.keyboard.press("Escape")
        await asyncio.sleep(1.0)
    except Exception as e:
        print(f"  (wallet click skipped: {e})")
        await asyncio.sleep(2.0)
    await smooth_scroll(page, 0, 1200)
    await asyncio.sleep(1.0)


async def scene_operator(page: Page) -> None:
    """Show the operator dashboard + trigger a settlement cycle."""
    await page.goto(f"{SITE}/operator/")
    await page.wait_for_load_state("networkidle")
    await asyncio.sleep(2.0)
    await smooth_scroll(page, 400, 1500)
    await asyncio.sleep(1.5)
    # Click "Trigger cycle now" if present
    try:
        btn = page.get_by_role("button", name="Trigger cycle now")
        await btn.scroll_into_view_if_needed()
        await asyncio.sleep(0.8)
        await btn.hover()
        await asyncio.sleep(0.4)
        await btn.click()
        await asyncio.sleep(3.0)
    except Exception as e:
        print(f"  (trigger cycle button skipped: {e})")
        await asyncio.sleep(2.5)
    await smooth_scroll(page, 0, 1500)
    await asyncio.sleep(1.5)


async def scene_merchant(page: Page) -> None:
    """Multi-merchant dropdown + actually void a fake purchase."""
    await page.goto(f"{SITE}/merchant/")
    await page.wait_for_load_state("networkidle")
    await asyncio.sleep(2.0)
    # Open dropdown + switch to BYOK third-party
    try:
        select = page.locator("select").first
        await select.scroll_into_view_if_needed()
        await asyncio.sleep(0.6)
        await select.hover()
        await asyncio.sleep(0.4)
        options = await page.locator("select option").all_text_contents()
        target = next((o for o in options if "BYOK" in o or "04" in o), None)
        if target:
            await select.select_option(label=target)
        elif len(options) > 1:
            await select.select_option(label=options[1])
        await asyncio.sleep(2.0)
    except Exception as e:
        print(f"  (dropdown skipped: {e})")
        await asyncio.sleep(1.5)
    # Scroll to show vault balance + PDA
    await smooth_scroll(page, 500, 1200)
    await asyncio.sleep(1.5)
    # Type a fake purchase id + click Void purchase — real backend hit
    try:
        textbox = page.get_by_placeholder(
            re.compile("purchase|tx", re.IGNORECASE)
        ).first
        await textbox.scroll_into_view_if_needed()
        await asyncio.sleep(0.6)
        await textbox.click()
        await asyncio.sleep(0.4)
        await textbox.type("demo-void-2026-frontier", delay=60)
        await asyncio.sleep(0.8)
        void_btn = page.get_by_role("button", name=re.compile("void purchase", re.IGNORECASE)).first
        await void_btn.hover()
        await asyncio.sleep(0.4)
        await void_btn.click()
        # The operator returns {voided_rows: 0, purchase_id: "..."} for a non-existent id
        await asyncio.sleep(2.5)
    except Exception as e:
        print(f"  (void interaction skipped: {e})")
        await asyncio.sleep(1.5)
    await asyncio.sleep(1.0)


async def scene_explorer(page: Page) -> None:
    """Show the live network tree + position table + tx feed."""
    await page.goto(f"{SITE}/explorer/")
    await page.wait_for_load_state("networkidle")
    await asyncio.sleep(2.0)
    await smooth_scroll(page, 600, 2000)
    await asyncio.sleep(2.0)
    await smooth_scroll(page, 1400, 2000)
    await asyncio.sleep(2.0)
    await smooth_scroll(page, 2200, 2000)
    await asyncio.sleep(2.0)


async def scene_close(page: Page) -> None:
    """Close — slow scroll through Conexple ecosystem + multi-operator section."""
    await page.goto(f"{SITE}/")
    await page.wait_for_load_state("networkidle")
    await asyncio.sleep(1.5)
    await smooth_scroll(page, 1200, 2200)
    await asyncio.sleep(1.5)
    await smooth_scroll(page, 2400, 2200)
    await asyncio.sleep(1.8)
    await smooth_scroll(page, 3600, 2200)
    await asyncio.sleep(2.0)
    await smooth_scroll(page, 4800, 2200)
    await asyncio.sleep(2.0)
    await smooth_scroll(page, 0, 2500)
    await asyncio.sleep(2.0)


SCENES = [
    {
        "id": "01_intro",
        "fn": scene_home,
        "narration":
            "Let me show you Conexple in action. "
            "This is the live network on Solana devnet. "
            "The home page lays it out — same merchant commission, "
            "redirected from influencers to loyal customers who actually buy. "
            "Every interaction you're about to see touches real on-chain state.",
    },
    {
        "id": "02_wallet",
        "fn": scene_dashboard,
        "narration":
            "Start with the consumer side. "
            "Open the dashboard, click Select Wallet — the adapter shows your options. "
            "Choose Phantom on devnet. The adapter builds a register-Position instruction, "
            "the wallet signs, your Position lives on chain. "
            "No password, no signup form, no recruitment quota — just a wallet and a referral.",
    },
    {
        "id": "03_merchant",
        "fn": scene_merchant,
        "narration":
            "On the merchant side. "
            "Two integration paths: signed webhook from your checkout, "
            "or BYOK — deploy your own MerchantEscrow PDA with your own wallet authority. "
            "Watch — switch between four live merchants. "
            "Three deployer-signed, one BYOK third-party using its own keypair. "
            "Below: vault balance, PDA address, real on-chain merchant data. "
            "Now an admin action — type a purchase identifier, click void purchase. "
            "The operator queries its D1 store, "
            "returns the result on chain if matching, or zero rows if not. "
            "Force-expire is the same shape. "
            "Every action here is real, against the live operator backend.",
    },
    {
        "id": "04_operator",
        "fn": scene_operator,
        "narration":
            "The operator runs the cycle. "
            "A purchase webhook arrives, the Cloudflare Worker queues it, "
            "holds for the configured period, and at settlement time "
            "submits oracle-signed add-earnings instructions on chain. "
            "The settlement history below — those are runs from the last few minutes. "
            "Fresh commissions just landed.",
    },
    {
        "id": "05_explorer",
        "fn": scene_explorer,
        "narration":
            "And here's where it all shows up — live, right now. "
            "Twenty-one Position accounts across three trees. "
            "The earned column updates as commissions land on chain. "
            "Total earned just stepped up — distributions flowing across uplines in real time. "
            "Click any transaction in the feed to trace it on Solscan yourself.",
    },
    {
        "id": "06_vision",
        "fn": scene_close,
        "narration":
            "This is the foundation. "
            "The longer arc: a consumer-funded basic income — "
            "where simply participating in commerce earns you income. "
            "Positions expire after inactivity, so opportunity rotates "
            "through new consumers instead of concentrating. "
            "Direct sale, on chain. Open protocol. Apache 2.0.",
    },
]


async def record_scenes() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    # Clean old raw recordings to avoid stale concat
    for f in RAW.glob("*"):
        f.unlink()

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for scene in SCENES:
            scene_id = scene["id"]
            print(f"  recording {scene_id}…")
            context = await browser.new_context(
                viewport={"width": 1920, "height": 1080},
                record_video_dir=str(RAW),
                record_video_size={"width": 1920, "height": 1080},
            )
            page = await context.new_page()
            try:
                await scene["fn"](page)
            except Exception as e:
                print(f"  (scene {scene_id} errored: {e}, continuing)")
            await context.close()
            # Playwright writes one webm per page-close. Find the latest webm.
            webms = sorted(RAW.glob("*.webm"), key=lambda p: p.stat().st_mtime)
            if not webms:
                raise SystemExit(f"no webm produced for scene {scene_id}")
            latest = webms[-1]
            target = RAW / f"{scene_id}.webm"
            if latest != target:
                latest.rename(target)
        await browser.close()


async def generate_narration() -> None:
    AUDIO.mkdir(parents=True, exist_ok=True)
    for scene in SCENES:
        out = AUDIO / f"{scene['id']}.mp3"
        comm = edge_tts.Communicate(scene["narration"], VOICE, rate=RATE)
        await comm.save(str(out))
        print(f"  {scene['id']}.mp3")


def ffprobe_duration(path: Path) -> float:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "json", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(json.loads(r.stdout)["format"]["duration"])


def composite_scenes() -> None:
    """For each scene: mute browser webm, set duration = narration length
    (trim/loop), overlay narration audio, produce .mp4 with same fps/codec."""
    SCENES_DIR.mkdir(parents=True, exist_ok=True)
    for scene in SCENES:
        scene_id = scene["id"]
        webm = RAW / f"{scene_id}.webm"
        mp3 = AUDIO / f"{scene_id}.mp3"
        out = SCENES_DIR / f"{scene_id}.mp4"

        video_dur = ffprobe_duration(webm)
        audio_dur = ffprobe_duration(mp3)
        # Final scene duration = max(audio, video) — but cap at audio+0.5s tail
        # so we don't drag a silent video tail too long when video is longer.
        target = audio_dur + 0.5
        # If video is shorter than narration, loop video. Else trim.
        cmd = [
            "ffmpeg", "-y", "-loglevel", "error",
            "-stream_loop", "-1" if video_dur < target else "0",
            "-i", str(webm),
            "-i", str(mp3),
            "-t", f"{target:.3f}",
            "-map", "0:v",
            "-map", "1:a",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30",
            "-c:a", "aac", "-b:a", "192k", "-shortest",
            str(out),
        ]
        subprocess.run(cmd, check=True)
        print(f"  {scene_id}: video {video_dur:.1f}s, narration {audio_dur:.1f}s -> {target:.1f}s")


def concat_scenes() -> None:
    """Concatenate scene mp4s using ffmpeg concat demuxer."""
    OUT.parent.mkdir(parents=True, exist_ok=True)
    list_file = WORK / "concat.txt"
    list_file.write_text("\n".join(
        f"file '{(SCENES_DIR / f'{s['id']}.mp4').as_posix()}'"
        for s in SCENES
    ))
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "concat", "-safe", "0", "-i", str(list_file),
        "-c", "copy",
        str(OUT),
    ]
    subprocess.run(cmd, check=True)
    total = ffprobe_duration(OUT)
    size_mb = OUT.stat().st_size / 1024 / 1024
    print(f"  tech-demo.mp4: {total:.1f}s, {size_mb:.1f}MB -> {OUT}")


def pre_flight_live_action() -> dict:
    """Trigger fresh on-chain settlement BEFORE recording so /explorer shows
    a brand-new commission flow during the screencast. Returns {tx_sig, ...}
    or {} if the chain wasn't reachable (recording still proceeds against
    whatever state is live).
    """
    hmac_file = ROOT / "keys" / "webhook-hmac.txt"
    if not hmac_file.exists():
        print(f"  (no HMAC at {hmac_file}, skipping pre-flight)")
        return {}
    hmac = hmac_file.read_text().strip()

    env = os.environ.copy()
    env["OPERATOR_URL"] = "https://conexple-worker-operator.sornwin.workers.dev"
    env["PURCHASE_WEBHOOK_HMAC"] = hmac
    env["BACKDATE_DAYS"] = "60"
    env["NETWORK_ID"] = "1"

    print("  -> demo-purchases.ts (3 fresh webhooks, backdated 60 days)...")
    r = subprocess.run(
        ["pnpm", "exec", "tsx", "scripts/demo-purchases.ts"],
        cwd=str(ROOT), env=env,
        capture_output=True, text=True, timeout=90, shell=True,
        encoding="utf-8", errors="replace",
    )
    out = (r.stdout or "").strip()
    if r.returncode != 0:
        err = (r.stderr or "").strip()
        print(f"  WARN demo-purchases exit {r.returncode}: {err[-200:]}")
    else:
        print(f"  OK: {out.splitlines()[-4:] if out else '(no output)'}")

    print("  -> settle-onchain.ts (process pending, submit add_earnings on chain)...")
    r2 = subprocess.run(
        ["pnpm", "exec", "tsx", "scripts/settle-onchain.ts"],
        cwd=str(ROOT), env=env,
        capture_output=True, text=True, timeout=240, shell=True,
        encoding="utf-8", errors="replace",
    )
    out2 = (r2.stdout or "").strip()
    if r2.returncode != 0:
        err2 = (r2.stderr or "").strip()
        print(f"  WARN settle-onchain exit {r2.returncode}: {err2[-300:]}")
        return {}

    # Extract the latest Solana signature (base58, ~87-88 chars) from output.
    sigs = re.findall(r"[1-9A-HJ-NP-Za-km-z]{85,90}", out2)
    tx_sig = sigs[-1] if sigs else None
    print(f"  fresh on-chain settlement complete. tx: {tx_sig}")
    return {"tx_sig": tx_sig}


async def main() -> None:
    print("[1/5] check tools")
    for tool in ["ffmpeg", "ffprobe"]:
        if not shutil.which(tool):
            raise SystemExit(f"{tool} not on PATH")

    print("[2/5] pre-flight — fresh on-chain settlement so the recording captures real state change")
    ctx = pre_flight_live_action()
    if ctx.get("tx_sig"):
        # Drop a breadcrumb file so anyone debugging the video knows
        # which tx to inspect on Solscan.
        (WORK / "last_tx.txt").parent.mkdir(parents=True, exist_ok=True)
        (WORK / "last_tx.txt").write_text(ctx["tx_sig"])

    print("[3/5] record live browser interactions via Playwright")
    await record_scenes()

    print("[4/5] generate Aria TTS narration")
    await generate_narration()

    print("[5/5] composite per-scene clips + concat")
    composite_scenes()
    concat_scenes()
    print("\nDONE -> submission/videos/tech-demo.mp4")


if __name__ == "__main__":
    asyncio.run(main())
