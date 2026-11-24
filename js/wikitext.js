// The words and wikitext that go to Commons for one photo. Pure: no network, no DOM.
// The shape follows the Commons Android app's page contents (Information, Location, licence, tracking template, categories).

export const LICENCES = {
  'cc-by-sa-4.0': { label: 'CC BY-SA 4.0', template: '{{self|cc-by-sa-4.0}}' },
  'cc-by-4.0': { label: 'CC BY 4.0', template: '{{self|cc-by-4.0}}' },
  'cc-zero': { label: 'CC0', template: '{{self|cc-zero}}' },
};
export const DEFAULT_LICENCE = 'cc-by-sa-4.0';
export const MAX_NAME_BYTES = 240; // MediaWiki refuses longer file names (filename-toolong)
const SUFFIX_BYTES = 8; // " (12345)" is added when the name is taken

const bytes = s => new TextEncoder().encode(s).length;
// Characters a Commons file name cannot hold, and wikitext-active ones we keep out of free text.
const cleanName = s => String(s ?? '').replace(/[#<>[\]|{}:/\\?*"]/g, ' ').replace(/[_\s]+/g, ' ').trim();
const cleanText = s => String(s ?? '').replace(/[<>[\]|{}]/g, ' ').replace(/\s+/g, ' ').trim();

export const dateOf = iso => (/^\d{4}-\d{2}-\d{2}/.test(iso || '') ? iso.slice(0, 10) : '');
const stemOf = name => String(name).replace(/\.[A-Za-z0-9]{2,5}$/, '');
const extOf = name => (/\.([A-Za-z0-9]{2,5})$/.exec(name)?.[1] || 'jpg').toLowerCase().replace('jpeg', 'jpg');

// "<subject>, <date> (<original name>).jpg": descriptive, and unique because the camera's own number stays in it.
// The camera's IMG_1234 alone is refused by Commons' title blacklist, so the subject is required.
export function makeFileName({ subject, date, original }) {
  const stem = cleanName(stemOf(original)), what = cleanName(subject);
  if (!what) return '';
  const tail = ` (${stem}).${extOf(original)}`;
  let head = [what, dateOf(date)].filter(Boolean).join(', ');
  while (bytes(head + tail) > MAX_NAME_BYTES - SUFFIX_BYTES && head.length > 8) head = Array.from(head).slice(0, -1).join('').trim();
  const name = head + tail;
  return name[0].toUpperCase() + name.slice(1);
}

// Everything the user has decided or the photo says. gps is left out when the user's privacy settings remove it.
export function buildPage({ subject, description, date, gps, author, licence = DEFAULT_LICENCE, categories = [], language = 'en' }) {
  const lic = LICENCES[licence] || LICENCES[DEFAULT_LICENCE], d = dateOf(date), who = cleanName(author);
  const text = cleanText(description || subject);
  const lines = [
    '== {{int:filedesc}} ==',
    '{{Information',
    `|description={{${language}|1=${text}}}`,
    d ? `|date={{According to Exif data|${d}}}` : '|date=',
    '|source={{own}}',
    `|author=${who ? `[[User:${who}|${who}]]` : ''}`,
    '}}',
  ];
  if (gps && Number.isFinite(gps.lat) && Number.isFinite(gps.lon)) lines.push(`{{Location|${gps.lat.toFixed(6)}|${gps.lon.toFixed(6)}}}`);
  lines.push('', '== {{int:license-header}} ==', lic.template, '', '{{Uploaded from Commoner}}', '');
  const cats = [...new Set(categories.map(cleanName).filter(Boolean))];
  lines.push(...(cats.length ? cats.map(c => `[[Category:${c}]]`) : ['{{subst:unc}}']));
  return lines.join('\n');
}

// The upload comment is per file and cannot be edited later, so it names the file's own subject.
export const uploadComment = ({ subject }) => `Uploaded with Commoner: ${cleanText(subject)}`.slice(0, 200);

// Rounds a position to a precision, or drops it: inside the user's home zone, or when they chose not to share it.
export function publicGps(gps, { precision = 'exact', home = null } = {}) {
  if (!gps || precision === 'none') return null;
  if (home && distanceM(gps, home) <= home.radius) return null;
  const digits = { exact: 6, street: 3, town: 2 }[precision] ?? 6;
  return { lat: +gps.lat.toFixed(digits), lon: +gps.lon.toFixed(digits) };
}
export function distanceM(a, b) {
  const rad = x => (x * Math.PI) / 180, dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

// What the user keeps between visits: the licence and how precisely their photos' locations are shared.
export const PRECISIONS = { exact: 'Exact place', street: 'Street', town: 'Town', none: 'Do not share' };
export const cleanProfile = raw => ({
  licence: raw && LICENCES[raw.licence] ? raw.licence : DEFAULT_LICENCE,
  precision: raw && PRECISIONS[raw.precision] ? raw.precision : 'street',
});
