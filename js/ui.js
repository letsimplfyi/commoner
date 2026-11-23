import { h, Component } from '../vendor/preact.module.js';
import htm from '../vendor/htm.module.js';
import { APP_VERSION, REPO_URL, LETSIMPL_URL, RECENT_KEEP } from './config.js';
import { POPULAR, entryName, entryDeep, randomEntry } from './popular.js';
import { parseRoute, parseInput, makeQuery, queryKey, queryTitle, usesSearch, fetchInfo, fetchFiles, gridSrc, viewSrc, displayTitle, shareUrl, pageUrl, categoryTitle } from './commons.js';
import { Icon } from './icons.js';
import { Typeahead } from './typeahead.js';
import { pictureOfTheDay } from './feed.js';
import { SUPPORT, PRESETS, parseAmount, formatRupees, supportLinks, shouldAsk, afterAsk, countGallery, cleanSupport } from './support.js';
import { drawQR } from './qr.js';
import { updateState, checkForUpdate, apply, justUpdated } from './update.js';
const html = htm.bind(h);

const MAX_DEEP_LINK_PAGES = 5, GRID_W = 250;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const store = key => ({
  read: () => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  write: value => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ } },
});
const recentStore = store('commoner-recent'), supportStore = store('commoner-support');
const searchOf = q => new URL(shareUrl(location.href, q)).search;
const readRecent = () => (recentStore.read() || []).filter(s => typeof s === 'string').map(s => (s.startsWith('?') ? s : searchOf({ cats: [s] }))).slice(0, RECENT_KEEP);
const readRoute = () => parseRoute(location.search);
const NOT_A_CATEGORY = 'Not a Commons category.';

function Notice({ kind = 'info', icon = 'info', children }) {
  return html`<div class="ls-callout ls-callout--${kind}" role=${kind === 'error' ? 'alert' : 'note'}><${Icon} name=${icon} /><div>${children}</div></div>`;
}

export class App extends Component {
  state = { q: null, f: '', info: null, files: [], next: null, status: 'idle', error: null, viewer: null, toast: '', recent: readRecent(),
    theme: document.documentElement.dataset.theme || 'light', skipped: 0, similar: [], potd: null, support: cleanSupport(supportStore.read()),
    supportOpen: false, filterOpen: false, refineMode: 'include', inputError: '', refineError: '', checking: false };
  abort = null; pages = 0; toastTimer = 0; io = null; similarFor = '';

  componentDidMount() {
    addEventListener('popstate', this.onPop);
    addEventListener('commoner-update', this.refresh);
    if (justUpdated()) this.toast(`Updated to ${APP_VERSION}`);
    const route = readRoute();
    if (route.cats.length) this.load(route, route.f, { push: false });
    pictureOfTheDay().then(potd => this.setState({ potd })).catch(() => { /* the card simply stays away */ });
  }
  componentWillUnmount() { removeEventListener('commoner-update', this.refresh); removeEventListener('popstate', this.onPop); this.io?.disconnect(); }
  refresh = () => this.forceUpdate();

  onPop = () => {
    const route = readRoute();
    if (!route.cats.length) return this.reset();
    if (!this.state.q || queryKey(route) !== queryKey(this.state.q)) return this.load(route, route.f, { push: false });
    const index = route.f ? this.state.files.findIndex(f => f.name === route.f) : -1;
    this.setState({ viewer: index >= 0 ? index : null });
  };
  reset() {
    this.abort?.abort();
    document.title = 'Commoner · Explore the commons.';
    this.setState({ q: null, f: '', info: null, files: [], next: null, status: 'idle', error: null, viewer: null });
  }
  goHome = event => {
    event?.preventDefault();
    if (location.search) history.pushState({}, '', location.pathname);
    this.reset();
  };

  remember(q) {
    const search = searchOf(q);
    const recent = [search, ...this.state.recent.filter(r => r !== search)].slice(0, RECENT_KEEP);
    recentStore.write(recent);
    this.setState({ recent });
  }

