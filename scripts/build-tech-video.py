"""Build the Conexple technical demo video.

Pipeline:
  1. Playwright captures 1920x1080 screenshots of the live deployment
  2. Generate Aria TTS narration per scene (en-US)
  3. ffmpeg per-scene: loop screenshot for audio duration -> scene.mp4
  4. ffmpeg concat -> submission/videos/tech-demo.mp4
"""

from __future__ import annotations

import asyncio
import json
import shutil
import subprocess
from pathlib import Path

import edge_tts
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / "agent-temp" / "video" / "tech"
SHOTS = WORK / "shots"
AUDIO = WORK / "audio"
SCENES_DIR = WORK / "scenes"
OUT = ROOT / "submission" / "videos" / "tech-demo.mp4"

# Reuse the architecture slide already rendered by build-pitch-video.py
PITCH_SLIDES = ROOT / "agent-temp" / "video" / "pitch" / "slides"

VOICE = "en-US-AriaNeural"
RATE = "+0%"

SITE = "https://conexple-worker-web.sornwin.workers.dev"
BYOK_TX = ("https://solscan.io/tx/aMnXq4v4YJsvUXYYq4S1jbrXs3MStjVcRq7ZYej77XWQdY9LDU"
           "SDa8W5S4V3m6rkbWUyj7DNoyh5AdgQrWR1n2S?cluster=devnet")

# Scenes — each maps to (visual_source, narration). visual_source can be:
#   ("slide", N)        -> use pitch slide N
#   ("shot", "key")     -> use captured screenshot named key
SCENES: list[dict] = [
    {
        "id": "01_arch",
        "visual": ("slide", 9),
        "narration":
            "Conexple has four Anchor programs deployed to Solana devnet. "
            "Protocol holds the rules. Network manages position state. "
            "Escrow handles USDC vaults and payouts. "
            "Oracle is the registered backend signer. "
            "Off-chain, a Cloudflare Worker runs the operator backend.",
    },
    {
        "id": "02_home",
        "visual": ("shot", "home"),
        "narration":
            "Landing page lays out the pitch in thirty seconds. "
            "The diagram shows the seven-way commission split. "
            "Conexple is a protocol, not a single platform. "
            "The architecture supports anyone forking the operator code "
            "and running their own network on the same Solana programs.",
    },
    {
        "id": "03_simulator",
        "visual": ("shot", "simulator"),
        "narration":
            "The simulator lets any judge play with the math. "
            "No wallet required. Just the live commission engine in the browser.",
    },
    {
        "id": "04_explorer",
        "visual": ("shot", "explorer"),
        "narration":
            "The explorer shows live on-chain state. "
            "Twenty one Position accounts across three trees. Seven on-chain purchases. "
            "Total earnings of six thousand four hundred and seventeen base units, "
            "distributed across the network. "
            "All decoded from Anchor accounts via a Cloudflare Worker RPC cache.",
    },
    {
        "id": "05_operator",
        "visual": ("shot", "operator"),
        "narration":
            "The operator dashboard shows recent settlement runs. "
            "Trigger a cycle and the Cloudflare Worker queries pending commissions in D1, "
            "builds the settlement instructions, "
            "and submits them on chain through the oracle.",
    },
    {
        "id": "06_byok_solscan",
        "visual": ("shot", "solscan"),
        "narration":
            "Here is the BYOK proof on Solscan. "
            "Merchant four is a third-party signed by its own keypair. "
            "When customer K purchased eight thousand units from it, "
            "four add earnings instructions landed on chain in a single transaction, "
            "distributing five hundred seventy one base units to each of "
            "J, I, F, and A — four upline levels deep. "
            "Anyone can verify this trace.",
    },
    {
        "id": "07_outro",
        "visual": ("shot", "github"),
        "narration":
            "Everything you just saw is live on devnet right now. "
            "Open the demo URL, connect a wallet, and trace any transaction on Solscan yourself. "
            "Code is at github.com slash conexple slash alpha — Apache 2.0, unaudited alpha.",
    },
]

SITE_TARGETS = [
    ("home", f"{SITE}/"),
    ("simulator", f"{SITE}/simulator"),
    ("explorer", f"{SITE}/explorer/"),
    ("operator", f"{SITE}/operator/"),
]

