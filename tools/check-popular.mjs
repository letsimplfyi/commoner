// Checks every category in js/popular.js still exists on Commons and has photos (or subcategories, for the broad ones).
// Run: npm run popular:check   (it is gentle with Commons: batches of 40, with pauses)
import { allPopular, entryName, entryDeep } from '../js/popular.js';
const API = 'https://commons.wikimedia.org/w/api.php';
const sleep = ms => new Promise(done => setTimeout(done, ms));
const entries = allPopular();
let bad = 0;
for (let i = 0; i < entries.length; i += 40) {
  const batch = entries.slice(i, i + 40);
  const url = `${API}?${new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*', prop: 'categoryinfo', titles: batch.map(e => `Category:${entryName(e)}`).join('|') })}`;
  const json = await (await fetch(url, { headers: { 'User-Agent': 'commoner-popular-check (https://commoner.letsimpl.fyi)' } })).json();
  const info = new Map(json.query.pages.map(p => [p.title.replace(/^Category:/, ''), p.categoryinfo]));
  for (const entry of batch) {
    const c = info.get(entryName(entry)), ok = c && (entryDeep(entry) ? c.subcats >= 3 : c.files >= 20);
    if (!ok) bad += 1;
    console.log(`${ok ? 'ok     ' : 'PROBLEM'} ${String(c?.files ?? 0).padStart(7)} files ${String(c?.subcats ?? 0).padStart(4)} subcats  ${entryName(entry)}`);
  }
  await sleep(2500);
}
process.exit(bad ? 1 : 0);
