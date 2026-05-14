# public/downloads/

This directory is populated by the [Build snip Desktop DMG](../../.github/workflows/desktop-dmg.yml)
GitHub Action. Don't commit DMGs by hand — they're large binaries and the
workflow drops the latest arm64 build at `snip-desktop.dmg` on every push to
`main`.

Reachable from the app at:

- `https://<your-domain>/downloads/snip-desktop.dmg` — canonical latest
- `https://<your-domain>/downloads/snip-<version>-arm64.dmg` — version-pinned

Linked from:

- Landing nav (Apple-glyph "Download" link)
- Dashboard sidebar ("Desktop app · DMG" button above New project)

If the link 404s, the Action probably hasn't run yet for this branch. Trigger
it manually from the Actions tab → "Build snip Desktop DMG" → "Run workflow",
or push any change inside `desktop/`.