  async load(input, f = '', { push = true } = {}) {
    const q = makeQuery(input), key = queryKey(q);
    this.abort?.abort();
    const ac = this.abort = new AbortController();
    this.pages = 0; this.similarFor = '';
    if (push) history.pushState({}, '', shareUrl(location.href, q));
    document.title = `${queryTitle(q)} · Commoner`;
    this.setState({ q, f, info: null, files: [], next: null, status: 'loading', error: null, viewer: null, skipped: 0, similar: [], refineError: '', filterOpen: q.cats.length > 1 || q.not.length > 0 || q.deep });
    this.remember(q);
    fetchInfo(q, { signal: ac.signal }).then(info => { if (this.state.q && queryKey(this.state.q) === key) this.setState({ info }); }).catch(() => {});
    try { this.addPage(await fetchFiles(q, { signal: ac.signal }), key); }
    catch (error) { if (!ac.signal.aborted) this.setState({ status: 'error', error }); }
  }

  addPage(page, key) {
    if (!this.state.q || queryKey(this.state.q) !== key) return;
    this.pages += 1;
    if (this.pages === 1 && page.files.length) { const support = countGallery(this.state.support); supportStore.write(support); this.setState({ support }); }
    const files = [...this.state.files, ...page.files];
    this.setState({ files, next: page.next, status: 'ready', error: null, skipped: this.state.skipped + page.skipped }, () => {
      const { f } = this.state;
      if (!f) return;
      const index = files.findIndex(x => x.name === f);
      if (index >= 0) { this.setState({ f: '', viewer: index }); return; }
      if (page.next && this.pages < MAX_DEEP_LINK_PAGES) this.more();
      else this.setState({ f: '' });
    });
  }

  more = async () => {
    const { q, next, status } = this.state;
    if (!next || status !== 'ready') return;
    const ac = this.abort, key = queryKey(q);
    this.setState({ status: 'more' });
    try { this.addPage(await fetchFiles(q, { cont: next, signal: ac.signal }), key); }
    catch (error) { if (!ac.signal.aborted) this.setState({ status: 'ready', error }); }
  };

  urlFor = (file = '') => shareUrl(location.href, this.state.q, file);
  openViewer = index => { history.pushState({ v: 1 }, '', this.urlFor(this.state.files[index].name)); this.setState({ viewer: index }); };
  setViewerIndex = index => {
    const { files, next } = this.state;
    if (!files[index]) return;
    history.replaceState({ v: 1 }, '', this.urlFor(files[index].name));
    this.setState({ viewer: index });
    if (next && index >= files.length - 4) this.more();
  };
  closeViewer = () => { if (history.state?.v) history.back(); else this.setState({ viewer: null }); };

