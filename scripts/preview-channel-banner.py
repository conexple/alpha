"""Preview the Conexple social cover set.

- YouTube channel banner: 2560x1440 (safe area 1546x423 centered)
- X / Twitter header:     1500x500  (avoid bottom-left ~200x200 = profile photo overlay)

Output goes to agent-temp/youtube-set/ for iteration before promoting to
submission/. Rendered via Playwright Chromium + HTML/CSS.

Usage:
    python scripts/preview-channel-banner.py            # both, version v1
    python scripts/preview-channel-banner.py v2         # both, version v2
    python scripts/preview-channel-banner.py v2 youtube # only youtube, v2
    python scripts/preview-channel-banner.py v2 twitter # only twitter, v2
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "agent-temp" / "youtube-set"


CHANNEL_HTML = """
<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', system-ui, sans-serif;
    background: #FBF7F1;
    color: #0E1116;
    width: 2560px; height: 1440px;
    position: relative;
    overflow: hidden;
  }
  /* Giant faded brand dot bleeds off the right edge.
     Only visible on TV-wide view (>2048px); safe area stays clean. */
  .ornament-dot {
    position: absolute;
    right: -480px;
    top: 50%;
    transform: translateY(-50%);
    width: 1400px;
    height: 1400px;
    border-radius: 50%;
    background: rgba(176, 132, 255, 0.05);
    pointer-events: none;
  }
  /* Safe area = 1546x423 centered. This is what mobile/desktop sees. */
  .safe {
    position: absolute;
    width: 1546px;
    height: 423px;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    z-index: 2;
  }
  .top-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .wordmark {
    font-family: 'Georgia', 'Times New Roman', serif;
    font-size: 56px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #0E1116;
    display: inline-flex;
    align-items: baseline;
    gap: 14px;
  }
  .wordmark .dot {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #B084FF;
    display: inline-block;
  }
  .meta {
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 18px;
    letter-spacing: 0.22em;
    color: #5B6E48;
    text-transform: uppercase;
  }
  .headline {
    font-family: 'Georgia', 'Times New Roman', serif;
    font-size: 124px;
    line-height: 1.0;
    letter-spacing: -0.025em;
    font-weight: 700;
    color: #0E1116;
  }
  .headline em {
    color: #B084FF;
    font-style: normal;
  }
  .subtitle {
    font-family: 'Georgia', 'Times New Roman', serif;
    font-size: 26px;
    line-height: 1.45;
    color: #5B6E48;
    max-width: 1100px;
  }
</style></head>
<body>
  <div class="ornament-dot"></div>
  <div class="safe">
    <div class="wordmark">conexple<span class="dot"></span></div>
    <div class="headline">Consumption becomes<br><em>basic income.</em></div>
    <div class="subtitle">Open consumer affiliate protocol on Solana &mdash; community-produced, on-chain, verifiable.</div>
  </div>
</body></html>
"""


TWITTER_HTML = """
<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', system-ui, sans-serif;
    background: #FBF7F1;
    color: #0E1116;
    width: 1500px; height: 500px;
    position: relative;
    overflow: hidden;
  }
  /* Subtle dot bleed on right edge. Mirrors the YouTube banner motif. */
  .ornament-dot {
    position: absolute;
    right: -260px;
    top: 50%;
    transform: translateY(-50%);
    width: 620px;
    height: 620px;
    border-radius: 50%;
    background: rgba(176, 132, 255, 0.06);
    pointer-events: none;
  }
  .content {
    position: absolute;
    top: 56px;
    left: 80px;
    right: 80px;
    z-index: 2;
  }
  .wordmark {
    font-family: 'Georgia', 'Times New Roman', serif;
    font-size: 34px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #0E1116;
    display: inline-flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 48px;
  }
  .wordmark .dot {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #B084FF;
    display: inline-block;
  }
  .headline {
    font-family: 'Georgia', 'Times New Roman', serif;
    font-size: 100px;
    line-height: 1.0;
    letter-spacing: -0.025em;
    font-weight: 700;
    color: #0E1116;
  }
  .headline em {
    color: #B084FF;
    font-style: normal;
  }
</style></head>
<body>
  <div class="ornament-dot"></div>
  <div class="content">
    <div class="wordmark">conexple<span class="dot"></span></div>
    <div class="headline">Consumption becomes<br><em>basic income.</em></div>
  </div>
</body></html>
"""


SPECS: dict[str, dict] = {
    "youtube": {"html": CHANNEL_HTML, "width": 2560, "height": 1440, "stem": "channel-banner"},
    "twitter": {"html": TWITTER_HTML, "width": 1500, "height": 500,  "stem": "twitter-header"},
}


async def render_one(name: str, version: str) -> Path:
    spec = SPECS[name]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{spec['stem']}-{version}.png"
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": spec["width"], "height": spec["height"]},
            device_scale_factor=1,
        )
        page = await context.new_page()
        await page.set_content(spec["html"], wait_until="load")
        await page.wait_for_timeout(400)
        await page.screenshot(path=str(out), type="png", full_page=False)
        await context.close()
        await browser.close()
    print(f"  -> {out.relative_to(ROOT)}  ({out.stat().st_size // 1024} KB)")
    return out


async def render(version: str, only: str | None) -> None:
    targets = [only] if only else list(SPECS.keys())
    for name in targets:
        await render_one(name, version)


if __name__ == "__main__":
    version = sys.argv[1] if len(sys.argv) > 1 else "v1"
    only = sys.argv[2] if len(sys.argv) > 2 else None
    asyncio.run(render(version, only))
