// Looks at one photo in the browser: its real size, brightness, sharpness and (where the browser can) faces.
// The photo is decoded once, drawn onto a small canvas, and closed again; nothing is uploaded or kept except a tiny preview.
import { HEAD_BYTES, readPhoto } from './exif.js';
import { lightness, isDark, sharpestTile, judge, SHARP_SIDE } from './rules.js';

const SIDE = 256, PREVIEW = 200;
let faceDetector;
const detector = () => (faceDetector === undefined ? (faceDetector = 'FaceDetector' in self ? new self.FaceDetector({ fastMode: true }) : null) : faceDetector);

function small(bitmap, side) {
  const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function analyse(file) {
  const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
  const photo = readPhoto(head), base = { name: file.name, format: photo.format, photo, width: photo.width, height: photo.height };
  if (!['jpeg', 'png', 'webp', 'gif', 'tiff'].includes(photo.format)) return { ...judge(base), preview: '', photo };
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { return { ...judge({ ...base, format: 'unreadable' }), preview: '', photo }; }
  try {
    const { width, height } = bitmap, canvas = small(bitmap, SIDE), ctx = canvas.getContext('2d', { willReadFrequently: true });
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let faces = 0;
    try { faces = detector() ? (await detector().detect(canvas)).length : 0; } catch { /* no face check on this device */ }
    const preview = small(canvas, PREVIEW).toDataURL('image/jpeg', 0.6); // a data: URL, which the CSP allows
    const light = lightness(pixels), wide = small(bitmap, SHARP_SIDE), sharp = sharpestTile(wide.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, wide.width, wide.height).data, wide.width, wide.height);
    return { ...judge({ ...base, width, height, dark: isDark(light), sharp, faces }), preview, photo: { ...photo, width, height }, stats: { bright: light.bright, medium: light.medium, sharp, faces, detector: !!detector() } };
  } finally { bitmap.close(); }
}
