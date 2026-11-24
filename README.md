# Commoner · commoner.letsimpl.fyi

Open any [Wikimedia Commons](https://commons.wikimedia.org) category as a phone-style photo gallery, then tap a photo
to swipe through them. **Free. Free Software. Simple and Stupid.** No accounts, no ads, no tracking, no backend.

```
https://commoner.letsimpl.fyi/?c=Photos taken by Vysakh Premkumar
https://commoner.letsimpl.fyi/?c=Nepal&c=Sunsets&x=Kathmandu&s=newest
```

`c` is a category (repeat it to narrow down: every one must match), `x` leaves one out, `s=newest` sorts newest first,
`d=1` or `d=0` forces subcategories on or off, `f=File name.jpg` opens the viewer on one photo (on its own when there is no `c`). The home page shows the
Commons Picture of the day and a start list; typing predicts categories; **Filter** in a gallery adds or removes categories.

**Deploy these files as-is. There is no build step and no `npm install`.** The UI is Preact + htm, vendored locally.

All branding comes from [brand.letsimpl.fyi](https://brand.letsimpl.fyi), vendored in `brand/` (`npm run brand` to update,
never edit by hand). The icons in `icons/` are copied from the brand repo's `assets/commoner/` kit; copy, do not redraw.
[DESIGN.md](DESIGN.md) records the product decisions.

## Updates without interruption

Same design as Chaikadi. `sw.js` precaches the whole app under one versioned cache. The deploy workflow stamps the same
version into `sw.js` (cache name) and `js/config.js` (`APP_VERSION`), so **every deploy busts every cache** with nothing
to remember. A new version installs in the background and takes over at once, but the open page keeps running the old code
until a safe moment (hidden, or idle for a minute with no photo open and no typing), then restarts itself. The URL holds the
categories and photo, so it lands exactly where you were. The version in the footer checks for updates when tapped.

## Support

A quiet donation ask (`js/support.js`): after 3 galleries, then at most every 30 days (90 after paying), never after
"Don't ask again"; a Support link in the footer always works. Amounts are the donor's choice: presets or any amount from
₹1 to ₹1,00,000. It opens the donor's own UPI app (`upi://pay`); Commoner never touches money.

## The one third-party exception

The brand says no third-party requests. A Commons viewer cannot avoid these Wikimedia hosts: `commons.wikimedia.org` (the
public API, read only, anonymous, no cookies, no referrer), `api.wikimedia.org` (the Picture of the day feed) and
`upload.wikimedia.org` / `thumb.wikimedia.org` (the photos). The CSP in `_headers` allows exactly those, and
`tests/design.test.js` fails if any other host appears in the source.

## Run locally

```sh
nix develop
python3 tools/serve.py        # http://localhost:8080
nix develop --command npm test            # unit + design tests
nix develop --command npm run test:e2e    # real Chromium under the production CSP, Commons faked, any other request fails
npm run popular:check                     # re-check the start list against Commons
```

Do not open `index.html` via `file:`. Phones need HTTPS (use the deployment) for install and the service worker.

## Deploy

Pushes to `main` run the tests, then publish the runtime files to the Cloudflare Pages project `commoner` through
`.github/workflows/deploy.yml`. Repository secrets: `CLOUDFLARE_API_TOKEN` (Pages: Edit) and `CLOUDFLARE_ACCOUNT_ID`.
`commoner.letsimpl.fyi` is a proxied CNAME to the project's `pages.dev` address.

## Licence

Code: AGPL-3.0. Brand design and assets: CC BY-SA 4.0 (see the brand repo). Commoner is not endorsed by or affiliated with
the Wikimedia Foundation. Photos are shown with their own licences, taken from Commons.
