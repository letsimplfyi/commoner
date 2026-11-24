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

## Upload (planned, decided 2026-11-24)

**Goal.** Photos that suit Commons (landscapes first) often never reach it, because uploading is hard. Commoner becomes a
simple, cross-platform replacement for the Commons Android app, usable by someone with no technical background. It is for
the user's **own** photos only. Commons is public and permanent, so this is a way to contribute, not a backup.

**Flow.** Pick everything, analyse on the device, stage only what passes, let the user check, then (and only then) build the
rich data and upload.

1. **Pick.** PWA first: on Android the Web Share Target (share many photos from the gallery into Commoner). Everywhere else,
   or when that fails, the OS file picker (`<input type=file multiple>`). Desktop Chromium may offer a folder.
2. **Analyse on the device.** Nothing is sent anywhere and no sign-in is needed. Every photo gets a verdict: staged, not
   selected (with the reason), or unsure (not selected by default).
3. **Review.** The existing grid and viewer. Staged is the default view; "Not selected" lists each photo with the Commons
   rule that excluded it. The user can move any soft rejection into the staged set; a hard rejection cannot be moved.
4. **Confirm.** One approval: licence, authorship, and what will be public (including GPS).
5. **Sign in.** OAuth 2.0 with PKCE, in the browser. It now comes **first** (the upload screen starts with it), not after the
   confirm step: Commons' sign-in leaves the page, which would throw away photos held in memory. Moving it later needs the
   staged photos kept in OPFS (planned with the resumable queue), or a popup flow (unreliable in an installed PWA on iOS).
6. **Enrich.** Categories, title, description, wikitext and structured data are generated only after approval.
7. **Upload.** A queue: chunked, throttled, resumable. Then the user's own uploads with their status.

There is no approval step on Commons itself: "awaiting approval" is the user's own, before upload. All approvals are the
user's. There is no CLI and no backend.

### Decisions

| Decision | Selected |
| --- | --- |
| Licence default | CC BY-SA 4.0 (`{{self\|cc-by-sa-4.0}}`), changeable once in settings |
| Authorship | Own work only (`{{own}}`, `[[User:name\|name]]`) |
| Rejection wording | Copied from existing Commons rules and linked to them; not invented here |
| Face detection | BlazeFace (Apache-2.0), loaded only when analysis starts. Use the browser's own `FaceDetector` where it exists |
| Scene classifier | Not in v1. Whether a photo is in scope is "unsure" until we measure what slips through |
| EXIF, HEIC | Allowed. EXIF read by a small parser; HEIC converted only when the browser cannot hand us a JPEG |
| Weight | The shell stays small. Models and decoders are never in the `SHELL` precache: they load on first use into their own cache |
| Originals | Uploaded byte for byte. Never re-encode: that strips EXIF and loses quality |
| Tracking | `{{Uploaded from Commoner}}`, which puts files in `Category:Uploaded with Commoner` (both must exist on Commons first) |
| Settings | Profile on the device (author name, licence, home zone, GPS precision). Optional sync with account preferences (`action=options`, `userjs-commoner-*`) |
| Privacy | A "home zone" where coordinates are never published; coordinate rounding; GPS shown once at the confirm step |

### The checks

Each is one rule with a reason and a link to the Commons page behind it. Ported from the Commons Android app
(`upload/ImageProcessingService.kt`, `EXIFReader.kt`, `ReadFBMD.kt`) and extended.

| Verdict | Check |
| --- | --- |
| Hard (Commons refuses, or policy forbids) | Same file already on Commons (SHA-1); unreadable or unsupported file; file name banned, too long (240 bytes incl. suffix) or on the title blacklist |
| Not the user's own work | No camera make or date in EXIF; Facebook metadata marker; screenshot-like (screen size, no EXIF); messenger-recompressed sizes |
| People and privacy | A face found (BlazeFace); document, ID or receipt-like image (text density) |
| Quality | Too dark; too blurry; near-duplicate of a burst (keep the best) |
| Unsure | Scope: Commons wants educational value; personal snapshots are deleted as out of scope |

### Enrichment (after approval)

