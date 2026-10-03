# /// script
# requires-python = ">=3.12"
# dependencies = ["fonttools==4.66.1"]
# ///
"""Build every MergeCode brand asset from source, reproducibly.

    uv run assets/brand/tools/build_brand.py

Requires `resvg` on PATH for the PNG exports (`cargo install resvg --locked --version 0.48.1`).

The wordmark is set in JetBrains Mono ExtraBold and converted to outlines, so
the logos render identically without the font installed. The font is fetched
from the pinned upstream release and verified by SHA-256 (it is not vendored).
JetBrains Mono is licensed under the SIL Open Font License 1.1, which permits
using its outlines in artwork such as a logo.
"""

from __future__ import annotations

import hashlib
import io
import pathlib
import re
import shutil
import subprocess
import sys
import urllib.request
import zipfile

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

OUT = pathlib.Path(__file__).resolve().parents[1]
FONT_URL = "https://github.com/JetBrains/JetBrainsMono/releases/download/v2.304/JetBrainsMono-2.304.zip"
FONT_SHA256 = "6f6376c6ed2960ea8a963cd7387ec9d76e3f629125bc33d1fdcd7eb7012f7bbf"

# Palette. Shares ink/snow with its sibling project mcpsum; one accent, two tones
# so it passes contrast on both GitHub themes.
INK = "#0B0F14"
SNOW = "#F2F0EA"
GREEN_ON_LIGHT = "#1A7F37"
GREEN_ON_DARK = "#3FB950"
MUTED_ON_DARK = "#9AA4B2"
GITHUB_LIGHT_BG = "#FFFFFF"
GITHUB_DARK_BG = "#0D1117"


# ----------------------------------------------------------------- contrast

def _lum(hex_color: str) -> float:
    rgb = [int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


def contrast(a: str, b: str) -> float:
    la, lb = sorted((_lum(a), _lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


# ----------------------------------------------------------------- fonts

def load_fonts() -> dict[str, TTFont]:
    cache = OUT / "tools" / ".cache" / "JetBrainsMono-2.304.zip"
    if not cache.exists():
        cache.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(FONT_URL, timeout=60) as r:  # noqa: S310 (pinned https URL)
            cache.write_bytes(r.read())
    data = cache.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if digest != FONT_SHA256:
        cache.unlink()
        sys.exit(f"font archive checksum mismatch: {digest}")
    z = zipfile.ZipFile(io.BytesIO(data))
    return {
        w: TTFont(io.BytesIO(z.read(f"fonts/ttf/JetBrainsMono-{w}.ttf")))
        for w in ("ExtraBold", "Medium")
    }


def _ntos(n: float) -> str:
    s = f"{n:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def text_path(font: TTFont, text: str, size: float, x: float, baseline: float, tracking: float = 0.0) -> tuple[str, float]:
    """Outline `text` as an SVG path. Returns (d, advance width)."""
    glyphs, cmap = font.getGlyphSet(), font.getBestCmap()
    scale = size / font["head"].unitsPerEm
    pen = SVGPathPen(glyphs, ntos=_ntos)
    cursor = x
    for ch in text:
        name = cmap[ord(ch)]
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, cursor, baseline)))
        cursor += font["hmtx"][name][0] * scale + tracking
    return pen.getCommands(), cursor - x - tracking


def x_height(font: TTFont, size: float) -> float:
    return font["OS/2"].sxHeight * size / font["head"].unitsPerEm


# ----------------------------------------------------------------- the mark

# A checkmark drawn as a commit graph: the PR branch's commit (left node) runs
# down into the merge point and up to main's commit (right node). It reads as
# both "merged" and "verified".
LEFT, VERTEX, RIGHT = (14.5, 34.0), (27.5, 48.0), (50.0, 18.0)


def mark(node: str, accent: str, *, x: float = 0, y: float = 0, size: float = 64) -> str:
    s = size / 64
    (lx, ly), (vx, vy), (rx, ry) = LEFT, VERTEX, RIGHT
    return (
        f'<g transform="translate({_ntos(x)} {_ntos(y)}) scale({_ntos(s)})">'
        f'<path fill="none" stroke="{accent}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" '
        f'd="M{lx} {ly}L{vx} {vy}L{rx} {ry}"/>'
        f'<circle cx="{lx}" cy="{ly}" r="7.5" fill="{node}"/>'
        f'<circle cx="{rx}" cy="{ry}" r="7.5" fill="{node}"/>'
        "</g>"
    )


def favicon_mark() -> str:
    """Small-size variant: own tile, so it works on light and dark browser tabs.
    Offsets centre the mark's ink bounding box (x 7..57.5, y 10.5..51.5 on the 64 grid)."""
    return f'<rect width="32" height="32" rx="7" fill="{INK}"/>' + mark(SNOW, GREEN_ON_DARK, x=1.9, y=2.4, size=28)


def svg(width: float, height: float, body: str, title: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{_ntos(width)}" height="{_ntos(height)}" '
        f'viewBox="0 0 {_ntos(width)} {_ntos(height)}" role="img" aria-label="{title}">'
        f"<title>{title}</title>{body}</svg>\n"
    )


