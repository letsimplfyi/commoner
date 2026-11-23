export const page = (index, name, extra = {}) => ({
  pageid: 1000 + index, ns: 6, title: `File:${name}`, index,
  imageinfo: [{
    url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${name.replace(/ /g, '_')}`,
    thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${name.replace(/ /g, '_')}/500px-${name.replace(/ /g, '_')}`,
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
