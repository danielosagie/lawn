# Building snip Desktop (DMG)

The desktop app packages as a macOS `.dmg` via `electron-builder`. Output lands
in `desktop/release/`.

## Quick start

```bash
cd desktop
bun install                     # picks up electron-builder
bun run build:dmg               # universal (arm64 + x64)
# or:
bun run build:dmg:arm64         # Apple Silicon only — faster
bun run build:dmg:x64           # Intel only
```

The first build downloads the matching Electron framework binary (~120 MB) into
`~/.cache/electron`; subsequent builds are fast.

## What the build does

1. `vite build` compiles the renderer to `dist/`.
2. `electron-builder` packs `electron-main.cjs`, `preload.cjs`, `dist/`, and
   `resources/` into an `.app` bundle, then wraps it in a DMG.
3. Code-signing + notarization are **off by default** (see below).

Result: `desktop/release/snip-0.1.0-arm64.dmg` (and the x64 variant if you
asked for both).

## Code signing & notarization

Unsigned DMGs work on the dev machine but Gatekeeper will reject them on other
Macs ("can't be opened because Apple cannot check it for malicious software").

To sign you need an Apple Developer ID:

```bash
export CSC_NAME="Developer ID Application: Your Name (TEAMID)"
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop"
export APPLE_TEAM_ID="TEAMID"
```

Then flip `mac.notarize` to `true` in `package.json` and rebuild. electron-
builder will sign the app bundle and submit it to Apple's notary service.

Without notarization, users have to right-click → Open the first time, or run
`xattr -d com.apple.quarantine /Applications/snip.app` after install.

## What still needs to ship before public release

- **Icon assets**: `resources/icon.icns` (required by `mac.icon`). Generate
  from a 1024×1024 PNG with `iconutil` or any iconset tool.
- **DMG background**: `resources/dmg-background.png` (540×380). The drag-to-
  Applications arrow lives in user expectations — bundling a background image
  with the arrow is the usual touch. (Listed in `package.json` but missing
  from the repo right now; electron-builder will use a plain background.)
- **Code signing**: see above.

## Bundled prerequisites

The mount feature shells out to `rclone` and requires the macFUSE driver. The
app does **not** bundle these — it surfaces an install hint in the UI when
they're missing. (Bundling rclone is technically fine but inflates the DMG by
~20 MB. macFUSE has to be a separate install because it ships a kernel
extension that needs the user's explicit approval in System Settings →
Privacy & Security.)