def lockup(fonts: dict[str, TTFont], fg: str, accent: str) -> str:
    size, gap, tr = 46.0, 14.0, -0.6
    eb = fonts["ExtraBold"]
    baseline = 32 + x_height(eb, size) / 2
    d1, w1 = text_path(eb, "merge", size, 64 + gap, baseline, tracking=tr)
    d2, w2 = text_path(eb, "code", size, 64 + gap + w1 + tr, baseline, tracking=tr)
    width = 64 + gap + w1 + tr + w2 + 2
    body = mark(fg, accent) + f'<path fill="{fg}" d="{d1}"/><path fill="{accent}" d="{d2}"/>'
    return svg(width, 64, body, "MergeCode")


def social(fonts: dict[str, TTFont]) -> str:
    W, H, left = 1280, 640, 96
    eb, md = fonts["ExtraBold"], fonts["Medium"]
    parts = [f'<rect width="{W}" height="{H}" fill="{INK}"/>']
    parts.append(mark(SNOW, GREEN_ON_DARK, x=left - 14, y=96, size=128))
    wsize = 92
    base = 96 + 64 + x_height(eb, wsize) / 2
    d1, w1 = text_path(eb, "merge", wsize, left + 136, base, tracking=-1.2)
    d2, _ = text_path(eb, "code", wsize, left + 136 + w1 - 1.2, base, tracking=-1.2)
    parts.append(f'<path fill="{SNOW}" d="{d1}"/><path fill="{GREEN_ON_DARK}" d="{d2}"/>')
    for i, line in enumerate(("This patch passes tests.", "Would a maintainer merge it?")):
        d, _ = text_path(md, line, 54, left, 340 + i * 70)
        parts.append(f'<path fill="{SNOW}" d="{d}"/>')
    d, _ = text_path(md, "Maintainer-grade review for AI-generated code", 27, left, 480)
    parts.append(f'<path fill="{MUTED_ON_DARK}" d="{d}"/>')
    d, _ = text_path(md, "github.com/niravpatidar37/mergecode", 24, left, 566)
    parts.append(f'<path fill="{GREEN_ON_DARK}" d="{d}"/>')
    return svg(W, H, "".join(parts), "MergeCode: would a maintainer merge this patch?")


# ----------------------------------------------------------------- safety gate

FORBIDDEN = [
    (re.compile(r"<\s*script", re.I), "script element"),
    (re.compile(r"\son[a-z]+\s*=", re.I), "event handler attribute"),
    (re.compile(r"<\s*foreignObject", re.I), "foreignObject"),
    (re.compile(r"(?:xlink:)?href\s*=\s*\"(?!#)", re.I), "external reference"),
    (re.compile(r"url\(\s*['\"]?(?!#)", re.I), "external url()"),
    (re.compile(r"javascript:", re.I), "javascript: URL"),
]


def check_safe(name: str, text: str) -> None:
    for pattern, what in FORBIDDEN:
        if pattern.search(text):
            sys.exit(f"{name}: unsafe SVG content ({what})")


# ----------------------------------------------------------------- main

def main() -> None:
    checks = {
        "accent on GitHub light": contrast(GREEN_ON_LIGHT, GITHUB_LIGHT_BG),
        "accent on GitHub dark": contrast(GREEN_ON_DARK, GITHUB_DARK_BG),
        "ink on GitHub light": contrast(INK, GITHUB_LIGHT_BG),
        "snow on GitHub dark": contrast(SNOW, GITHUB_DARK_BG),
        "favicon accent on tile": contrast(GREEN_ON_DARK, INK),
    }
    for label, ratio in checks.items():
        print(f"contrast {label}: {ratio:.2f}:1")
        if ratio < 3.0:
            sys.exit(f"contrast below WCAG 3:1 for graphics: {label}")

    fonts = load_fonts()
    files = {
        "icon.svg": svg(64, 64, mark(INK, GREEN_ON_LIGHT), "MergeCode"),
        "icon-dark.svg": svg(64, 64, mark(SNOW, GREEN_ON_DARK), "MergeCode"),
        "favicon.svg": svg(32, 32, favicon_mark(), "MergeCode"),
        "logo.svg": lockup(fonts, INK, GREEN_ON_LIGHT),
        "logo-dark.svg": lockup(fonts, SNOW, GREEN_ON_DARK),
        "social-preview.svg": social(fonts),
    }
    for name, text in files.items():
        check_safe(name, text)
        (OUT / name).write_text(text, encoding="utf-8", newline="\n")
        print(f"wrote {name} ({len(text)} bytes)")

    resvg = shutil.which("resvg")
    if not resvg:
        sys.exit("resvg not found on PATH; install it to export PNGs")
    renders = [
        ("favicon.svg", "favicon-32.png", 32),
        ("favicon.svg", "avatar-512.png", 512),
        ("social-preview.svg", "social-preview.png", 1280),
    ]
    for src, dst, width in renders:
        # List-form argv, no shell; every argument is a constant or the resolved resvg path.
        argv = [resvg, "-w", str(width), str(OUT / src), str(OUT / dst)]
        subprocess.run(argv, check=True, shell=False)
        print(f"rendered {dst} ({(OUT / dst).stat().st_size} bytes)")


if __name__ == "__main__":
    main()
