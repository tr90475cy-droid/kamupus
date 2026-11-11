"""
make_icon.py
============
Converts static/icon/logo.jpeg into every PNG icon size KAMUPUS needs
for PWA pinning (Android + iOS + browser tabs).

Run once from your project root:
    python make_icon.py

Output goes to static/icons/. Nothing else in your project is touched.
"""

from pathlib import Path
from PIL import Image

# ──────────────────────────────────────────────────────────────
# CONFIG — tweak these if needed
# ──────────────────────────────────────────────────────────────
SOURCE   = Path("static/icon/logo.jpeg")
OUT_DIR  = Path("static/icons")

# Background color for opaque icons (iOS requires opaque).
# Matches your theme: #0b1220
BG_COLOR = (11, 18, 32, 255)

# Set to True if your logo already has a solid background you want to keep.
# Set to False if logo has transparent areas you want filled with BG_COLOR.
KEEP_TRANSPARENCY = False

# Padding for the Android maskable icon (10% on each side = 20% total safe zone).
MASKABLE_PADDING = 0.10
# ──────────────────────────────────────────────────────────────


def ensure_pillow_installed():
    try:
        from PIL import Image  # noqa: F401
    except ImportError:
        raise SystemExit(
            "\n❌ Pillow is not installed.\n"
            "   Run:  pip install Pillow\n"
            "   Then try again.\n"
        )


def load_source():
    if not SOURCE.exists():
        raise SystemExit(
            f"\n❌ Source logo not found: {SOURCE}\n"
            f"   Expected it at: {SOURCE.resolve()}\n"
            f"   Make sure the file is named logo.jpeg and lives in static/icon/.\n"
        )

    img = Image.open(SOURCE)
    print(f"✓ Loaded {SOURCE}  ({img.width}×{img.height}, mode={img.mode})")

    if img.width < 512 or img.height < 512:
        print(
            f"⚠ Warning: source is only {img.width}×{img.height}. "
            f"Icons larger than that will look soft. "
            f"Consider a 512×512 or bigger source for best results."
        )

    if img.width != img.height:
        print(
            f"⚠ Warning: source is not square ({img.width}×{img.height}). "
            f"Will be centered and padded — some whitespace may appear."
        )

    return img


def make_icon(src, size, filename, padding=0.0, opaque=False):
    """
    Create a single icon:
      • Resize the logo to fit inside (size − 2·padding·size)
      • Center it on a square canvas of the given size
      • Optionally fill the background (opaque=True) with BG_COLOR
      • Save as PNG
    """
    canvas = Image.new(
        "RGBA",
        (size, size),
        BG_COLOR if opaque else (0, 0, 0, 0),
    )

    inner = max(1, int(size * (1 - padding * 2)))
    logo = src.copy()
    logo.thumbnail((inner, inner), Image.LANCZOS)

    x = (size - logo.width) // 2
    y = (size - logo.height) // 2

    if logo.mode in ("RGBA", "LA"):
        canvas.paste(logo, (x, y), logo)
    else:
        canvas.paste(logo.convert("RGBA"), (x, y))

    out_path = OUT_DIR / filename

    if opaque:
        # Save RGB to avoid any transparency artifacts on iOS
        canvas.convert("RGB").save(out_path, "PNG", optimize=True)
    else:
        canvas.save(out_path, "PNG", optimize=True)

    size_kb = out_path.stat().st_size / 1024
    print(f"  ✓ {filename:<28} {size}×{size:<4}  ({size_kb:.1f} KB)")


def main():
    ensure_pillow_installed()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    src = load_source()

    # If the source has transparency but the user wants it kept, that's fine
    # for everything except iOS which needs opaque.
    print(f"\n→ Writing icons to {OUT_DIR.resolve()}\n")

    # ── Android / manifest ────────────────────────────────────
    make_icon(src, 192, "icon-192.png",
              padding=0.0, opaque=False)

    make_icon(src, 512, "icon-512.png",
              padding=0.0, opaque=False)

    make_icon(src, 512, "icon-maskable-512.png",
              padding=MASKABLE_PADDING, opaque=False)

    # ── iOS home-screen icon (MUST be opaque, 180×180) ────────
    make_icon(src, 180, "apple-touch-icon.png",
              padding=0.0, opaque=True)

    # ── Browser tab favicons ──────────────────────────────────
    make_icon(src, 32, "favicon-32.png",
              padding=0.0, opaque=False)

    make_icon(src, 16, "favicon-16.png",
              padding=0.0, opaque=False)

    # ── Open Graph / social share image ───────────────────────
    # (same as icon-512 but named clearly for SEO tools)
    make_icon(src, 512, "og-image.png",
              padding=0.0, opaque=True)

    print("\n✅ Done.")
    print(f"   {len(list(OUT_DIR.glob('*.png')))} PNG files written to {OUT_DIR}/\n")
    print("Next steps:")
    print("  1. Deploy / push so Railway sees the new files")
    print("  2. Update base.html + manifest.json to reference these PNGs")
    print("  3. On a phone, pin the site — the icon should now be your logo\n")


if __name__ == "__main__":
    main()