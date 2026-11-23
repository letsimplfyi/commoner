# Commoner design · v0.2

**Branding source of truth: https://brand.letsimpl.fyi.** Commoner defines no colour, font, size or component of its own.
Tokens, fonts, base CSS and `ls-` components are vendored into `brand/` and load before `styles.css`. Black and white only
(photos carry all the colour), square corners, 2px ink borders, no shadows or gradients, 44px touch targets, 3px focus ring.
The mark is a rangefinder camera (brand kit `assets/commoner/`), never redrawn.

**Quiet by default.** The photos are the interface. Every screen is a few controls and almost no prose: no intros, no hints
that repeat the label, icons where the meaning is obvious (copy link, share, back), and anything optional folded away.

## Screens

| Screen | What is on it |
| --- | --- |
| Home | A category box with predictions, the Commons Picture of the day, five start chips plus Surprise me, a fold of ~200 more categories in groups, a short Recent list |
| Gallery | Back, the title, a file count, icon actions (share, copy link), Filter, sort; edge-to-edge square tiles, 3 columns on a phone |
| Filter | Chips for the categories in play, Add or Leave out, a category box with predictions, a Subcategories switch |
| Viewer | Full-screen native `<dialog>`; a sideways scroll-snap track gives native swipe; arrows on desktop; one-line caption with icon actions |
| Support | The brand's bottom sheet (`ls-sheet`): the founder's words, amounts, any amount, Donate, UPI ID, QR on desktop |
| Footer | One line: unofficial, source, support, version (tap to check for updates) |

## Product decisions

| Decision | Selected |
| --- | --- |
| Address | The URL is the state: `c` (repeatable), `x`, `d`, `s`, `f`. Back closes the viewer instead of leaving the gallery |
| Narrowing | All included categories must match, minus the left-out ones, via Commons search (`deepcategory:`/`incategory:`). No OR: it does not work with `deepcategory`, so it is not offered |
| Subcategories | Off for one plain category (fast, Commons order); on by default as soon as there is a second category or a leave-out |
| Predictions | Commons prefix search, 250 ms debounce, arrow keys, Enter, Escape; a combobox for assistive tech |
| Start list | Hand-picked, community-curated or plainly broad; checked by `npm run popular:check`. Nothing likely to surface nudity |
| Picture of the day | Wikimedia Feed API, one request a day, kept on the device |
| Non-photos | Video, audio and documents are skipped and counted |
| Storage | Theme, the last 10 galleries, the support preference: on the device only |
| Updates | Service worker with per-deploy cache busting and safe restarts (see README) |
| Support | After 3 galleries, then rarely; never after "Don't ask again"; UPI only; the donor picks the amount |

## Networking

`commons.wikimedia.org/w/api.php` (anonymous, `origin=*`, no cookies, no referrer), `api.wikimedia.org` (Picture of the
day) and `upload.wikimedia.org` / `thumb.wikimedia.org` thumbnails. Grid tiles use the 500px thumbnail, the viewer the 1280px
one. Slides within two of the current photo load; the rest stay empty until you get near.

## Accessibility

Tiles are buttons named after the file; the viewer announces "n of N"; Escape closes; arrow keys move; reduced motion turns
smooth scrolling off; chips and toggles have text labels for assistive tech; everything works with 200% text.

## Later

Upload (Commons needs a login, so it will use a bot password or OAuth in the browser only).
