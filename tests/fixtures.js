export const page = (index, name, extra = {}) => ({
  pageid: 1000 + index, ns: 6, title: `File:${name}`, index,
  imageinfo: [{
    url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${name.replace(/ /g, '_')}`,
    thumburl: `https://thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/${name.replace(/ /g, '_')}/500px-${name.replace(/ /g, '_')}`,
    width: 4000, height: 2248, mime: 'image/jpeg',
    extmetadata: {
      ImageDescription: { value: '<p>Brick building &amp; sky</p>' }, Artist: { value: '<a href="//x">Vysakh Premkumar</a>' },
      LicenseShortName: { value: 'CC BY-SA 4.0' }, DateTimeOriginal: { value: '2026-11-23' },
    },
    ...extra,
  }],
});
export const listResponse = (names, cont = null) => ({
  batchcomplete: true, ...(cont ? { continue: cont } : {}),
  query: { pages: names.map((n, i) => page(i + 1, n)) },
});

// ---- an EXIF block built byte by byte (big-endian TIFF), for tests of the upload checks
const ifd = (entries, base) => {
  const head = 2 + entries.length * 12 + 4, data = [];
  const out = Buffer.alloc(head); out.writeUInt16BE(entries.length, 0);
  let used = 0;
  entries.forEach((e, i) => {
    const o = 2 + i * 12; out.writeUInt16BE(e.tag, o); out.writeUInt16BE(e.type, o + 2);
    let bytes;
    if (e.type === 2) bytes = Buffer.from(`${e.value}\0`);
    else if (e.type === 3) { bytes = Buffer.alloc(e.value.length * 2); e.value.forEach((x, k) => bytes.writeUInt16BE(x, k * 2)); }
    else if (e.type === 4) { bytes = Buffer.alloc(e.value.length * 4); e.value.forEach((x, k) => bytes.writeUInt32BE(x, k * 4)); }
    else { bytes = Buffer.alloc(e.value.length * 8); e.value.forEach(([n, d], k) => { bytes.writeUInt32BE(n, k * 8); bytes.writeUInt32BE(d, k * 8 + 4); }); }
    out.writeUInt32BE(e.type === 2 ? bytes.length : e.value.length, o + 4);
    if (bytes.length <= 4) bytes.copy(out, o + 8);
    else { out.writeUInt32BE(base + head + used, o + 8); data.push(bytes); used += bytes.length; }
  });
  return Buffer.concat([out, ...data]);
};
// The APP1 segment of a JPEG: make, date ("YYYY:MM:DD HH:MM:SS") and optional GPS ({ lat, lon, latDms, lonDms }).
export function exifApp1({ make, date, gps } = {}) {
  const gpsEntries = gps ? [{ tag: 1, type: 2, value: gps.lat < 0 ? 'S' : 'N' }, { tag: 2, type: 5, value: gps.latDms }, { tag: 3, type: 2, value: gps.lon < 0 ? 'W' : 'E' }, { tag: 4, type: 5, value: gps.lonDms }] : null;
  const exifEntries = date ? [{ tag: 0x9003, type: 2, value: date }] : null;
  const main = (exifOff, gpsOff) => [
    ...(make ? [{ tag: 0x010F, type: 2, value: make }] : []),
    ...(exifEntries ? [{ tag: 0x8769, type: 4, value: [exifOff] }] : []),
    ...(gpsEntries ? [{ tag: 0x8825, type: 4, value: [gpsOff] }] : []),
  ];
  const exifOff = 8 + ifd(main(0, 0), 8).length, gpsOff = exifOff + (exifEntries ? ifd(exifEntries, 0).length : 0);
  const tiff = Buffer.concat([Buffer.from('MM\0*'), Buffer.from([0, 0, 0, 8]), ifd(main(exifOff, gpsOff), 8), ...(exifEntries ? [ifd(exifEntries, exifOff)] : []), ...(gpsEntries ? [ifd(gpsEntries, gpsOff)] : [])]);
  const body = Buffer.concat([Buffer.from('Exif\0\0'), tiff]);
  return Buffer.concat([Buffer.from([0xFF, 0xE1, (body.length + 2) >> 8, (body.length + 2) & 255]), body]);
}
