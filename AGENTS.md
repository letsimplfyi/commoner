# AGENTS.md

Instructions for AI agents working in this repository. Humans: read this too.

## What this repo is

**Commoner** (https://commoner.letsimpl.fyi) opens any Wikimedia Commons category as a phone-style photo gallery with a
swipe viewer. It is a flagship-style app of the **letsimpl.fyi** org, beside `chaikadi.fyi`, `eatsights` and the org site.
Source: https://github.com/letsimplfyi/commoner (AGPL-3.0). Today it is a viewer; uploading is planned (see DESIGN.md).

It is a **static site**. No backend, no database, no accounts, no analytics, no build step, no `npm install`.
Deploy the files as they are. Everything below follows from that.

Sibling repos live beside this one in the org working directory (`../brand`, `../letsimpl.fyi`), each with its own git repo
under https://github.com/letsimplfyi. Read `../brand/AGENTS.md` for the brand's own rules.

## The rules that cannot bend

1. **The brand is the source of truth: https://brand.letsimpl.fyi.** Commoner invents no colour, font, size, spacing or
   component. Tokens, fonts, base CSS and `ls-` components are vendored in `brand/` and load before `styles.css`.
   Never edit `brand/` by hand: run `npm run brand`. Black and white only (the photos carry the colour), square corners,
   2px ink borders, no shadows, gradients or hatch, text at least 16px (14px for short optional labels), 44px touch targets,
   3px focus outline. The only literal colour in `styles.css` is the QR code's `#FFFFFF` background (cameras need
   black on white in both themes); `tests/design.test.js` enforces this.
2. **Agents create no brand material.** The mark is a rangefinder camera from the brand repo's `assets/commoner/` kit. The
   files in `icons/` are **copies**: never redraw, recolour, trace or regenerate them. If the kit changes, copy the new files
   from `../brand/assets/commoner/`. No new logos, favicons, splash screens or illustrations.
3. **The founder's words are the founder's.** The donation prompt text ("Love this software ??" and the paragraph under it)
   is copied exactly as given, including the double question mark and the double full stops. Do not "fix" it, shorten it,
   translate it or reword it. `tests/support.test.js` fails if it changes. Do not write taglines, mission text or marketing
   copy. Interface labels stay short and plain; when in doubt, use fewer words, or ask.
4. **No third-party requests beyond Wikimedia.** The only hosts the app may contact are `commons.wikimedia.org` (API),
   `api.wikimedia.org` (Picture of the day feed), and `upload.wikimedia.org` / `thumb.wikimedia.org` (photos). The CSP in
   `_headers` allows exactly those, and `tests/design.test.js` fails if any other host appears in the source. No CDNs,
   fonts from elsewhere, trackers, analytics or cookie banners. Fonts, icons and libraries are self-hosted.
5. **No inline scripts, styles or event-handler attributes** in `index.html` (the CSP forbids them). The pre-paint theme
   script is the separate file `js/theme.js`.
6. **Never commit secrets.** The Cloudflare token lives encrypted in the `nix-config` repo
   (`secrets/laptop/cloudflare-pages.yaml`, sops) and in GitHub repo secrets. The UPI ID in `js/support.js` is public by design.
7. **Keep it small.** No framework swap, no bundler, no new dependencies, no TypeScript, no CSS preprocessor. The vendored
   libraries are Preact, htm and qrcode-generator (see below). Ask before adding anything.

## Principles (inherited from the org)

- **Simple, stupid.** One concern per file. Prefer fewer files, fewer lines, fewer ideas.
- **Quiet UI.** The photos are the interface. No intros, no hints that repeat a label, no popups, no autoplay, no motion by
  default. Optional things are folded away; obvious actions (copy link, share, back) are icon buttons with `aria-label`.
- **Neuro-atypical first.** Low sensory load, predictable layout, short lines, one idea per screen. Honour
  `prefers-reduced-motion` and `prefers-color-scheme`.
