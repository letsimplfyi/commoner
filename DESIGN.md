# Commoner design · v0.1

**Branding source of truth: https://brand.letsimpl.fyi.** Commoner defines no colour, font, size or component of its own.
Tokens, fonts, base CSS and `ls-` components are vendored into `brand/` and load before `styles.css`. Black and white only
(photos carry all the colour), square corners, 2px ink borders, no shadows or gradients, 44px touch targets, 3px focus ring.
The mark is a rangefinder camera (brand kit `assets/commoner/`), never redrawn.

## Product decisions

| Decision | Selected |
| --- | --- |
| Entry | A category name or a pasted Commons category link, or `?c=` in the address |
| Share | The address is the share link: `?c=Category` and, for one photo, `&f=File.jpg` |
| Gallery | Square tiles, 3 columns on a phone (4, 5 wider), 2px gaps, edge to edge, lazy, loads more as you scroll |
| Viewer | Full-screen native `<dialog>`; a sideways scroll-snap track gives native swipe; arrows and prev/next on desktop |
| Back button | Opening the viewer pushes a history entry, so Back closes it instead of leaving the gallery |
| Sort | Name (Commons order) or Newest (added to the category) |
| Sub-categories | Up to 24, shown as tags that open that category |
| Details | Description, author, licence, date and size, with links to the Commons page and the original |
| Non-photos | Video, audio and documents are skipped and counted |
| Offline | Not supported on purpose: no service worker. Every photo comes from Commons |
| Storage | Theme and the last 10 categories, on the device only |
| Theme | Light and Dark, first run follows the device |

## Networking

Only `commons.wikimedia.org/w/api.php` (anonymous, `origin=*`, no cookies, no referrer) and `upload.wikimedia.org`
thumbnails. Grid tiles use the 500px thumbnail, the viewer the 1280px one (Wikimedia only serves fixed widths, and never
larger than the original). Slides within two of the current photo load; the rest stay empty until you get near.

## Accessibility

Tiles are buttons named after the file; the viewer announces "n of N"; Escape closes; arrow keys move; reduced motion turns
smooth scrolling off; everything works with 200% text.

## Later

Upload (Commons needs a login, so it will use a bot password or OAuth in the browser only), and a Commons category search.
