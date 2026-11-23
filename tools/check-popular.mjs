// Checks every category in js/popular.js still exists on Commons and has photos. Run: npm run popular:check
import { allPopular } from '../js/popular.js';
import { infoUrl, normaliseInfo } from '../js/commons.js';
let bad = 0;
for (const name of allPopular()) {
  const info = normaliseInfo(await (await fetch(infoUrl(name))).json());
  const ok = info.exists && info.files > 0;
  if (!ok) bad += 1;
  console.log(`${ok ? 'ok     ' : 'PROBLEM'} ${String(info.files).padStart(7)}  ${name}`);
}
process.exit(bad ? 1 : 0);