- **Privacy.** Commons requests are anonymous: `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, no API key. Only
  these things are stored, on the device: theme, the last 10 galleries, the donation preference, the cached Picture of the
  day, and the service worker's app cache. Nothing is sent anywhere.
- **Open data.** Photos keep their own licences, shown in the viewer. Commoner is **not affiliated with or endorsed by the
  Wikimedia Foundation**: never use Wikimedia/Commons logos or imitate their marks (their identity guidelines forbid it).

## Layout

```
index.html           the shell: head, brand CSS, one <div id="app"></div>. No inline script or style.
styles.css           layout only, from brand tokens. ~100 lines. Keep it small.
manifest.json        PWA manifest (icons from icons/)
sw.js                service worker: versioned precache + safe update path (see "Updates")
_headers             Cloudflare Pages headers: cache-control, the CSP, referrer policy
robots.txt, sitemap.xml
js/
  main.js            clears #app, renders <App/>, starts the update machinery
  ui.js              the whole interface: App, Viewer, Support (class components, htm)
  commons.js         pure Commons logic: parsing, the query model, URLs, normalisers, fetch helpers
  popular.js         the curated start list (generated from verified data) + helpers
  typeahead.js       the category box with live predictions (ARIA combobox)
  feed.js            the Commons Picture of the day from the Wikimedia Feed API, cached per day
  support.js         donation rules and amounts (pure); the founder's UPI ID
  upi.js             UPI link building (pure)
  qr.js              draws a QR code on a canvas; loads vendor/qrcode.js on demand
  update.js          registers the service worker; the safe-restart logic
  icons.js           inline SVG line icons (24 grid, square caps)
  config.js          constants: APP_VERSION, hosts, page size, thumbnail widths
  theme.js           sets data-theme before first paint
brand/               VENDORED brand (do not edit; npm run brand)
vendor/              preact.module.js, htm.module.js, qrcode.js (+ licences). Do not edit.
icons/               COPIES from the brand kit (do not redraw)
tests/
  commons.test.js    parsing, query model, URLs, normalisers, the popular list
  support.test.js    donation rules, UPI links, the founder's wording, the feed
  design.test.js     brand rules, CSP, hosts, no placeholders
  shell.test.js      manifest, precache list, deploy workflow
  fixtures.js        Commons API response builders
  e2e/gallery.e2e.mjs   real Chromium under the production CSP, Commons faked
tools/
  sync-brand.mjs     vendors the brand (npm run brand / brand:check)
  check-popular.mjs  re-checks the start list against Commons (npm run popular:check)
  serve.py           local static server
