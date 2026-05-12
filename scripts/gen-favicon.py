"""
Generate favicon.png (256x256) from conexple-logo.png.

The source logo is 1024x1024 with the chain-link icon mark in the upper
portion and the "CONEXPLE / INCENTIVE INNOVATION" wordmark in the lower
portion. We crop to the icon mark only, centre it on a square canvas,
and resize to 256x256.

Usage:  python alpha/scripts/gen-favicon.py
"""

from pathlib import Path
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parents[1]
SRC = REPO_ROOT / "apps" / "web" / "public" / "conexple-logo.png"
DST = REPO_ROOT / "apps" / "web" / "public" / "favicon.png"


def main() -> None:
    im = Image.open(SRC).convert("RGBA")
    w, h = im.size  # 1024 x 1024

    # Drop the wordmark: keep the top ~62.5% of the canvas.
    # Box = (left, top, right, bottom)
    crop_bottom = int(h * 0.625)  # 640 for 1024
    icon = im.crop((0, 0, w, crop_bottom))  # 1024 x 640

    # The crop is wider than tall (1024 x 640). Pad with the logo's
    # background colour (white based on typical brand assets) to make it
    # square, centred horizontally and vertically.
    crop_w, crop_h = icon.size
    side = max(crop_w, crop_h)  # 1024

    # Sample background colour from a corner pixel (top-left). Most
    # Conexple brand assets sit on white.
    bg_pixel = icon.getpixel((0, 0))
    if isinstance(bg_pixel, tuple) and len(bg_pixel) == 4:
        bg = bg_pixel
    elif isinstance(bg_pixel, tuple):
        bg = (*bg_pixel, 255)
    else:
        bg = (int(bg_pixel), int(bg_pixel), int(bg_pixel), 255)

    canvas = Image.new("RGBA", (side, side), bg)
    offset_x = (side - crop_w) // 2  # 0
    offset_y = (side - crop_h) // 2  # 192 — pushes icon down so it
    # sits visually centred on the square.
    canvas.paste(icon, (offset_x, offset_y), icon)

    # Resize down to 256x256 with high-quality resampling.
    favicon = canvas.resize((256, 256), Image.Resampling.LANCZOS)

    # Save as PNG with optimisation.
    favicon.save(DST, format="PNG", optimize=True)

    size_kb = DST.stat().st_size / 1024
    print(f"wrote {DST} | {favicon.size} | {size_kb:.1f} KB")


if __name__ == "__main__":
    main()
