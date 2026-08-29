# fetchr logo assets — M3 "Takeoff f"

Generated from the geometry in [`../BRAND.md`](../BRAND.md) §2. The SVGs are the
sources; the PNGs are rendered from them at 1024px and downsampled, so they are
reproducible — never edit a PNG by hand.

## Sources (SVG)

| File | Use |
|---|---|
| `fetchr-mark.svg` | **Primary mark.** Ink tile, cream glyph, orange delta |
| `fetchr-mark-small.svg` | Thicker strokes for ≤20px. Use for 16/32px favicons |
| `fetchr-mark-reversed.svg` | Cream tile, ink glyph — for ink or photographic grounds |
| `fetchr-mark-mono.svg` | Single colour via `currentColor`, outlined tile |
| `fetchr-mark-dark.svg` | Primary with the dark-theme delta `#F2732F` |
| `fetchr-glyph-cream.svg` | Bare glyph, no tile — for the ink ticket header bar |
| `fetchr-glyph-ink.svg` | Bare glyph, ink — for light grounds |
| `fetchr-icon-apple.svg` | 180px square, ink ground, 12px padding (iOS adds its own mask) |
| `fetchr-icon-maskable.svg` | 512px full-bleed, glyph at 60% for Android's safe zone |

## Rendered (PNG / ICO, transparent where the tile doesn't cover)

| File | Size | Use |
|---|---|---|
| `favicon-16.png` / `favicon-32.png` | 16, 32 | Browser tab |
| `favicon.ico` | 16+32+48 | Legacy `shortcut icon` |
| `favicon-64.png` | 64 | Bookmarks bar |
| `apple-touch-icon-180.png` | 180 | iOS home screen |
| `icon-512-maskable.png` | 512 | Android / PWA install, `purpose: maskable` |
| `icon-512.png` / `icon-1024.png` | 512, 1024 | Rounded-tile mark, app stores, press |
| `fetchr-mark-256.png` | 256 | General use |
| `fetchr-mark-reversed-512.png` | 512 | On ink grounds |
| `fetchr-mark-mono-512.png` | 512 | Single-colour reproduction |
| `fetchr-mark-dark-512.png` | 512 | Dark-theme delta |
| `fetchr-lockup-light-1400.png` | 1400×420 | Mark + wordmark, ink on transparent |
| `fetchr-lockup-dark-1400.png` | 1400×420 | Mark + wordmark, cream on transparent |

The lockup PNGs are raster, so the Archivo dependency is baked in — they are safe
to send anywhere. The **SVG wordmark in BRAND.md §2.7 still needs outlining**
before external use; these PNGs are the interim answer for anything that isn't
the app itself.

## Installed into `public/`

`icon.svg`, `favicon.ico`, `favicon-16.png`, `favicon-32.png`,
`apple-touch-icon.png` (180), `icon-512.png` (maskable) — the names
`public/index.html` and `public/manifest.json` reference.

## Regenerating

Edit the SVG source, then re-render at 1024 and downsample (headless Chrome
cannot screenshot a window smaller than its minimum, so never render a 16px
canvas directly).
