#!/usr/bin/env bash
#
# Generate the macOS DMG cosmetics for snip Desktop:
#   • resources/icon.icns         — app icon, used by the .app bundle and DMG header
#   • resources/dmg-background.png — 540×380 background behind the "drag to /Applications" arrow
#
# Uses only macOS-bundled tools (iconutil, sips, qlmanage) plus rsvg-convert
# (brew install librsvg) for the SVG → PNG step. No Node deps.
#
# Usage:
#   ./scripts/generate-dmg-assets.sh [SOURCE_PNG_OR_SVG]
#
# If no source is passed we fall back to ../public/grass-logo.svg in the
# parent repo (the same wordmark assets the web app uses). That file is
# 64×64-ish — sips will upscale to 1024 but the result will be soft.
# For a publishable icon, pass a 1024×1024 PNG explicitly.

set -euo pipefail

cd "$(dirname "$0")/.."

SOURCE="${1:-../public/grass-logo.svg}"
ICONSET_DIR="$(mktemp -d)/snip.iconset"
mkdir -p "$ICONSET_DIR"

if [[ ! -f "$SOURCE" ]]; then
  echo "Source asset not found: $SOURCE" >&2
  echo "Pass an explicit path: ./scripts/generate-dmg-assets.sh /path/to/icon-1024.png" >&2
  exit 1
fi

WORK_DIR="$(mktemp -d)"
SOURCE_PNG="$WORK_DIR/source.png"

case "$SOURCE" in
  *.svg)
    if ! command -v rsvg-convert >/dev/null; then
      echo "SVG source requires rsvg-convert (brew install librsvg)." >&2
      exit 1
    fi
    rsvg-convert -w 1024 -h 1024 "$SOURCE" -o "$SOURCE_PNG"
    ;;
  *.png|*.PNG)
    cp "$SOURCE" "$SOURCE_PNG"
    ;;
  *)
    echo "Source must be .svg or .png — got: $SOURCE" >&2
    exit 1
    ;;
esac

# Apple's required iconset sizes — anything missing falls back to the closest
# rendition at runtime which looks fuzzy on Retina, so we always generate all.
for SIZE in 16 32 64 128 256 512 1024; do
  sips -z "$SIZE" "$SIZE" "$SOURCE_PNG" --out "$ICONSET_DIR/icon_${SIZE}x${SIZE}.png" >/dev/null
done
# @2x variants (iconutil convention)
cp "$ICONSET_DIR/icon_32x32.png"   "$ICONSET_DIR/icon_16x16@2x.png"
cp "$ICONSET_DIR/icon_64x64.png"   "$ICONSET_DIR/icon_32x32@2x.png"
cp "$ICONSET_DIR/icon_256x256.png" "$ICONSET_DIR/icon_128x128@2x.png"
cp "$ICONSET_DIR/icon_512x512.png" "$ICONSET_DIR/icon_256x256@2x.png"
cp "$ICONSET_DIR/icon_1024x1024.png" "$ICONSET_DIR/icon_512x512@2x.png"

iconutil -c icns -o resources/icon.icns "$ICONSET_DIR"
echo "Wrote resources/icon.icns ($(stat -f %z resources/icon.icns) bytes)"

# DMG background — 540×380 brutalist cream with a centered orange band the
# drag-to-Applications arrow can sit on. Generated procedurally so we don't
# have to commit a binary asset to the repo.
#
# Uses ImageMagick when available (brew install imagemagick); otherwise
# writes a placeholder PNG flat-color so the DMG build doesn't fail on the
# missing path. electron-builder falls back to a plain background either way.
BG_OUT="resources/dmg-background.png"
if command -v magick >/dev/null; then
  magick -size 540x380 xc:'#f0f0e8' \
    -fill '#FF6600' -draw "rectangle 0,180 540,220" \
    -fill '#1a1a1a' -font 'Helvetica-Bold' -pointsize 16 \
    -gravity north -annotate +0+30 'snip' \
    "$BG_OUT"
  echo "Wrote $BG_OUT (540×380 brutalist cream + orange band)"
elif command -v convert >/dev/null; then
  convert -size 540x380 xc:'#f0f0e8' \
    -fill '#FF6600' -draw "rectangle 0,180 540,220" \
    -fill '#1a1a1a' -font 'Helvetica-Bold' -pointsize 16 \
    -gravity north -annotate +0+30 'snip' \
    "$BG_OUT"
  echo "Wrote $BG_OUT (540×380 brutalist cream + orange band)"
else
  # Fallback: solid cream PNG via sips. Crude but the DMG still builds.
  TMP_BG="$WORK_DIR/bg.png"
  python3 - <<PY
from struct import pack
import zlib, sys
W, H = 540, 380
# Tiny PNG writer — RGBA, solid #f0f0e8.
raw = b''
row = bytes([0]) + (bytes([0xf0, 0xf0, 0xe8, 0xff]) * W)
raw = row * H
def chunk(t, d):
    return pack('>I', len(d)) + t + d + pack('>I', zlib.crc32(t + d) & 0xffffffff)
sig = b'\x89PNG\r\n\x1a\n'
ihdr = pack('>IIBBBBB', W, H, 8, 6, 0, 0, 0)
idat = zlib.compress(raw)
png = sig + chunk(b'IHDR', ihdr) + chunk(b'IDAT', idat) + chunk(b'IEND', b'')
with open("$TMP_BG", 'wb') as f:
    f.write(png)
PY
  cp "$TMP_BG" "$BG_OUT"
  echo "Wrote $BG_OUT (flat cream fallback — install imagemagick for the branded variant)"
fi
