// The rules that decide which photos are staged for Commons and which are not, and why.
// Pure: the browser measures a photo (js/measure.js) and passes the facts here. A rule's quote is copied word for word
// from the Commons page it links to, so the reason a user reads is Commons' own; do not reword the quotes.

const OWN_WORK = '"Own work" or "self-made" has a particular meaning at Commons. It refers to works that you have created yourself, that are not substantially representations of works by others - derivative works.';
const NON_FREE = 'Commons does not host Fair use content or other non-free content, such as most Content published on the Internet and elsewhere.';
const SCREENSHOTS = 'Screenshots are derivative works and as such subject to the copyright of the displayed content, whether it be a video, television program, or a computer program.';
const PEOPLE = 'When dealing with photographs of people, we are required to consider the legal and moral rights of the subject.';
const QUALITY = 'Quality images are diagrams or photographs that meet certain quality standards (which are mostly technical in nature) and are valuable for Wikimedia projects.';

// locked: Commons cannot take it, so the user cannot add it back. Everything else can be added anyway.
export const REASONS = {
  type: { label: 'Commons does not take this file type', locked: true, page: 'Commons:File types' },
  unreadable: { label: 'This file could not be read', locked: true, page: 'Commons:File types' },
  noexif: { label: 'No camera details in the file', quote: OWN_WORK, page: 'Commons:Own work' },
  web: { label: 'Looks saved from the internet or an app', quote: NON_FREE, page: 'Commons:Project scope/Summary' },
  screenshot: { label: 'A screenshot', quote: SCREENSHOTS, page: 'Commons:Screenshots' },
  people: { label: 'Shows a person', quote: PEOPLE, page: 'Commons:Photographs of identifiable people' },
  dark: { label: 'Too dark', quote: QUALITY, page: 'Commons:Quality images' },
  blurry: { label: 'Blurry', quote: QUALITY, page: 'Commons:Quality images' },
  small: { label: 'Very small', quote: QUALITY, page: 'Commons:Quality images' },
  removed: { label: 'You removed it' },
};

export const ACCEPTED = ['jpeg', 'png', 'webp', 'gif', 'tiff'];
export const MIN_PIXELS = 1_000_000;
const SCREENSHOT_NAME = /^screen ?shot|screenshot[ _-]|^Screenshot/i;
const WEB_NAME = /^FB_IMG|^IMG-\d{8}-WA\d+|^received_\d|^WhatsApp (Image|Video)|^Telegram|^image_picker/i;

// Darkness, as the Commons Android app measures it: a photo is dark when too few pixels are bright (lightness 40 or more)
// and too few are medium (above 26). Lightness is (max + min) / 2 of the colour channels, in percent.
export function lightness(rgba) {
  let bright = 0, medium = 0;
  const pixels = rgba.length / 4;
  for (let i = 0; i < rgba.length; i += 4) {
    const max = Math.max(rgba[i], rgba[i + 1], rgba[i + 2]) / 255, min = Math.min(rgba[i], rgba[i + 1], rgba[i + 2]) / 255;
    const l = ((max + min) / 2) * 100;
    if (l >= 40) bright++; else if (l > 26) medium++;
  }
  return { bright: bright / pixels, medium: medium / pixels };
}
export const isDark = ({ bright, medium }) => bright < 0.025 && medium < 0.3;

// Sharpness: the variance of the Laplacian over a grey copy (low means few edges, so blur).
export function sharpness(rgba, width, height) {
  const grey = new Float32Array(width * height);
  for (let i = 0; i < grey.length; i++) grey[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  let sum = 0, sumSq = 0, n = 0;
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x, d = grey[i - width] + grey[i + width] + grey[i - 1] + grey[i + 1] - 4 * grey[i];
    sum += d; sumSq += d * d; n++;
  }
  return n ? sumSq / n - (sum / n) ** 2 : 0;
}
// Sharpness of a photo is the sharpest tile of a 4 x 4 grid, so a plain sky or a deliberate blur elsewhere does not count against it.
export function sharpestTile(rgba, width, height, n = 4) {
  const tw = Math.floor(width / n), th = Math.floor(height / n);
  if (tw < 3 || th < 3) return sharpness(rgba, width, height);
  let best = 0;
  for (let ty = 0; ty < n; ty++) for (let tx = 0; tx < n; tx++) {
    const tile = new Uint8ClampedArray(tw * th * 4);
    for (let y = 0; y < th; y++) tile.set(rgba.subarray(((ty * th + y) * width + tx * tw) * 4, ((ty * th + y) * width + tx * tw + tw) * 4), y * tw * 4);
    best = Math.max(best, sharpness(tile, tw, th));
  }
  return best;
}
// Measured on a 1024 px copy of 60 Commons Quality images of landscapes against 65 files in "Erroneous focus adjustment" and
// "Blur from camera motion": this threshold wrongly flags about 5% of the sharp ones and catches about 58% of the blurry ones
// (AUC 0.85). At 256 px the same score was much weaker (AUC 0.73), so measure.js uses 1024. A hint, not a verdict.
export const BLUR_BELOW = 3400;
export const SHARP_SIDE = 1024;

// facts: { name, format, width, height, photo (from readPhoto), dark, sharp, faces }
export function judge(facts) {
  const { name = '', format, width = 0, height = 0, photo = {}, dark = false, sharp = Infinity, faces = 0 } = facts;
  const ids = [];
  if (format === 'unreadable') ids.push('unreadable');
  else if (!ACCEPTED.includes(format)) ids.push('type');
  else {
    if (!photo.make && !photo.date) ids.push('noexif');
    if (photo.facebook || WEB_NAME.test(name)) ids.push('web');
    if (SCREENSHOT_NAME.test(name)) ids.push('screenshot');
    if (faces > 0) ids.push('people');
    if (dark) ids.push('dark');
    if (sharp < BLUR_BELOW) ids.push('blurry');
    if (width && height && width * height < MIN_PIXELS) ids.push('small');
  }
  return { staged: ids.length === 0, locked: ids.some(id => REASONS[id].locked), reasons: ids };
}
