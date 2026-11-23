// A donation ask that never nags. Pure functions, no UI, so the rules are unit tested. Commoner never moves money:
// it opens the donor's own UPI app. The prompt stays off for good after "Don't ask again".
import { validUpi, upiLinks } from './upi.js';

export const SUPPORT = Object.freeze({ upi: 'vysakh.6294-4@waaxis', name: 'Commoner', note: 'Support Commoner' });
// Amounts are in paise (minor units). The donor can pick one or type their own.
export const PRESETS = Object.freeze([2000, 5000, 10000, 50000]);
export const MIN_AMOUNT = 100, MAX_AMOUNT = 10000000; // Rs 1 to Rs 1,00,000 (UPI's usual per-payment ceiling)
export const RULES = Object.freeze({ afterGalleries: 3, repeatDays: 30, thankedDays: 90 });

export const supportEnabled = (cfg = SUPPORT) => validUpi(cfg.upi);

// "50", "50.5", "₹ 1,000", "Rs 250" -> paise; anything else (or out of range) -> null.
export function parseAmount(text) {
  const cleaned = String(text ?? '').replace(/₹|rs\.?|inr|,|\s/gi, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const paise = Math.round(Number(cleaned) * 100);
  return paise >= MIN_AMOUNT && paise <= MAX_AMOUNT ? paise : null;
}
export const formatRupees = paise => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: paise % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
export const supportLinks = (paise, cfg = SUPPORT) => (supportEnabled(cfg) && Number.isSafeInteger(paise) ? upiLinks({ vpa: cfg.upi, name: cfg.name, amount: paise, note: cfg.note }) : null);

export const today = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
export function addDays(date, days) {
  const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + days);
  return today(d);
}
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const emptySupport = () => ({ galleries: 0, never: false, quietUntil: null });
// Stored preferences are untrusted: keep only valid parts.
export function cleanSupport(raw) {
  const s = emptySupport();
  if (!raw || typeof raw !== 'object') return s;
  if (Number.isInteger(raw.galleries) && raw.galleries >= 0) s.galleries = Math.min(raw.galleries, 100000);
  s.never = raw.never === true;
  if (DATE.test(raw.quietUntil)) s.quietUntil = raw.quietUntil;
  return s;
}
export const countGallery = raw => { const s = cleanSupport(raw); return { ...s, galleries: s.galleries + 1 }; };
// Ask once the visitor has really used the app, then rarely, and never after "never".
export function shouldAsk(raw, date = today(), cfg = SUPPORT, rules = RULES) {
  const s = cleanSupport(raw);
  if (!supportEnabled(cfg) || s.never || s.galleries < rules.afterGalleries) return false;
  return !s.quietUntil || date >= s.quietUntil;
}
// outcome: 'later' (Not now), 'never' (Don't ask again), 'paid' (opened UPI to pay).
export function afterAsk(raw, outcome, date = today(), rules = RULES) {
  const s = cleanSupport(raw);
  if (outcome === 'never') return { ...s, never: true };
  return { ...s, quietUntil: addDays(date, outcome === 'paid' ? rules.thankedDays : rules.repeatDays) };
}