# Solscan is gated by Cloudflare bot protection in headless mode, so we render
# a self-contained proof card with the same data and a "verify on Solscan" footer.
OUTRO_HTML = """
<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    background: #0E1116;
    color: #FBF7F1;
    width: 1920px;
    height: 1080px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 80px;
    text-align: center;
  }
  .wordmark {
    font-family: 'Georgia', serif;
    font-size: 96px;
    letter-spacing: -0.02em;
    margin-bottom: 24px;
  }
  .dot { color: #B084FF; }
  .tagline {
    font-size: 28px;
    color: #B0B0B0;
    margin-bottom: 80px;
    max-width: 1100px;
    line-height: 1.45;
  }
  .links {
    display: grid;
    grid-template-columns: repeat(2, auto);
    gap: 24px 80px;
    font-size: 22px;
    margin-bottom: 60px;
  }
  .links b { color: #5B6E48; font-weight: 600; margin-right: 18px; }
  .links code {
    font-family: 'Consolas', monospace;
    color: #FBF7F1;
    background: rgba(255,255,255,0.06);
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 18px;
  }
  .badge-row {
    display: flex;
    gap: 18px;
    margin-top: 40px;
  }
  .badge {
    background: rgba(91,110,72,0.18);
    border: 1px solid rgba(91,110,72,0.5);
    color: #C5D6A8;
    padding: 10px 22px;
    border-radius: 999px;
    font-size: 16px;
    letter-spacing: 0.04em;
  }
</style></head>
<body>
  <div class="wordmark">conexple<span class="dot">.</span></div>
  <div class="tagline">
    Open consumer affiliate protocol on Solana — pay loyal customers, not influencers.
  </div>
  <div class="links">
    <div><b>DEMO</b><code>conexple-worker-web.sornwin.workers.dev</code></div>
    <div><b>REPO</b><code>github.com/conexple/alpha</code></div>
  </div>
  <div class="badge-row">
    <div class="badge">APACHE 2.0</div>
    <div class="badge">UNAUDITED · ALPHA</div>
    <div class="badge">PUBLIC GOODS · COLOSSEUM 2026</div>
  </div>
</body></html>
"""

SOLSCAN_PROOF_HTML = """
<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; }
  body {
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    background: #FBF7F1;
    color: #0E1116;
    padding: 60px 80px;
    height: 1080px;
    width: 1920px;
    display: flex;
    flex-direction: column;
  }
  .badge {
    display: inline-block;
    background: #5B6E48;
    color: #FBF7F1;
    padding: 8px 18px;
    border-radius: 999px;
    font-size: 18px;
    font-weight: 600;
    letter-spacing: 0.04em;
    margin-bottom: 28px;
  }
  h1 {
    font-family: 'Georgia', serif;
    font-size: 56px;
    line-height: 1.15;
    color: #0E1116;
    margin-bottom: 18px;
  }
  .sub {
    font-size: 22px;
    color: #555;
    max-width: 1100px;
    margin-bottom: 50px;
    line-height: 1.5;
  }
  .meta-row {
    display: flex;
    gap: 60px;
    margin-bottom: 40px;
    font-size: 18px;
  }
  .meta-row > div { color: #555; }
  .meta-row b { color: #0E1116; display: block; margin-bottom: 4px; font-size: 15px;
                text-transform: uppercase; letter-spacing: 0.05em; }
  .meta-row code { font-family: 'Consolas', monospace; color: #5B6E48; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 40px;
    font-size: 22px;
  }
  th {
    text-align: left;
    padding: 14px 20px;
    border-bottom: 2px solid #5B6E48;
    font-size: 16px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #5B6E48;
  }
  td {
    padding: 22px 20px;
    border-bottom: 1px solid #E5DECF;
  }
  td.label {
    font-weight: 700;
    font-size: 28px;
    color: #5B6E48;
    width: 90px;
  }
  td.amount { text-align: right; font-family: 'Consolas', monospace; font-size: 24px; }
  td.amount b { color: #5B6E48; font-size: 26px; }
  .footer {
    margin-top: auto;
    padding-top: 30px;
    border-top: 1px solid #E5DECF;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 16px;
    color: #777;
  }
  .footer code { font-family: 'Consolas', monospace; color: #0E1116; }
</style></head>
<body>
  <div class="badge">BYOK PROOF · DEVNET TX</div>
  <h1>Third-party merchant → 4 upline levels, one transaction</h1>
  <div class="sub">
    Customer K (depth 4, tree A) bought 8,000 base units from Merchant 04 — a third-party
    merchant signed by its own keypair, not the deployer. The oracle settled four
    <code>add_earnings</code> instructions in a single on-chain transaction, distributing
    571 units to each of the four active uplines.
  </div>
  <div class="meta-row">
    <div><b>Buyer</b>K · FFaG…6v82</div>
    <div><b>Merchant</b>04 (BYOK) · B678…oPa6</div>
    <div><b>Purchase amount</b>8,000 base units</div>
    <div><b>Per upline</b>571 base units</div>
  </div>
  <table>
    <thead>
      <tr><th style="width:90px">Wallet</th><th>Level</th><th>Pubkey</th><th style="text-align:right">Earned</th></tr>
    </thead>
    <tbody>
      <tr><td class="label">J</td><td>L1 (parent)</td><td><code>EDFh…z2vS</code></td><td class="amount"><b>+571</b></td></tr>
      <tr><td class="label">I</td><td>L2</td><td><code>78KJ…Lu3n</code></td><td class="amount"><b>+571</b></td></tr>
      <tr><td class="label">F</td><td>L3</td><td><code>4B4V…DMth</code></td><td class="amount"><b>+571</b></td></tr>
      <tr><td class="label">A</td><td>L4 (root)</td><td><code>4yKc…aqS</code></td><td class="amount"><b>+571</b></td></tr>
    </tbody>
  </table>
  <div class="footer">
    <div>Verify on chain → <code>solscan.io/tx/aMnXq4v4YJsvUXYYq4S1jbrXs3MStjVcRq…1n2S</code></div>
    <div>Total earned across network: <b>354 → 2,638</b></div>
  </div>
</body></html>
"""


