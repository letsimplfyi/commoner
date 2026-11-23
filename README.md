# Commoner · commoner.letsimpl.fyi

Open any [Wikimedia Commons](https://commons.wikimedia.org) category as a phone-style photo gallery, then tap a photo
to swipe through them. **Free. Free Software. Simple and Stupid.** No accounts, no ads, no tracking, no backend.

Send someone a link like

```
https://commoner.letsimpl.fyi/?c=Photos taken by Vysakh Premkumar
```

and they see the same gallery. `&f=File name.jpg` opens the viewer on one photo. A pasted Commons category link works in
the box on the home page too. Uploading is planned for later; today Commoner is a viewer.

**Deploy these files as-is. There is no build step, no `npm install` and no service worker.** The UI is Preact + htm,
vendored locally. Updating is a redeploy and a refresh (`_headers` asks browsers to revalidate).

All branding comes from [brand.letsimpl.fyi](https://brand.letsimpl.fyi), vendored in `brand/` (`npm run brand` to update,
never edit by hand). The icons in `icons/` are copied from the brand repo's `assets/commoner/` kit; copy, do not redraw.
[DESIGN.md](DESIGN.md) records the product decisions.

## The one third-party exception

The brand says no third-party requests. A Commons viewer cannot avoid two: `commons.wikimedia.org` (the public API, read
only, anonymous, no cookies, no referrer) and `upload.wikimedia.org` (the photos). The CSP in `_headers` allows exactly
those and nothing else, and `tests/design.test.js` fails if any other host appears in the source.

## Run locally

```sh
nix develop
python3 tools/serve.py        # http://localhost:8080
```

Do not open `index.html` via `file:`. Phones need HTTPS (use the deployment) for install and real-device tests.

```sh
nix develop --command npm test            # unit + design tests
nix develop --command npm run test:e2e    # real Chromium, Commons faked, any other request fails the run
```

## Deploy

Pushes to `main` run the tests, then publish the runtime files (`index.html`, `styles.css`, `manifest.json`, `_headers`,
`js/`, `vendor/`, `brand/`, `icons/`) to the Cloudflare Pages project `commoner` through `.github/workflows/deploy.yml`.
Repository secrets: `CLOUDFLARE_API_TOKEN` (Pages: Edit) and `CLOUDFLARE_ACCOUNT_ID`. The custom domain
`commoner.letsimpl.fyi` is a proxied CNAME to the project's `pages.dev` address.

## Licence

Code: AGPL-3.0. Brand design and assets: CC BY-SA 4.0 (see the brand repo). Commoner is not endorsed by or affiliated with
the Wikimedia Foundation. Photos are shown with their own licences, taken from Commons.