.github/workflows/deploy.yml   tests, stamp the version, deploy to Cloudflare Pages
flake.nix, flake.lock, treefmt.toml   dev shell (Node 22, Python, Chromium, Playwright) and formatting
README.md            what it is, URL scheme, updates, support, run, deploy
DESIGN.md            product and design decisions (keep in step with the code)
CONTRIBUTING.md      for outside contributors
```

`tests/shell.test.js` fails if a file in `js/` is missing from this layout or from the service worker's precache list.

## How it works

### State lives in the URL

The address is the application state, so every gallery is shareable and the Back button works:

| Param | Meaning |
| --- | --- |
| `c` (repeatable) | a category to **include**; every included category must match |
| `x` (repeatable) | a category to **leave out** |
| `d=1` / `d=0` | force subcategories on / off. Default: off for one plain category, **on** as soon as there is a second category or a leave-out |
| `s=newest` | newest first (default is Commons order for one category, best match for a search) |
| `f` | a file name: opens the viewer on it (with no `c`, on that photo alone) |

`parseRoute`, `shareUrl`, `makeQuery` in `js/commons.js` own this. `makeQuery` normalises (deduplicates, drops a leave-out that
is also included, applies the `deep` default). **Always go through them**; never build these URLs by hand.

Opening the viewer pushes a history entry (`state.v = 1`) and moving between photos `replaceState`s `f`, so Back closes the
viewer instead of leaving the gallery. `?c=` links can be pasted back into the home box (`parseInput`).

### Two ways to list photos

`usesSearch(q)` decides. **One plain category** uses `generator=categorymembers` (fast, Commons order, `gcmsort`).
**Anything else** (more than one category, a leave-out, or subcategories on) uses `generator=search` with a CirrusSearch
term built by `searchTerm`: `deepcategory:"A" deepcategory:"B" -deepcategory:"C"` (or `incategory:` when subcategories are
off), `gsrnamespace=6`, `gsrsort=relevance|create_timestamp_desc`. The file count for a search comes from a separate
`list=search&srinfo=totalhits` request, so it appears about 1-2 seconds after the photos.

Facts about the Commons API that cost time to learn, so do not relearn them:

- **There is no OR.** `incategory:"A|B"` works, but `deepcategory` with `|` or `OR` silently returns wrong results. Do not offer
  "any of". AND (a space) and NOT (a minus) work.
- Plain `incategory` AND is often empty (photos sit in leaf categories). That is why subcategories default to on for combos.
- **At most 50 pages get image info per request.** `PAGE_SIZE` is 50. Asking for more returns pages without `imageinfo`.
- Pass the response's whole `continue` object back unchanged to page (`gcmcontinue`, `gsroffset`, `iicontinue`...).
- **A category's page order is not in the response.** `generator=categorymembers` returns pages with no `index` (only
  `generator=search` does), in no useful order, so sorting by it silently scrambled "Name" and "Newest". A plain category is
  therefore fetched in two steps (`fetchFiles`): `list=categorymembers` with `cmsort` (`sortkey` or `timestamp`) and `cmdir`
  gives the ordered ids, then `pageids=` (up to 50) gives the details, put back in list order. "Name" is the category's
  own sort-key order (for Pictures of the day that is by date), "Newest" is when each file was added to the category.
  Searches still order by the `index` they return. Never trust page order from a generator you have not seen the order of.
- **Thumbnails come from `thumb.wikimedia.org`** (originals from `upload.wikimedia.org`). Wikimedia only serves fixed widths and
  never larger than the original: the grid uses 500, the viewer 1280; `resize()` falls back to the original URL for small
  files and SVGs. Both hosts must stay in the CSP; the e2e suite enforces the real CSP so this cannot regress silently.
- `prefixsearch` (namespace 14) powers predictions. It needs `origin=*` for CORS, like every call.
- Non-image results (video, audio, PDFs) are skipped and counted ("n not photos").
- Be gentle: debounce predictions (250 ms), cache nothing aggressively, never loop requests. Wikimedia rate-limits bursts
  ("too many requests"); `tools/check-popular.mjs` batches 40 titles with pauses for that reason.

### The interface (`js/ui.js`)

- `App` holds the query `q` (null = home), the loaded `files`, the continuation `next`, a `status`
  (`idle | loading | ready | more | error`), the viewer index, and the support preference. `load(q, f, {push})` is the single
  entry point for opening anything: it aborts the previous request, pushes history, sets the title, fetches info and files.
- Photos load as you scroll (an `IntersectionObserver` on the "More" sentinel, `rootMargin` 800px) and the "More" button is
  the fallback. A deep link with `f` keeps loading pages (up to `MAX_DEEP_LINK_PAGES`) until the file is found.
- `Viewer` is a native `<dialog>` opened with `showModal()`. Swiping is the browser's own `scroll-snap` on a horizontal track,
  not custom gesture code: keep it that way. Only slides within two of the current one load their image. Escape and the
  Back button close it (`onDialogClose` / `popstate`). A modal dialog makes the page behind it inert (tests must close it
  before clicking the footer).
- `Support` is the donation sheet: the brand's `ls-sheet` bottom sheet in a native `<dialog>`.
- `Typeahead` (`js/typeahead.js`) is a real ARIA combobox: input `role="combobox"`, a `role="listbox"` of `role="option"`,
  `aria-activedescendant`, arrow keys, Enter, Escape. It is used on the home page and in the Filter panel.
- Home: the category box, the Picture of the day card, five start chips + Surprise me, a **More categories** fold,
  Recent (max 5 shown, 10 kept). Gallery: Back, title, count, share (only where `navigator.share` exists), copy link, Filter,
  sort, the Filter panel (chips, Add / Leave out, a box, Subcategories), a Related fold (parents and subcategories of a
  single plain category), the grid, "More", and the donation prompt card when the rules allow.
- Class components with `htm`; no hooks (the vendored Preact build has none). Keep state in `App`/component `state`.
- **Preact appends to its container; it does not replace it.** `main.js` calls `app.replaceChildren()` first and
  `index.html` ships `<div id="app"></div>` empty. A "loading" placeholder there once stayed stranded at the bottom of the page.

### The start list (`js/popular.js`)

About 220 hand-picked categories in groups. It is **generated from verified data**, not typed: a category is kept only if it
exists on Commons and has at least 20 files (plain entry) or at least 3 subcategories (`{ name, deep: true }`, opened with
subcategories on so it never looks empty). `npm run popular:check` re-verifies it. **Deliberately excluded**: anything likely
to surface nudity (paintings, sculptures, people lists, tattoos, costumes, theatre, dance...), because this list is the first
thing a visitor sees and Commons is open to everyone. Keep that policy when adding entries. The first group's first five
entries are the home page's start chips, so their order matters. User-typed categories are not filtered (it is a viewer of
Commons); the footer says Commons is open to everyone.

### The Picture of the day (`js/feed.js`)

One request a day to `https://api.wikimedia.org/feed/v1/wikipedia/en/featured/YYYY/MM/DD` (UTC date), reading only the
`image` field. The result is kept in `localStorage` until the date changes. Only Wikimedia image hosts are accepted by
`normaliseImage`. The card opens that very photo in the viewer (`?f=<file name>`, no category, so it also works when the day's photo is not yet in
the year's category); closing it returns home. If anything fails the card simply does not show.

### Support / donations (`js/support.js`, `js/upi.js`, `js/qr.js`)

Commoner never touches money: it opens the donor's own UPI app (`upi://pay?pa=...&am=...&cu=INR`), same format as Chaikadi.

- Amounts are in **paise**. Presets Rs 20, 50, 100, 500, or any amount from Rs 1 to Rs 1,00,000 (`parseAmount`). The donor
  chooses; never hard-code a single amount.
- The ask **never nags**: it appears after 3 galleries with photos, then at most every 30 days; 90 days after paying;
  never after "Don't ask again". The footer's **Support** link always opens the sheet. All rules are pure functions
  (`shouldAsk`, `afterAsk`) with tests; stored preferences are untrusted and cleaned (`cleanSupport`).
- The QR code (payee + chosen amount) is for paying from another device, so it is hidden on touch-only screens.
- The founder's wording is verbatim (rule 3). Do not add tea jokes or other copy.

## Updates: how users get new versions without interruption

This is the same design as Chaikadi and it **requires** `sw.js`. Do not remove the service worker.

- `sw.js` precaches the whole app (`SHELL`) in one cache named `commoner-shell-<version>`. Install is atomic
  (`cache.addAll`): one missing file fails the install rather than half-caching a release. Files are fetched with
  `cache: 'reload'` so a fresh file is never mixed with stale ones. Navigations are answered from the cached `./`;
  same-origin GETs are cache-first; **cross-origin requests (Commons) are never intercepted**.
- **Cache busting is automatic.** The repo holds `commoner-shell-dev` in `sw.js` and `APP_VERSION = 'dev'` in `js/config.js`.
  The deploy workflow replaces both with the same stamp (`YYYY.MM.DD-<run number>`) on every deploy. Never hand-edit a
  version number, and never ship `sw.js` or `config.js` with different versions: `tests/shell.test.js` requires them to match.
- The worker calls `skipWaiting()` on install and deletes old `commoner-*` caches on activate. The **page** keeps running the
  old code until a safe moment, then restarts itself (`js/update.js`): when it is hidden, or after 60 s with no input, no open
  dialog and no focused text field. The URL already holds the gallery and photo, so the restart lands in the same place.
  Checks happen when the app returns to the foreground, when it comes online, and every 30 minutes. The version in the footer
  is a manual "check now" button; "Update ready: restart" appears if one is waiting.
- `register('./sw.js', { updateViaCache: 'none' })`: Cloudflare's zone-level Browser Cache TTL can force `max-age=14400` on
  scripts regardless of `_headers`, so the worker script must always revalidate.
- **If you add a runtime file, add it to `SHELL` in `sw.js`** and to the stage step's `cp` list in the deploy workflow. The
  tests check both, and the workflow refuses to deploy if the shell references a missing file.

## CSP and headers (`_headers`)

`default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; manifest-src 'self'; img-src 'self' data:
https://upload.wikimedia.org https://thumb.wikimedia.org; connect-src 'self' https://commons.wikimedia.org
https://api.wikimedia.org; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`. No `unsafe-*`. Everything is served
`no-cache` so browsers revalidate (the service worker handles speed and consistency). To contact a new host: justify it,
add it to `_headers`, to `ALLOWED_HOSTS` in `tests/design.test.js`, and to the README's exception section. Style via
classes only: `el.style.x` is allowed by the CSP but avoid it.

## Testing

Run everything inside the dev shell (Node 22, Chromium and Playwright come from `flake.nix`):

```sh
nix develop --command npm test            # unit + design + shell tests (fast, no network)
nix develop --command npm run test:e2e    # real Chromium; takes about a minute
npm run popular:check                     # needs the network; re-verifies the start list
```

CI runs `npm test` (not the e2e suite) before every deploy. **Run the e2e suite before pushing UI changes.**

The e2e suite (`tests/e2e/gallery.e2e.mjs`) is deliberately strict:

- It serves the repo with the **production CSP** from `_headers`, so a blocked host fails the test (this caught the
  `thumb.wikimedia.org` bug).
- Commons and the Feed API are faked with `page.route`; **any other request that leaves the machine fails the run.**
- It stamps a version into `sw.js`/`config.js` like the deploy does and plays out a real release 1 to 2 (installs in the
  background, the hidden page restarts, the photo stays open, the old cache is deleted) plus an offline start.
- It covers predictions with the keyboard, narrowing (including the exact search terms sent), the donation flow and rules,
  deep links, errors, theme, clipboard and the Picture of the day.

Writing tests: keep them about behaviour users see. Beware vacuous waits (`[].every(...)` is `true` on an empty grid: wait for
`length >= n` first). Playwright's strict mode rejects locators that match two elements; scope them. A modal `<dialog>` makes the
page behind it inert. Prefer the accessible role/label over CSS selectors. Add a unit test for any new pure function.

## Deploying

Pushes to `main` run `.github/workflows/deploy.yml`: tests, then stage the runtime files, **stamp the version**, verify every
precached file exists, and `wrangler pages deploy` to the Cloudflare Pages project **`commoner`**
(https://commoner.letsimpl.fyi, a proxied CNAME to the project's `pages.dev` address). Secrets (repo level):
`CLOUDFLARE_API_TOKEN` (Pages: Edit) and `CLOUDFLARE_ACCOUNT_ID`. Only runtime files are published; tests, tools and docs stay
private.

After a deploy, **verify production, not just CI**: fetch `/sw.js` and `/js/config.js` and confirm the stamped version; load the
site in a real browser and watch the console for CSP violations (the CSP only exists in production); open a gallery, a
multi-category link and the viewer. A deploy can still be "in progress" when you check: compare the run's head SHA to your commit.

Docs-only commits do not need a redeploy (a redeploy restamps the version and triggers an update on every user's phone for no
code change): put `[skip ci]` in the commit message.

## Working agreements

- **Do not push, force-push or rewrite history unless asked.** When you do push, say what changed and what you verified.
- Small, focused commits with plain messages that say why.
- Never leave the working tree half-converted: if a refactor spans files (for example the query model), finish it, update the
  tests, and run the suites before handing over.
- Credit what you use. A new vendored file needs its licence next to it and a line in `vendor/` provenance (the Preact, htm
  and qrcode-generator licences are already there).
- Keep `README.md`, `DESIGN.md` and this file in step with the code in the same change. This file's layout list is checked by a
  test for the `js/` files.
- Validate before handing over: unit tests, e2e, the page works at 200% text and at 320px width, keyboard only, light and dark,
  reduced motion. Look at it (a Playwright screenshot at 390px) when you change layout: "clean" is judged by eye.
- Ask when in doubt. Prefer fewer files, fewer lines, fewer ideas.

## Recipes

**Add a start-list category.** Find candidates, verify with the API (existence, files, subcategories), exclude anything likely to
surface nudity, add to `js/popular.js` (plain name, or `{ name, deep: true }` for a broad parent), run `npm test` and
`npm run popular:check`.

**Add a JS file.** Add it to `sw.js` `SHELL` and to the layout above; the tests tell you if you forget. It must work as an
ES module with relative imports and no build.

**Add a query feature.** Extend `makeQuery`, `parseRoute`, `shareUrl` together (round-trip test), then `listUrl`/`searchTerm`, then
the UI. Check the Commons behaviour with a real request first (see "Facts about the Commons API"); do not assume CirrusSearch
operators combine.

**Update the brand or icons.** `npm run brand` (never hand-edit `brand/`); copy changed icons from `../brand/assets/commoner/`;
run all tests. The brand repo owns the artwork.

**Change donation behaviour.** Edit the pure rules in `js/support.js`, update `tests/support.test.js`. The wording does not change
without the founder.

**Release.** Tests green, e2e green, commit, push to `main`, wait for the run for your SHA, verify production (above).

## Known gotchas (each of these happened)

- Cloudflare Pages `_redirects` does not substitute placeholders inside a query string (`/c/:name /?c=:name` produced
  `?c=%3Aname`). Short links were removed; do not reintroduce them without a different design.
- Cloudflare's zone cache setting overrides `Cache-Control` on scripts: rely on `cache: 'reload'` and `updateViaCache: 'none'`.
- The thumbnail host moved to `thumb.wikimedia.org` and silently blocked every thumbnail in production because the local server
  sent no CSP. The e2e server now sends the real one.
- `deepcategory` plus OR returns nonsense without an error. Only AND and NOT.
- Chromium resolves `<dialog>` `inert` for the page behind a modal; clicking it in a test just times out.
- A GitHub Actions run list shows the *previous* run for a few seconds after a push: match on the commit SHA.
- Percent-encoding differs between what Playwright prints and `location.search` (`(` becomes `%28`): match both in tests.

## Pointers

`README.md` (URL scheme, updates, support, run, deploy) · `DESIGN.md` (decisions) · `../brand/AGENTS.md` and
https://brand.letsimpl.fyi/llms.txt (the brand's rules) · `../letsimpl.fyi/AGENTS.md` (the org site; its project list names
Commoner and its description is the founder's to write).
