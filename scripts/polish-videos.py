"""Polish pitch.mp4 and tech-demo.mp4: crossfade transitions + ambient music bed.

Inputs:  agent-temp/video/{pitch,tech}/scenes/*.mp4 (already-rendered scenes)
Outputs: submission/videos/{pitch,tech-demo}.mp4 (overwritten)
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PITCH_SCENES = ROOT / "agent-temp" / "video" / "pitch" / "scenes"
TECH_SCENES = ROOT / "agent-temp" / "video" / "tech" / "scenes"
OUT_DIR = ROOT / "submission" / "videos"
AMBIENT = ROOT / "agent-temp" / "video" / "ambient.wav"

TRANSITION = 0.4  # seconds of crossfade between scenes
AMBIENT_VOLUME = 0.045  # 4.5% — barely audible under voice


def ffprobe_duration(path: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "json", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(json.loads(result.stdout)["format"]["duration"])


def generate_ambient(duration: float) -> None:
    """Subtle 4-tone ambient pad (A minor) with delay + lowpass."""
    AMBIENT.parent.mkdir(parents=True, exist_ok=True)
    # A2, E3, A3, E4 — A minor open voicing
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-f", "lavfi", "-i", f"sine=frequency=110:duration={duration}",
        "-f", "lavfi", "-i", f"sine=frequency=164.81:duration={duration}",
        "-f", "lavfi", "-i", f"sine=frequency=220:duration={duration}",
        "-f", "lavfi", "-i", f"sine=frequency=329.63:duration={duration}",
        "-filter_complex",
        # Per-tone gain shaping then mix
        "[0]volume=0.55[a0];"
        "[1]volume=0.42[a1];"
        "[2]volume=0.35[a2];"
        "[3]volume=0.22[a3];"
        "[a0][a1][a2][a3]amix=inputs=4:duration=longest:normalize=0,"
        # Slight echo creates space
        "aecho=0.6:0.7:60|160|320:0.3|0.2|0.1,"
        # Soft top-end so it doesn't compete with voice sibilance
        "lowpass=f=1500,"
        # Final attenuation + edge fades
        f"volume={AMBIENT_VOLUME},"
        f"afade=t=in:st=0:d=4,afade=t=out:st={duration - 4}:d=4",
        "-ac", "2", "-ar", "48000",
        str(AMBIENT),
    ]
    subprocess.run(cmd, check=True)
    print(f"  ambient bed -> {AMBIENT.name}  ({duration:.1f}s, vol={AMBIENT_VOLUME})")


def polish_one(scene_dir: Path, out: Path, label: str, transition: float = TRANSITION) -> None:
    """Polish scenes into one file. transition=0 => hard cuts (no xfade).
    Hard cut keeps slide change frame-aligned with voice change — judges perceive better sync."""
    scenes = sorted(scene_dir.glob("*.mp4"))
    if not scenes:
        raise SystemExit(f"no scenes in {scene_dir}")
    durations = [ffprobe_duration(s) for s in scenes]
    n = len(scenes)
    raw_total = sum(durations)

    inputs: list[str] = []
    for s in scenes:
        inputs.extend(["-i", str(s)])
    inputs.extend(["-i", str(AMBIENT)])
    ambient_idx = n

    chain: list[str] = []
    if transition > 0:
        final_total = raw_total - (n - 1) * transition
        print(f"  {label}: {n} scenes, raw {raw_total:.1f}s -> crossfaded {final_total:.1f}s (t={transition}s)")
        prev_v = "0:v"
        prev_a = "0:a"
        cumulative = 0.0
        for i in range(1, n):
            cumulative += durations[i - 1] - transition
            tag_v, tag_a = f"v{i:02d}", f"a{i:02d}"
            chain.append(
                f"[{prev_v}][{i}:v]xfade=transition=fade:duration={transition}:"
                f"offset={cumulative:.3f}[{tag_v}]"
            )
            chain.append(
                f"[{prev_a}][{i}:a]acrossfade=d={transition}[{tag_a}]"
            )
            prev_v, prev_a = tag_v, tag_a
    else:
        # Hard cuts: plain concat — slide change frame-aligned with voice change
        print(f"  {label}: {n} scenes, hard cut total {raw_total:.1f}s")
        concat_v = "".join(f"[{i}:v]" for i in range(n))
        concat_a = "".join(f"[{i}:a]" for i in range(n))
        chain.append(f"{concat_v}concat=n={n}:v=1:a=0[cv]")
        chain.append(f"{concat_a}concat=n={n}:v=0:a=1[ca]")
        prev_v, prev_a = "cv", "ca"

    # Mix narration with ambient bed (normalize=0 preserves voice volume)
    chain.append(
        f"[{prev_a}][{ambient_idx}:a]amix=inputs=2:duration=first:normalize=0[mixed]"
    )
    filter_complex = ";".join(chain)

    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        *inputs,
        "-filter_complex", filter_complex,
        "-map", f"[{prev_v}]",
        "-map", "[mixed]",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30",
        "-preset", "medium", "-crf", "20",
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
        str(out),
    ]
    subprocess.run(cmd, check=True)
    actual = ffprobe_duration(out)
    size_mb = out.stat().st_size / (1024 * 1024)
    print(f"  -> {out.name}  ({actual:.1f}s, {size_mb:.1f}MB)")


def main() -> None:
    print("[1/3] generate ambient music bed")
    # 200s covers both videos; ambient is reused with `duration=first` in mix
    generate_ambient(200.0)
    print("[2/3] polish pitch (hard cut — better voice/slide sync)")
    polish_one(PITCH_SCENES, OUT_DIR / "pitch.mp4", "pitch", transition=0)
    print("[3/3] polish tech demo (crossfade — visually similar screenshots)")
    polish_one(TECH_SCENES, OUT_DIR / "tech-demo.mp4", "tech-demo", transition=TRANSITION)
    print("\nDONE -> submission/videos/{pitch,tech-demo}.mp4")


if __name__ == "__main__":
    main()
