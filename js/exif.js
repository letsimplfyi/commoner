// Reads what the checks need from the first bytes of a photo: its type, size, camera, date and GPS.
// Pure functions on a Uint8Array; nothing here touches the network or the DOM.
export const HEAD_BYTES = 256 * 1024; // EXIF sits in the first 64 KB of a JPEG; the frame size follows soon after

const ascii = (b, from, to) => String.fromCharCode(...b.subarray(from, to));
const HEIC_BRANDS = ['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'];

export function sniff(b) {
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpeg';
  if (b[0] === 0x89 && ascii(b, 1, 4) === 'PNG') return 'png';
  if (ascii(b, 0, 4) === 'GIF8') return 'gif';
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return 'webp';
  if ((ascii(b, 0, 2) === 'II' && b[2] === 42 && b[3] === 0) || (ascii(b, 0, 2) === 'MM' && b[2] === 0 && b[3] === 42)) return 'tiff';
  if (ascii(b, 4, 8) === 'ftyp') return HEIC_BRANDS.includes(ascii(b, 8, 12)) ? 'heic' : 'other';
  return 'other';
}

// Photos saved from Facebook carry an "FBMD" block just after a Photoshop "8BIM" block (the Commons Android app looks for the same).
export function hasFacebookMarker(b) {
  const text = ascii(b, 0, Math.min(b.length, 4096)), ps = text.indexOf('8BIM'), fb = text.indexOf('FBMD');
  return ps > 0 && fb > ps && fb - ps < 0x80;
}

const SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1 };
function readTiff(b, start) {
  const v = new DataView(b.buffer, b.byteOffset + start, b.length - start);
  const le = ascii(b, start, start + 2) === 'II';
  if (!le && ascii(b, start, start + 2) !== 'MM') return null;
  const u16 = o => v.getUint16(o, le), u32 = o => v.getUint32(o, le);
  const ifd = offset => {
    const tags = {};
    if (offset < 8 || offset + 2 > v.byteLength) return tags;
    const n = u16(offset);
    for (let i = 0; i < n; i++) {
      const e = offset + 2 + i * 12;
      if (e + 12 > v.byteLength) break;
      const tag = u16(e), type = u16(e + 2), count = u32(e + 4), size = (SIZES[type] || 0) * count;
      if (!size) continue;
      const at = size <= 4 ? e + 8 : u32(e + 8);
      if (at + size > v.byteLength) continue;
      if (type === 2) tags[tag] = ascii(b, start + at, start + at + count).replace(/\0.*$/s, '').trim();
      else if (type === 3) tags[tag] = Array.from({ length: count }, (_, k) => u16(at + k * 2));
      else if (type === 4) tags[tag] = Array.from({ length: count }, (_, k) => u32(at + k * 4));
      else if (type === 5) tags[tag] = Array.from({ length: count }, (_, k) => (u32(at + k * 8 + 4) ? u32(at + k * 8) / u32(at + k * 8 + 4) : 0));
    }
    return tags;
  };
  const main = ifd(u32(4));
  const exif = main[0x8769] ? ifd(main[0x8769][0]) : {};
  const gps = main[0x8825] ? ifd(main[0x8825][0]) : {};
  return { main, exif, gps };
}

const degrees = (d, ref) => (Array.isArray(d) && d.length === 3 ? (d[0] + d[1] / 60 + d[2] / 3600) * (ref === 'S' || ref === 'W' ? -1 : 1) : null);
const isoDate = s => { const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(s || ''); return m && m[1] !== '0000' ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}` : null; };

// What a JPEG says about itself: frame size and the EXIF block.
function readJpeg(b) {
  const out = { width: 0, height: 0, tiff: null };
  const v = new DataView(b.buffer, b.byteOffset, b.length);
  let o = 2;
  while (o + 4 <= b.length && b[o] === 0xFF) {
    const marker = b[o + 1];
    if (marker === 0xFF) { o += 1; continue; }
    if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { o += 2; continue; }
    if (marker === 0xDA || marker === 0xD9) break;
    const len = v.getUint16(o + 2);
    if (marker === 0xE1 && ascii(b, o + 4, o + 10) === 'Exif\0\0' && !out.tiff) out.tiff = readTiff(b.subarray(0, Math.min(b.length, o + 2 + len)), o + 10);
    if (marker >= 0xC0 && marker <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(marker) && o + 9 <= b.length) { out.height = v.getUint16(o + 5); out.width = v.getUint16(o + 7); break; }
    o += 2 + len;
  }
  return out;
}

export function readPhoto(b) {
  const format = sniff(b);
  const photo = { format, width: 0, height: 0, make: '', model: '', date: null, orientation: 1, gps: null, facebook: format === 'jpeg' && hasFacebookMarker(b) };
  const v = new DataView(b.buffer, b.byteOffset, b.length);
  if (format === 'png' && b.length >= 24) { photo.width = v.getUint32(16); photo.height = v.getUint32(20); }
  else if (format === 'gif' && b.length >= 10) { photo.width = v.getUint16(6, true); photo.height = v.getUint16(8, true); }
  else if (format === 'jpeg') {
    try {
      const jpeg = readJpeg(b);
      photo.width = jpeg.width; photo.height = jpeg.height;
      if (jpeg.tiff) {
        const { main, exif, gps } = jpeg.tiff;
        photo.make = main[0x010F] || ''; photo.model = main[0x0110] || '';
        photo.date = isoDate(exif[0x9003] || exif[0x9004] || main[0x0132]);
        photo.orientation = (main[0x0112] || [1])[0];
        const lat = degrees(gps[2], gps[1]), lon = degrees(gps[4], gps[3]);
        if (lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat || lon)) photo.gps = { lat, lon };
      }
    } catch { /* a damaged EXIF block means no EXIF, not a failed photo */ }
  }
  return photo;
}
