# Commoner brand kit

Commoner (commoner.letsimpl.fyi) is a Wikimedia Commons viewer and, later, uploader. This folder is its identity kit.
Source of truth is this repo; apps copy from here (`https://brand.letsimpl.fyi/assets/commoner/...`).

Status: **created at the founder's direction on 2026-11-24**. The visual assets are ready. The tagline is a proposal
until the founder signs it off.

## Identity

| | |
|---|---|
| Name | **Commoner** (capital C, one word) |
| Tagline | **Explore the commons.** (proposed) |
| Descriptor | **Free. Free Software. Simple and Stupid.** (same line as Chaikadi) |
| Licence line | AGPL-3.0-or-later |
| Site | commoner.letsimpl.fyi |

Say all three together wherever there is room: tagline, descriptor, licence. On small surfaces use the name alone.

## The mark

A fixed-lens rangefinder compact, drawn after the shape of a Fujifilm X100-style camera (reference supplied by the founder,
2026-11-24): wide and low, a solid top plate with two dials rising on the left, white cut-outs for the viewfinder and the
flash, an outlined body, and one big lens right of centre. Nothing else: no strap, no texture, no text, no maker's marks.
It stands for taking a picture, and for the commons being a place anyone's pictures can go. Black on white by default;
white on black as the inverse. Same family as the chai glass: an outlined body with solid details, no strokes beyond that.

Geometry (64-unit grid): body x 4..60, y 22..56. Solid top plate y 22..28 across the full width; the rest of the body is a
1.5-unit outline, the same weight as the band on the chai glass. Dials rise from the plate: x 8..15 to y 18.5, and
x 17.5..27 to y 19.7. Cut-outs in the plate: viewfinder x 46.5..55.5 and flash x 31..38.5, both y 23.6..26.4. Lens centred
at (37, 41.5): ring 10.5 / 9 around a solid disc of radius 5.4. Body corners are square, as the brand requires; only the lens
is round. The mark is one path filled with the even-odd rule, so the cut-outs and the ring are clean holes and nothing
drifts with scale.

Small sizes: `favicon.svg` is a chunkier version (wall 3.6, one dial, a smaller ring and disc), because 1.5 units disappear at
16 px. Use the favicon geometry for anything under 32 px.

The wordmark is "Commoner" in Atkinson Hyperlegible Mono Bold (SIL OFL 1.1), converted to outlines so no file needs the
font. In the lockup the camera is 80% of the type size tall and sits on the baseline. Gap between camera and word: a third
of the type size.

## Use

- Default: black on white (`logo-primary.svg`). On black use `logo-primary-inverse.svg`.
- Clear space: at least the width of the lens on every side.
- Minimum size: the favicon version 16 px; the full mark 32 px; the lockup 120 px wide.
- On a photo or any busy background use the one-colour logo on a solid white or black block.

Do not: add a strap, leather texture, text such as a model name or maker's logo, flash, film, rays, a heart or any other
detail; show a phone or an SLR; put a picture in the lens; round the body corners; thicken or thin the lines (use the
favicon version for small sizes); rotate, outline, colour or stretch it; redraw the wordmark in another font; put the
camera inside a rounded shape or a circle. It only resembles a real camera in shape: do not add anything that identifies
a manufacturer.

## Files

| File | Use |
|---|---|
| `logo-mark.svg`, `logo-mark-inverse.svg` | Symbol only, transparent |
| `logo-primary.svg`, `logo-primary-inverse.svg` | Lockup (mark + wordmark), 16:9, on page / on ink |
| `logo-mono.svg`, `logo-mono-inverse.svg` | One-colour lockup, transparent |
| `favicon.svg` | Browser tab; follows the device light/dark scheme |
| `app-icon.svg`, `app-icon-192.png`, `app-icon-512.png`, `apple-touch-icon-180.png` | App icons, full bleed, black on white |
| `app-icon-maskable.svg`, `app-icon-maskable-512.png` | Maskable icon (camera inside the 80% safe zone) |
| `splash.svg`, `splash-1080x1920.png` | PWA splash, 9:16 |
| `loading.svg`, `loading-1080x1920.png` | Loading screen, 9:16 (word "Loading") |
| `og-image.svg`, `og-image.png` | Social share image, 1200 x 630 |
| `github-social.svg`, `github-social.png` | GitHub social preview, 1280 x 640 |
| `avatar-400.png` | Profile picture |
| `empty-category.svg`, `not-found.svg`, `offline.svg` | Empty states, 4:3, line glyphs only: an empty photo frame, a frame with a cross, a dashed frame |

## Regenerating

`tools/commoner-kit.py` writes every file here from code (geometry plus outlined text) and rasterises the PNGs with resvg.
The command is in the script header. The output is committed; the script is not part of CI.

## Licence

Design assets: CC BY-SA 4.0 (see `../../LICENSING.md`). The Atkinson Hyperlegible Mono outlines keep the OFL notice in `../../fonts/`.

## Provenance

Created at the founder's direction on 2026-11-24 with an AI assistant, authored in code (polygon geometry plus outlined
text), as a documented exception to the "agents create zero brand material" rule. See `../../CREDITS.md`.