  toast(message) {
    clearTimeout(this.toastTimer);
    this.setState({ toast: message });
    this.toastTimer = setTimeout(() => this.setState({ toast: '' }), 3000);
  }
  share = async (title, url) => {
    try { if (navigator.share) { await navigator.share({ title, url }); return; } } catch (error) { if (error.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); this.toast('Link copied'); } catch { this.toast(url); }
  };
  copyLink = async () => { const url = this.urlFor(); try { await navigator.clipboard.writeText(url); this.toast('Link copied'); } catch { this.toast(url); } };
  toggleTheme = () => {
    const theme = this.state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('commoner-theme', theme); } catch { /* storage blocked */ }
    this.setState({ theme });
  };
  checkUpdates = async () => {
    this.setState({ checking: true });
    const result = await checkForUpdate({ force: true });
    this.setState({ checking: false });
    this.toast(result === 'ready' ? 'Update found' : result === 'offline' ? 'Offline' : result === 'skipped' ? 'Updates need HTTPS' : 'Up to date');
  };

  // ---- opening, narrowing down
  openText = text => {
    const q = parseInput(text);
    if (!q) { this.setState({ inputError: NOT_A_CATEGORY }); return false; }
    this.setState({ inputError: '' }); this.load(q); return true;
  };
  open = (name, deep) => event => { event.preventDefault(); this.load({ cats: [name], deep }); };
  surprise = () => { const entry = randomEntry(); this.load({ cats: [entryName(entry)], deep: entryDeep(entry) ? true : undefined }); };
  refine = name => {
    const { q, refineMode } = this.state;
    if (!q || q.cats.includes(name) || q.not.includes(name)) return;
    this.load(refineMode === 'exclude' ? { ...q, not: [...q.not, name], deep: undefined } : { ...q, cats: [...q.cats, name], deep: undefined });
  };
  refineText = text => {
    const name = (parseInput(text) || { cats: [] }).cats[0];
    if (!name) { this.setState({ refineError: NOT_A_CATEGORY }); return false; }
    this.setState({ refineError: '' }); this.refine(name); return true;
  };
  removeCat = name => { const q = this.state.q; if (q.cats.length === 1) return this.goHome(); this.load({ ...q, cats: q.cats.filter(c => c !== name), deep: undefined }); };
  removeNot = name => { const q = this.state.q; this.load({ ...q, not: q.not.filter(c => c !== name), deep: undefined }); };
  toggleDeep = () => { const q = this.state.q; this.load({ ...q, deep: !q.deep }); };
  changeSort = sort => { const q = this.state.q; if (sort !== q.sort) this.load({ ...q, sort }, '', { push: false }); };
  clearRecent = () => { recentStore.write([]); this.setState({ recent: [] }); };
  observe = el => {
    this.io?.disconnect();
    if (!el || !('IntersectionObserver' in window)) return;
    this.io = new IntersectionObserver(entries => { if (entries[0].isIntersecting) this.more(); }, { rootMargin: '800px' });
    this.io.observe(el);
  };
  findSimilar(name) {
    this.similarFor = name;
    const words = name.split(/\s+/);
    const tries = [name, words.slice(0, Math.max(1, words.length - 1)).join(' '), words[0]].filter((s, i, all) => s.length >= 2 && all.indexOf(s) === i);
    (async () => {
      const { fetchSuggestions } = await import('./commons.js');
      for (const s of tries) {
        try { const list = (await fetchSuggestions(s)).filter(n => n !== name); if (list.length && this.similarFor === name) { this.setState({ similar: list }); return; } } catch { return; }
      }
    })();
  }

  // ---- support
  openSupport = () => this.setState({ supportOpen: true });
  closeSupport = outcome => {
    if (outcome) { const support = afterAsk(this.state.support, outcome); supportStore.write(support); this.setState({ support, supportOpen: false }); }
    else this.setState({ supportOpen: false });
  };
  decline = outcome => { const support = afterAsk(this.state.support, outcome); supportStore.write(support); this.setState({ support }); };

  // ---- views
  renderPotd() {
    const { potd } = this.state;
    if (!potd) return null;
    const go = { cats: [`Pictures of the day (${new Date().getUTCFullYear()})`], sort: 'newest' };
    return html`<a class="potd" href=${shareUrl(location.href, go)} onClick=${e => { e.preventDefault(); this.load(go); }}>
      <img src=${potd.thumb} alt=${potd.description || potd.label} width=${potd.width} height=${potd.height} />
      <span class="potd-cap"><b>${potd.label}</b><span class="meta">${[potd.artist, potd.license].filter(Boolean).join(' · ')}</span></span></a>`;
  }

  renderHome() {
    const { inputError, recent } = this.state;
    const tag = entry => { const name = entryName(entry), deep = entryDeep(entry); return html`<li><a class="ls-tag" href=${shareUrl(location.href, { cats: [name], deep: deep ? true : undefined })} onClick=${this.open(name, deep ? true : undefined)}>${name}</a></li>`; };
    const [first, ...rest] = POPULAR;
    return html`<section>
      <${Typeahead} id="category" label="Category" placeholder="Search categories" submitLabel="Open" error=${inputError} onPick=${name => this.load({ cats: [name] })} onText=${this.openText} />
      ${this.renderPotd()}
      <ul class="ls-tags start">${first.items.slice(0, 5).map(tag)}<li><button class="ls-tag" type="button" onClick=${this.surprise}>Surprise me</button></li></ul>
      <details class="more-cats"><summary>More categories</summary>
        ${[first, ...rest].map(g => html`<h2>${g.title}</h2><ul class="ls-tags">${g.items.map(tag)}</ul>`)}</details>
      ${recent.length > 0 && html`<h2>Recent <button class="quiet" type="button" onClick=${this.clearRecent}>Clear</button></h2>
        <ul class="recent">${recent.slice(0, 5).map(search => { const r = parseRoute(search); return html`<li><a href=${location.pathname + search} onClick=${e => { e.preventDefault(); this.load(r); }}>${queryTitle(r)}</a></li>`; })}</ul>`}
    </section>`;
  }

  renderRefine() {
    const { q, refineMode, refineError } = this.state;
    return html`<div class="refine">
      <ul class="chips" aria-label="Categories">
        ${q.cats.map(name => html`<li class="ls-chip">${name}<button type="button" class="chip-x" onClick=${() => this.removeCat(name)} aria-label=${`Remove ${name}`}><${Icon} name="close" small /></button></li>`)}
        ${q.not.map(name => html`<li class="ls-chip ls-chip--unverified"><span aria-hidden="true">−</span><span class="ls-vh">Leave out </span>${name}<button type="button" class="chip-x" onClick=${() => this.removeNot(name)} aria-label=${`Stop leaving out ${name}`}><${Icon} name="close" small /></button></li>`)}
      </ul>
      <div class="segmented" role="group" aria-label="Next category">
        <button type="button" class="ls-btn ls-btn--small" aria-pressed=${refineMode === 'include'} onClick=${() => this.setState({ refineMode: 'include' })}>Add</button>
        <button type="button" class="ls-btn ls-btn--small" aria-pressed=${refineMode === 'exclude'} onClick=${() => this.setState({ refineMode: 'exclude' })}>Leave out</button>
      </div>
      <${Typeahead} id="refine" label=${refineMode === 'exclude' ? 'Leave out' : 'Add category'} hideLabel placeholder="Search categories" submitLabel=${refineMode === 'exclude' ? 'Leave out' : 'Add'} error=${refineError} onPick=${this.refine} onText=${this.refineText} />
      <label class="check"><input type="checkbox" checked=${q.deep} onChange=${this.toggleDeep} /> Subcategories</label>
    </div>`;
  }

  renderSupportCard() {
    const { support, viewer, files } = this.state;
    if (viewer !== null || !files.length || !shouldAsk(support)) return null;
    return html`<aside class="ls-card support-card" aria-labelledby="support-ask">
      <h2 id="support-ask">Love this software ??</h2>
      <p>I love it too... I'd ideally keep on making such simple stupid apps for making life easier.. help support my efforts by donating so I can keep on maintaining this.</p>
      <div class="actions">
        <button class="ls-btn ls-btn--primary" type="button" onClick=${this.openSupport}>Donate</button>
        <button class="ls-btn" type="button" onClick=${() => this.decline('later')}>Not now</button>
        <button class="quiet" type="button" onClick=${() => this.decline('never')}>Don’t ask again</button>
      </div>
    </aside>`;
  }

  renderGallery() {
    const { q, info, files, next, status, error, skipped, similar, filterOpen } = this.state;
    const search = usesSearch(q), single = !search;
    const missing = info && !info.exists;
    if (missing && this.similarFor !== (info.missing[0] || q.cats[0])) this.findSimilar(info.missing[0] || q.cats[0]);
    const related = [...(info?.parents || []), ...(info?.subcats || [])];
    const tagLink = name => html`<li><a class="ls-tag" href=${shareUrl(location.href, { cats: [name] })} onClick=${this.open(name)}>${name}</a></li>`;
    return html`<section>
      <div class="titlebar"><a class="back" href="./" onClick=${this.goHome} aria-label="Back to categories"><${Icon} name="back" /></a>
        <h1>${queryTitle(q)}</h1></div>
      <p class="meta">${info ? `${info.files} ${info.files === 1 ? 'file' : 'files'}` : status === 'loading' ? 'Loading' : ''}${skipped ? ` · ${skipped} not photos` : ''}</p>
      <div class="actions">
        ${navigator.share && html`<button class="ls-btn ls-btn--small" type="button" onClick=${() => this.share(queryTitle(q), this.urlFor())} aria-label="Share"><${Icon} name="share" small /></button>`}
        <button class="ls-btn ls-btn--small" type="button" onClick=${this.copyLink} aria-label="Copy link"><${Icon} name="link" small /></button>
        <button class="ls-btn ls-btn--small" type="button" aria-expanded=${filterOpen} onClick=${() => this.setState({ filterOpen: !filterOpen })}><${Icon} name="filter" small /> Filter</button>
        <div class="segmented" role="group" aria-label="Sort">
          <button type="button" class="ls-btn ls-btn--small" aria-pressed=${q.sort === 'name'} onClick=${() => this.changeSort('name')}>${search ? 'Best' : 'Name'}</button>
          <button type="button" class="ls-btn ls-btn--small" aria-pressed=${q.sort === 'newest'} onClick=${() => this.changeSort('newest')}>Newest</button>
        </div>
      </div>
      ${filterOpen && this.renderRefine()}
      ${related.length > 0 && html`<details class="related"><summary>Related</summary><ul class="ls-tags">${related.map(tagLink)}</ul></details>`}
      ${status === 'error' && html`<${Notice} kind="error" icon="alert">${error?.message || 'Something went wrong.'} <button class="ls-btn ls-btn--small" type="button" onClick=${() => this.load(q, '', { push: false })}><${Icon} name="retry" small /> Retry</button><//>`}
      ${status !== 'loading' && status !== 'error' && files.length === 0 && !next && html`<${Notice} kind=${missing ? 'warning' : 'info'} icon=${missing ? 'alert' : 'info'}>${missing
        ? html`No category “${info.missing[0] || q.cats[0]}”.${similar.length > 0 && html` Did you mean<ul class="ls-tags">${similar.map(tagLink)}</ul>`}`
        : search ? 'No matches. Remove a category or include subcategories.' : 'No photos here. Try subcategories.'}<//>`}
      <div class="grid">${files.map((file, i) => html`<button type="button" class="tile" onClick=${() => this.openViewer(i)} aria-label=${displayTitle(file.name)}>
        <img src=${gridSrc(file)} alt="" loading=${i < 12 ? 'eager' : 'lazy'} decoding="async" width=${GRID_W} height=${GRID_W} /></button>`)}</div>
      ${status === 'more' && html`<p class="status" role="status">Loading</p>`}
      ${error && status === 'ready' && html`<${Notice} kind="error" icon="alert">${error.message}<//>`}
      ${next && html`<div class="more" ref=${this.observe}><button class="ls-btn" type="button" onClick=${this.more} disabled=${status !== 'ready'}>More</button></div>`}
      ${this.renderSupportCard()}
    </section>`;
  }

  render() {
    const { q, files, viewer, toast, theme, supportOpen, support } = this.state;
    return html`<a class="ls-skip" href="#main">Skip to content</a>
      <header class="app-header"><div class="header-inner">
        <a class="brand" href="./" onClick=${this.goHome} aria-label="Commoner, home">
          <img class="mark mark--light" src="./icons/logo-mark.svg" alt="" width="40" height="40" />
          <img class="mark mark--dark" src="./icons/logo-mark-inverse.svg" alt="" width="40" height="40" />
          <span>Commoner</span></a>
        <button class="ls-btn ls-btn--small theme" type="button" onClick=${this.toggleTheme} aria-label=${theme === 'dark' ? 'Light theme' : 'Dark theme'}><${Icon} name=${theme === 'dark' ? 'sun' : 'moon'} small /></button>
      </div></header>
      <main id="main" class="page">${q ? this.renderGallery() : this.renderHome()}</main>
      <footer class="page foot">
        <p>Unofficial. Photos come from Wikimedia Commons, open to everyone, each with its own licence.</p>
        <p><a href=${REPO_URL} target="_blank" rel="noopener noreferrer">Source</a> · <button class="quiet" type="button" onClick=${this.openSupport}>Support</button> · ${updateState.ready
          ? html`<button class="quiet" type="button" onClick=${apply}>Update ready: restart</button>`
          : html`<button class="quiet" type="button" disabled=${this.state.checking} onClick=${this.checkUpdates} aria-label=${`Version ${APP_VERSION}, check for updates`}>${APP_VERSION}</button>`}</p>
      </footer>
      ${viewer !== null && files[viewer] && html`<${Viewer} files=${files} index=${viewer} onIndex=${this.setViewerIndex} onClose=${this.closeViewer} onShare=${this.share} query=${q} />`}
      ${supportOpen && html`<${Support} ask=${shouldAsk(support)} onClose=${this.closeSupport} onCopied=${() => this.toast('Copied')} />`}
      <div class="toast-wrap" role="status">${toast && html`<span class="ls-toast">${toast}</span>`}</div>`;
  }
}

// ---- donation sheet: pick or type an amount, then open the donor's own UPI app
class Support extends Component {
  state = { amount: PRESETS[1], text: '' };
  dialog = null; qr = null;
  componentDidMount() { this.dialog.addEventListener('close', this.onClose); this.dialog.showModal(); this.paint(); }
  componentWillUnmount() { this.dialog.removeEventListener('close', this.onClose); if (this.dialog.open) this.dialog.close(); }
  componentDidUpdate() { this.paint(); }
  onClose = () => this.props.onClose(this.props.ask ? 'later' : undefined);
  paise() { const { amount, text } = this.state; return text.trim() ? parseAmount(text) : amount; }
  paint() { const links = this.paise() && supportLinks(this.paise()); if (this.qr) { if (links) drawQR(this.qr, links.generic, `UPI QR code for ${formatRupees(this.paise())}`); else this.qr.replaceChildren(); } }
  copy = async () => { try { await navigator.clipboard.writeText(SUPPORT.upi); this.props.onCopied(); } catch { /* clipboard blocked */ } };

  render({ ask }, { amount, text }) {
    const paise = this.paise(), links = paise ? supportLinks(paise) : null;
    return html`<dialog class="ls-sheet support" ref=${el => { this.dialog = el; }} aria-labelledby="support-title">
      <div class="ls-sheet__head"><h2 id="support-title">Love this software ??</h2>
        <button class="ls-btn" type="button" onClick=${() => this.dialog.close()} aria-label="Close"><${Icon} name="close" /></button></div>
      <p>I love it too... I'd ideally keep on making such simple stupid apps for making life easier.. help support my efforts by donating so I can keep on maintaining this.</p>
      <div class="segmented wrap" role="group" aria-label="Amount">${PRESETS.map(p => html`<button type="button" class="ls-btn" aria-pressed=${!text.trim() && amount === p} onClick=${() => this.setState({ amount: p, text: '' })}>${formatRupees(p)}</button>`)}</div>
      <div class="ls-field"><label for="amount">Any amount (₹)</label>
        <input id="amount" class="ls-input" type="text" inputmode="decimal" autocomplete="off" placeholder="75" value=${text} onInput=${e => this.setState({ text: e.target.value })} aria-invalid=${text.trim() && !paise ? 'true' : 'false'} /></div>
      ${links ? html`<a class="ls-btn ls-btn--primary ls-btn--outbound" href=${links.generic} onClick=${() => this.props.onClose('paid')}>Donate ${formatRupees(paise)}</a>` : null}
      <div class="upi-id"><b>${SUPPORT.upi}</b><button class="ls-btn ls-btn--small" type="button" onClick=${this.copy} aria-label="Copy UPI ID"><${Icon} name="link" small /></button></div>
      ${links && html`<details class="other-apps"><summary>Other UPI apps</summary><ul class="recent">${links.apps.map(a => html`<li><a href=${a.href} onClick=${() => this.props.onClose('paid')}>${a.name}</a></li>`)}</ul></details>`}
      <div class="qr" ref=${el => { this.qr = el; }}></div>
      ${ask && html`<div class="actions"><button class="ls-btn" type="button" onClick=${() => this.props.onClose('later')}>Not now</button><button class="quiet" type="button" onClick=${() => this.props.onClose('never')}>Don’t ask again</button></div>`}
    </dialog>`;
  }
}

class Viewer extends Component {
  state = { details: false };
  dialog = null; track = null; frame = 0;

  componentDidMount() {
    this.dialog.addEventListener('close', this.onDialogClose);
    this.dialog.showModal();
    this.snap(this.props.index, false);
  }
  componentWillUnmount() {
    cancelAnimationFrame(this.frame);
    this.dialog.removeEventListener('close', this.onDialogClose);
    if (this.dialog.open) this.dialog.close();
  }
  componentDidUpdate(prev) {
    if (prev.index !== this.props.index && Math.round(this.track.scrollLeft / this.track.clientWidth) !== this.props.index) this.snap(this.props.index, false);
  }

  onDialogClose = () => this.props.onClose();
  snap(index, smooth) { this.track.scrollTo({ left: index * this.track.clientWidth, behavior: smooth && !reduceMotion() ? 'smooth' : 'instant' }); }
  onScroll = () => {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      const index = Math.round(this.track.scrollLeft / (this.track.clientWidth || 1));
      if (index !== this.props.index) this.props.onIndex(index);
    });
  };
  go(delta) {
    const next = this.props.index + delta;
    if (next >= 0 && next < this.props.files.length) this.snap(next, true);
  }
  onKey = event => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); this.go(-1); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); this.go(1); }
  };

  render({ files, index, onClose, onShare, query }, { details }) {
    const file = files[index];
    const title = displayTitle(file.name);
    const meta = [file.license, file.author, file.date].filter(Boolean).join(' · ');
    return html`<dialog class="viewer" ref=${el => { this.dialog = el; }} aria-label=${`Photo ${index + 1} of ${files.length}: ${title}`} onKeyDown=${this.onKey}>
      <div class="viewer-bar">
        <button class="ls-btn" type="button" onClick=${onClose} aria-label="Close viewer"><${Icon} name="close" /></button>
        <span class="counter" aria-live="polite">${index + 1} / ${files.length}</span>
        <button class="ls-btn nav" type="button" onClick=${() => this.go(-1)} disabled=${index === 0} aria-label="Previous photo"><${Icon} name="prev" /></button>
        <button class="ls-btn nav" type="button" onClick=${() => this.go(1)} disabled=${index === files.length - 1} aria-label="Next photo"><${Icon} name="next" /></button>
      </div>
      <div class="track" ref=${el => { this.track = el; }} onScroll=${this.onScroll} tabindex="0" aria-label="Photos, swipe sideways">
        ${files.map((f, i) => html`<div class="slide" key=${f.name}>${Math.abs(i - index) <= 2 && html`<img src=${viewSrc(f)} alt=${f.description || displayTitle(f.name)} decoding="async" />`}</div>`)}
      </div>
      <div class="viewer-caption">
        <h2>${title}</h2>
        ${meta && html`<p class="meta">${meta}</p>`}
        <div class="actions">
          <button class="ls-btn ls-btn--small" type="button" aria-expanded=${details} onClick=${() => this.setState({ details: !details })} aria-label="Details"><${Icon} name="info" small /></button>
          <button class="ls-btn ls-btn--small" type="button" onClick=${() => onShare(title, shareUrl(location.href, query, file.name))} aria-label="Share"><${Icon} name="share" small /></button>
          <a class="ls-btn ls-btn--small ls-btn--outbound" href=${file.page} target="_blank" rel="noopener noreferrer">Commons</a>
        </div>
        ${details && html`<dl class="details">
          ${file.description && html`<dt>Description</dt><dd>${file.description}</dd>`}
          <dt>Author</dt><dd>${file.author || 'Unknown'}</dd>
          <dt>Licence</dt><dd>${file.license || 'See Commons'}</dd>
          <dt>Size</dt><dd>${file.width} × ${file.height} · <a href=${file.url} target="_blank" rel="noopener noreferrer">Original</a></dd>
        </dl>`}
      </div>
    </dialog>`;
  }
}