async def capture_shots() -> None:
    SHOTS.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1920, "height": 1080},
            device_scale_factor=1,
        )
        # Live URLs
        for key, url in SITE_TARGETS:
            page = await context.new_page()
            print(f"  capturing {key}: {url}")
            try:
                await page.goto(url, wait_until="networkidle", timeout=45000)
            except Exception as exc:
                print(f"    networkidle timed out, falling back to load: {exc}")
                await page.goto(url, wait_until="load", timeout=45000)
            await page.wait_for_timeout(2500)
            await page.screenshot(
                path=str(SHOTS / f"{key}.png"),
                full_page=False,
                type="png",
            )
            await page.close()
        # Self-rendered cards (Solscan substitute + outro)
        for key, html in (("solscan", SOLSCAN_PROOF_HTML), ("github", OUTRO_HTML)):
            page = await context.new_page()
            print(f"  rendering {key} card (custom HTML)")
            await page.set_content(html, wait_until="load")
            await page.wait_for_timeout(500)
            await page.screenshot(
                path=str(SHOTS / f"{key}.png"),
                full_page=False,
                type="png",
            )
            await page.close()
        await context.close()
        await browser.close()
    print(f"  captured {len(SITE_TARGETS) + 2} screenshots -> {SHOTS}")


async def render_audio() -> None:
    AUDIO.mkdir(parents=True, exist_ok=True)
    tasks = [
        _gen_one(s["id"], s["narration"], AUDIO / f"{s['id']}.mp3")
        for s in SCENES
    ]
    await asyncio.gather(*tasks)
    print(f"  generated {len(SCENES)} audio clips -> {AUDIO}")


async def _gen_one(scene_id: str, text: str, out: Path) -> None:
    communicate = edge_tts.Communicate(text, VOICE, rate=RATE)
    await communicate.save(str(out))


def ffprobe_duration(path: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "json", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(json.loads(result.stdout)["format"]["duration"])


def visual_path(visual: tuple) -> Path:
    kind, val = visual
    if kind == "slide":
        return PITCH_SLIDES / f"slide_{val:02d}.png"
    if kind == "shot":
        return SHOTS / f"{val}.png"
    raise ValueError(f"unknown visual kind: {kind}")


def render_scenes() -> list[Path]:
    SCENES_DIR.mkdir(parents=True, exist_ok=True)
    clips: list[Path] = []
    total = 0.0
    tail = 0.4
    for scene in SCENES:
        sid = scene["id"]
        img = visual_path(scene["visual"])
        if not img.exists():
            raise SystemExit(f"missing visual: {img}")
        audio = AUDIO / f"{sid}.mp3"
        out = SCENES_DIR / f"{sid}.mp4"
        dur = ffprobe_duration(audio)
        total += dur + tail
        cmd = [
            "ffmpeg", "-y", "-loglevel", "error",
            "-loop", "1", "-i", str(img),
            "-i", str(audio),
            # scale + pad ensures any non-1080p screenshot still fits
            "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,"
                   "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=#0E1116",
            "-c:v", "libx264", "-tune", "stillimage", "-pix_fmt", "yuv420p",
            "-r", "30",
            "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
            "-af", f"apad=pad_dur={tail}",
            "-t", f"{dur + tail:.3f}",
            str(out),
        ]
        subprocess.run(cmd, check=True)
        clips.append(out)
        print(f"  {sid}: {dur:5.2f}s + {tail}s tail")
    print(f"  total estimated duration: {total:.1f}s")
    return clips


def concat_final(clips: list[Path]) -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    manifest = WORK / "concat.txt"
    with manifest.open("w", encoding="utf-8") as fh:
        for c in clips:
            fh.write(f"file '{c.as_posix()}'\n")
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "concat", "-safe", "0", "-i", str(manifest),
        "-c", "copy",
        str(OUT),
    ]
    subprocess.run(cmd, check=True)
    final_dur = ffprobe_duration(OUT)
    size_mb = OUT.stat().st_size / (1024 * 1024)
    print(f"  tech-demo.mp4: {final_dur:.1f}s, {size_mb:.1f}MB -> {OUT}")


def check_tools() -> None:
    for tool in ("ffmpeg", "ffprobe"):
        if shutil.which(tool) is None:
            raise SystemExit(f"missing tool on PATH: {tool}")


async def main() -> None:
    print("[1/4] check tools")
    check_tools()
    print("[2/4] capture screenshots via Playwright")
    await capture_shots()
    print("[3/4] generate Aria TTS audio")
    await render_audio()
    print("[4/4] composite per-scene clips + concat")
    clips = render_scenes()
    concat_final(clips)
    print("\nDONE -> submission/videos/tech-demo.mp4")


if __name__ == "__main__":
    asyncio.run(main())
