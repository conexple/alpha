"""Record the Phantom wallet connect flow using the user's real Chrome
profile (where Phantom is already installed + a devnet wallet imported).

WHY: Playwright headless can't interact with the Phantom extension popup
(it lives outside the page DOM). Playwright HEADED with the user's actual
Chrome profile sees Phantom as just another extension. The user clicks
Connect manually; Playwright's record_video captures every frame.

PREREQ:
  - Chrome must be CLOSED (or Chrome process must NOT be using the same
    user_data_dir) when this runs — otherwise the profile lock errors.
  - Phantom installed in that profile, with at least one wallet on devnet.
  - Devnet SOL in the wallet (faucet.solana.com) is helpful if register_member
    is going to be signed.

USAGE:
  cd alpha
  python scripts/record-wallet-flow.py

  The script:
    1. Opens Chrome (with your profile) pointed at alpha.conexple.com/dashboard
    2. You click Select Wallet → Phantom → Confirm in the popup
    3. After the page reflects the connected state, press ENTER in this terminal
    4. Script saves agent-temp/video/wallet-flow/wallet.webm

  Then tell me you're done — I splice it into the tech demo and re-render.
"""

from __future__ import annotations

import asyncio
import os
import subprocess
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / "agent-temp" / "video" / "wallet-flow"
OUT = WORK / "wallet.webm"

SITE = "https://alpha.conexple.com"

# Default Windows Chrome user-data path. Override via $CHROME_USER_DATA_DIR.
DEFAULT_PROFILE = Path(os.environ.get("LOCALAPPDATA", "")) / "Google" / "Chrome" / "User Data"
CHROME_PROFILE = Path(os.environ.get("CHROME_USER_DATA_DIR", str(DEFAULT_PROFILE)))


async def main() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    # Wipe any previous recordings so we always know which webm to use.
    for f in WORK.glob("*.webm"):
        f.unlink()

    record_seconds = int(os.environ.get("RECORD_SECONDS", "75"))

    print()
    print("=" * 70)
    print(f"Chrome profile: {CHROME_PROFILE}")
    print(f"Recording window: {record_seconds} seconds")
    print("=" * 70)

    async with async_playwright() as pw:
        try:
            ctx = await pw.chromium.launch_persistent_context(
                user_data_dir=str(CHROME_PROFILE),
                channel="chrome",
                headless=False,
                viewport={"width": 1280, "height": 720},
                record_video_dir=str(WORK),
                record_video_size={"width": 1280, "height": 720},
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--start-maximized",
                ],
            )
        except Exception as e:
            print()
            print("!! Failed to launch Chrome with your profile.")
            print(f"!! Error: {e}")
            print("!! Most likely cause: Chrome is still running. Close ALL Chrome windows and retry.")
            return

        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto(f"{SITE}/dashboard")

        print()
        print("=" * 70)
        print("USER ACTIONS in the Chrome window that just opened:")
        print()
        print("  1. Click 'Select Wallet' button (top right of the page)")
        print("  2. Choose Phantom from the modal that appears")
        print("  3. Confirm in the Phantom extension popup")
        print("  4. Wait for the dashboard to reflect the connected wallet")
        print()
        print(f"Recording auto-stops in {record_seconds}s. Take your time.")
        print("=" * 70)

        # Print a countdown every 10s so the user knows how much time is left.
        for remaining in range(record_seconds, 0, -10):
            await asyncio.sleep(min(10, remaining))
            print(f"  ... {max(remaining - 10, 0)}s remaining")

        await ctx.close()

    webms = sorted(WORK.glob("*.webm"))
    if not webms:
        print("!! No webm produced — something went wrong with the recording.")
        return
    latest = webms[-1]
    if latest != OUT:
        if OUT.exists():
            OUT.unlink()
        latest.rename(OUT)

    print()
    print("DONE")
    print(f"  -> {OUT}")
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(OUT)],
            capture_output=True, text=True, check=True,
        )
        print(f"  duration: {r.stdout.strip()}s")
    except Exception:
        pass
    print()
    print("Next: tell the agent 'done' and it will splice this into the tech demo.")


if __name__ == "__main__":
    asyncio.run(main())
