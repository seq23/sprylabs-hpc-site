#!/usr/bin/env python3
"""Build the committed brand images: the icon set and the per-host og images.

These are PNGs that ship in the repository, not build output: Cloudflare Pages
serves them straight from the root (scripts/assemble_pages_output.js copies the
root), and no CI job has fonts or Pillow. This script is the record of how the
bytes were made, so a later change is a re-run with an edited constant rather
than a hand-drawn guess.

    python3 scripts/assets/build_brand_images.py        rewrite the PNGs
    python3 scripts/assets/build_brand_images.py --check exit 1 if any differ

What it writes:
  apple-touch-icon.png   180x180, the iOS home-screen icon (full bleed: iOS
                         applies its own corner radius)
  icon-512.png           512x512, the site.webmanifest icon
  assets/og/default-billionairehighperformancecoach.png  1200x630
  assets/og/default-spryexecutiveos.png                  1200x630

Why: the Search Readiness checklist, item a9 (favicon.ico, apple-touch-icon.png
and site.webmanifest must all answer 200 - both icon routes were 404 on
25 Oct 2026) and item b6 (og:image must be 1200x630 on the site's own host).
Dimensions are pinned by scripts/validators/validate_brand_images.mjs.
"""
import argparse
import io
import pathlib
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parents[2]

INK = (17, 17, 17)
PAPER = (250, 247, 242)
BRASS = (176, 141, 87)
MUTED = (95, 87, 79)

BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
REGULAR = "/System/Library/Fonts/Supplemental/Arial.ttf"

OG_COPY = {
    "assets/og/default-billionairehighperformancecoach.png": (
        "Billionaire High",
        "Performance Coach",
        "A structured executive OS for the AI you already use",
    ),
    "assets/og/default-spryexecutiveos.png": (
        "Spry",
        "Executive OS",
        "Decision structure, daily execution, and continuity",
    ),
}


def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except OSError:  # pragma: no cover - only on a machine without the system fonts
        sys.exit(f"missing font {path}; run this on a Mac with the system fonts installed")


def centred(draw, box, text, fnt, fill):
    left, top, right, bottom = draw.textbbox((0, 0), text, font=fnt)
    x = box[0] + (box[2] - box[0] - (right - left)) / 2 - left
    y = box[1] + (box[3] - box[1] - (bottom - top)) / 2 - top
    draw.text((x, y), text, font=fnt, fill=fill)


def icon(size):
    """The wordmark's own letter, paper on ink, with the brass rule beneath it."""
    scale = 4
    im = Image.new("RGB", (size * scale, size * scale), INK)
    d = ImageDraw.Draw(im)
    edge = size * scale
    centred(d, (0, 0, edge, int(edge * 0.86)), "S", font(BOLD, int(edge * 0.62)), PAPER)
    bar_w, bar_h = int(edge * 0.34), max(2, int(edge * 0.035))
    bar_y = int(edge * 0.80)
    d.rectangle([(edge - bar_w) // 2, bar_y, (edge + bar_w) // 2, bar_y + bar_h], fill=BRASS)
    return im.resize((size, size), Image.LANCZOS)


def og(line1, line2, strap):
    im = Image.new("RGB", (1200, 630), PAPER)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 1200, 14], fill=INK)
    d.rectangle([0, 616, 1200, 630], fill=BRASS)
    title = font(BOLD, 92)
    d.text((88, 168), line1, font=title, fill=INK)
    d.text((88, 282), line2, font=title, fill=INK)
    d.rectangle([88, 416, 232, 422], fill=BRASS)
    d.text((88, 462), strap, font=font(REGULAR, 34), fill=MUTED)
    return im


def targets():
    out = {"apple-touch-icon.png": icon(180), "icon-512.png": icon(512)}
    for rel, (a, b, strap) in OG_COPY.items():
        out[rel] = og(a, b, strap)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    drift = []
    for rel, im in targets().items():
        buf = io.BytesIO()
        im.save(buf, "PNG", optimize=True)
        want = buf.getvalue()
        dest = ROOT / rel
        if args.check:
            if not dest.exists() or dest.read_bytes() != want:
                drift.append(rel)
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(want)
        print(f"wrote {rel} ({im.width}x{im.height}, {len(want)} bytes)")
    if args.check:
        if drift:
            sys.exit("brand images differ from this generator: " + ", ".join(drift))
        print("brand images match the generator")


if __name__ == "__main__":
    main()