| Field | Source |
| --- | --- |
| Date | EXIF `DateTimeOriginal` as `{{According to Exif data}}`; `{{Taken on}}` adds the day category |
| Coordinates | EXIF GPS as `{{Location}}`, subject to the home zone |
| Categories | `list=geosearch` (namespaces 14 and 6) near the coordinates, then depicts via `wbsearchentities`; each checked with `prop=info` and `categoryinfo` (exists, not hidden); never a parent with its child; `{{subst:unc}}` when none |
| Title | Place and date from the above, never the camera's `IMG_1234`: the title blacklist refuses it |
| Structured data | Caption, depicts, inception, creator, camera location: a second edit after the upload |
| Upload comment | One per file (it cannot be edited later) |

### Verified on 2026-11-24 (real requests)

- OAuth 2 endpoints on `commons.wikimedia.org/w/rest.php/oauth2/*` answer CORS preflight (`access-control-allow-origin: *`, `Authorization` allowed). **No `meta.wikimedia.org` host is needed.**
- `action=...&origin=*` preflight allows the `Authorization` header and `POST`. A bearer token is evaluated cross-origin (a bad one returns 401 `invalid_token`).
- `list=geosearch` with `gsnamespace=14` returns Commons **categories** with coordinates and distance, and `gsnamespace=6` returns files. This replaces the Wikidata Query Service the Android app uses for "nearby".
- `action=titleblacklist&tbaction=create` returns a verdict and the matching rule, so file names are checked with one call.
- `wbsearchentities` on `commons.wikimedia.org` works with `origin=*`, so depicts need no Wikidata host.
- `Template:Taken on` and `Template:According to Exif data` exist. `Template:Uploaded from Commoner` and `Category:Uploaded with Commoner` do **not** yet.

### Still to verify

- A real upload with a real OAuth token: `action=upload` with `stash=1`, chunks, `async=1`, and the CSRF token (needs a registered OAuth consumer, which only the account owner can request).
- Chunk size and how the browser limits memory.
- OS picker limits for many photos on iOS and Android, and whether iOS converts HEIC to JPEG when `accept` lists only JPEG and PNG.
- The size and speed of BlazeFace with the lightest runtime, on a mid-range phone. Cost must be measured before we commit.
- `action=options` size limit for synced settings.

### Phases

0. Spike: the checks above, then a real single upload.
1. On-device analysis only (no sign-in, nothing leaves the device). **Built, reachable only at `?u=1`** (no button on the home
   page until sign-in exists, so the deploy shows nothing half-finished). Two views, Ready and Not selected, instead of a third
   "unsure" bucket: any soft rejection can be added back, a locked one (file type, unreadable) cannot. Tap a ready photo to
   remove it. Not yet in: the duplicate check against Commons (one hash lookup per photo, so it waits for a batching plan),
   BlazeFace (the browser's own `FaceDetector` is used where it exists), burst near-duplicates, HEIC conversion, a Web Worker
   pool (decoding is already off the main thread; the pixel maths on a 256 px copy is small). Blur is judged on a 1024 px copy, by
   the sharpest tile of a 4 x 4 grid (`sharpestTile`), with `BLUR_BELOW = 3400`. Measured on 60 Commons Quality images of
   landscapes against 65 files from "Erroneous focus adjustment" and "Blur from camera motion": about 5% of sharp photos
   wrongly flagged and about 58% of blurry ones caught (AUC 0.85; at 256 px it was only 0.73). A hint, not a verdict, and
   always overridable. Re-check it on more of the user's own photos.
2. Sign-in, profile, single upload and wikitext.
3. Enrichment and the bulk confirm step.
4. Resumable queue (OPFS, Wake Lock, throttling).
5. Share Target, structured data, status of uploads.

### Built so far (all behind `?u=1`; nothing is reachable from the home page yet)

Sign in (PKCE), pick or drop photos, on-device checks, "What are these of?" (a category search, or a title typed; suggestions
from `list=geosearch` near the photo's GPS, hidden and empty categories dropped), and a Check screen (licence, location
precision, an exact example of the file name and wikitext). The file name is `Subject, date (camera name).jpg`, the page is
`{{Information}}` with `{{self|cc-by-sa-4.0}}` and `{{Uploaded from Commoner}}`. Not built yet: the upload queue itself
(chunked stash upload, retry, resume), structured data, the user's uploads and their status, a home zone for GPS, BlazeFace,
HEIC conversion, a check for the same file already on Commons. The consent wording on the Check screen is still to be copied
from a Commons page: nothing there is invented.
