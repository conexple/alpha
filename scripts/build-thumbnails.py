"""Render YouTube thumbnails for the pitch + tech-demo videos.

Outputs: submission/videos/{pitch,tech-demo}-thumbnail.png at 1280x720.
"""

from __future__ import annotations

import asyncio
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "submission" / "videos"

PITCH_HTML = """
<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', system-ui, sans-serif;
    background: #FBF7F1;
    color: #0E1116;
    width: 1280px; height: 720px;
    padding: 60px 80px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    position: relative;
    overflow: hidden;
  }
  .ornament {
    position: absolute;
    right: -60px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 540px;
    line-height: 1;
    color: rgba(176, 132, 255, 0.07);
    font-family: 'Georgia', 'Times New Roman', serif;
    font-weight: 700;
    user-select: none;
  }
  .top-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    z-index: 1;
  }
  .wordmark {
    font-family: 'Georgia', serif;
    font-size: 32px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #0E1116;
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
  }
  .wordmark .dot {
    width: 14px; height: 14px;
    border-radius: 50%;
    background: #B084FF;
    display: inline-block;
  }
  .meta {
    font-family: 'Consolas', monospace;
    font-size: 14px;
    letter-spacing: 0.18em;
    color: #5B6E48;
    text-transform: uppercase;
  }
  .center {
    flex: 1;
    display: flex;
    align-items: center;
    z-index: 1;
  }
  .headline {
    font-family: 'Georgia', serif;
    font-size: 112px;
    line-height: 1.02;
    letter-spacing: -0.025em;
    color: #0E1116;
    font-weight: 700;
  }
  .headline em {
    color: #B084FF;
    font-style: normal;
  }
  .bottom-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    z-index: 1;
  }
  .tagline {
    font-family: 'Georgia', serif;
    font-size: 22px;
    color: #5B6E48;
    max-width: 560px;
    line-height: 1.4;
  }
  .badge {
    background: #0E1116;
    color: #FBF7F1;
    padding: 12px 24px;
    border-radius: 999px;
    font-family: 'Consolas', monospace;
    font-size: 15px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
</style></head>
<body>
  <div class="ornament">÷7</div>
  <div class="top-row">
    <div class="wordmark">conexple<span class="dot"></span></div>
    <div class="meta">Colosseum Frontier 2026</div>
  </div>
  <div class="center">
    <div class="headline">Pay loyal<br>customers,<br><em>not influencers.</em></div>
  </div>
  <div class="bottom-row">
    <div class="tagline">Open consumer affiliate protocol on Solana — same merchant budget, redirected on chain.</div>
    <div class="badge">Pitch · 3 min</div>
  </div>
</body></html>
"""

TECH_HTML = """
<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', system-ui, sans-serif;
    background: #FBF7F1;
    color: #0E1116;
    width: 1280px; height: 720px;
    padding: 60px 80px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    position: relative;
    overflow: hidden;
  }
  .ornament {
    position: absolute;
    right: -30px;
    bottom: -100px;
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 180px;
    line-height: 1;
    color: rgba(91, 110, 72, 0.06);
    font-weight: 700;
    user-select: none;
    letter-spacing: -0.04em;
    transform: rotate(-8deg);
    text-align: right;
  }
  .top-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    z-index: 1;
  }
  .wordmark {
    font-family: 'Georgia', serif;
    font-size: 32px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #0E1116;
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
  }
  .wordmark .dot {
    width: 14px; height: 14px;
    border-radius: 50%;
    background: #B084FF;
  }
  .meta {
    font-family: 'Consolas', monospace;
    font-size: 14px;
    letter-spacing: 0.18em;
    color: #5B6E48;
    text-transform: uppercase;
  }
  .center {
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 36px;
  }
  .headline {
    font-family: 'Georgia', serif;
    font-size: 84px;
    line-height: 1.02;
    letter-spacing: -0.025em;
    color: #0E1116;
    font-weight: 700;
  }
  .headline em {
    color: #5B6E48;
    font-style: normal;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 28px;
    border-top: 2px solid #5B6E48;
    padding-top: 24px;
    max-width: 1000px;
  }
  .stat-value {
    font-family: 'Consolas', monospace;
    font-size: 56px;
    line-height: 1;
    color: #5B6E48;
    font-weight: 700;
    letter-spacing: -0.02em;
    margin-bottom: 8px;
  }
  .stat-label {
    font-size: 13px;
    color: #555;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    line-height: 1.4;
  }
  .bottom-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    z-index: 1;
  }
  .tagline {
    font-family: 'Georgia', serif;
    font-size: 22px;
    color: #5B6E48;
    max-width: 560px;
    line-height: 1.4;
  }
  .badge {
    background: #5B6E48;
    color: #FBF7F1;
    padding: 12px 24px;
    border-radius: 999px;
    font-family: 'Consolas', monospace;
    font-size: 15px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    font-weight: 600;
  }
</style></head>
<body>
  <div class="ornament">{&nbsp;}</div>
  <div class="top-row">
    <div class="wordmark">conexple<span class="dot"></span></div>
    <div class="meta">Live on Solana devnet</div>
  </div>
  <div class="center">
    <div class="headline">4 Anchor programs.<br>One <em>BYOK</em> proof.</div>
    <div class="stats">
      <div>
        <div class="stat-value">4</div>
        <div class="stat-label">Anchor<br>programs</div>
      </div>
      <div>
        <div class="stat-value">21</div>
        <div class="stat-label">Positions<br>on chain</div>
      </div>
      <div>
        <div class="stat-value">6</div>
        <div class="stat-label">Merchants<br>· 3 BYOK</div>
      </div>
      <div>
        <div class="stat-value">6,417</div>
        <div class="stat-label">Base units<br>paid</div>
      </div>
    </div>
  </div>
  <div class="bottom-row">
    <div class="tagline">Four Anchor programs, twenty-one positions, six merchants — every accrual verifiable on Solscan.</div>
    <div class="badge">Tech demo · 2 min</div>
  </div>
</body></html>
"""


async def render_one(html: str, out: Path) -> None:
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 720},
            device_scale_factor=1,
        )
        page = await context.new_page()
        await page.set_content(html, wait_until="load")
        await page.wait_for_timeout(400)
        await page.screenshot(path=str(out), type="png", full_page=False)
        await context.close()
        await browser.close()
    print(f"  -> {out.name}  ({out.stat().st_size // 1024} KB)")


async def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print("rendering thumbnails @ 1280x720 PNG")
    await render_one(PITCH_HTML, OUT_DIR / "pitch-thumbnail.png")
    await render_one(TECH_HTML, OUT_DIR / "tech-demo-thumbnail.png")
    print("\nDONE")


if __name__ == "__main__":
    asyncio.run(main())
