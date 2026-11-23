import { h, Component } from '../vendor/preact.module.js';
import htm from '../vendor/htm.module.js';
import { APP_VERSION, REPO_URL, LETSIMPL_URL, RECENT_KEEP } from './config.js';
import { parseCategory, fetchInfo, fetchFiles, gridSrc, viewSrc, displayTitle, shareUrl, pageUrl } from './commons.js';
import { Icon } from './icons.js';
const html = htm.bind(h);

const MAX_DEEP_LINK_PAGES = 5;
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const readRecent = () => { try { return JSON.parse(localStorage.getItem('commoner-recent')) || []; } catch { return []; } };
const writeRecent = list => { try { localStorage.setItem('commoner-recent', JSON.stringify(list)); } catch { /* storage blocked */ } };
const readRoute = () => { const p = new URLSearchParams(location.search); return { c: parseCategory(p.get('c')), f: p.get('f') || '' }; };

function Notice({ kind = 'info', icon = 'info', children }) {
  return html`<div class="ls-callout ls-callout--${kind}" role=${kind === 'error' ? 'alert' : 'note'}><${Icon} name=${icon} /><div>${children}</div></div>`;
}

export class App extends Component {
  state = { c: '', f: '', info: null, files: [], next: null, status: 'idle', error: null, sort: 'name', viewer: null, toast: '',
    recent: readRecent(), input: '', inputError: '', theme: document.documentElement.dataset.theme || 'light', skipped: 0 };
  abort = null; pages = 0; toastTimer = 0; io = null;

  componentDidMount() {
    addEventListener('popstate', this.onPop);
    const route = readRoute();
    if (route.c) this.load(route.c, route.f, { push: false });
  }
  componentWillUnmount() { removeEventListener('popstate', this.onPop); this.io?.disconnect(); }

  onPop = () => {
    const route = readRoute();
    if (!route.c) return this.reset();
    if (route.c !== this.state.c) return this.load(route.c, route.f, { push: false });
    const index = route.f ? this.state.files.findIndex(f => f.name === route.f) : -1;
    this.setState({ viewer: index >= 0 ? index : null });
  };

  reset() {
    this.abort?.abort();
    document.title = 'Commoner · Explore the commons.';
    this.setState({ c: '', f: '', info: null, files: [], next: null, status: 'idle', error: null, viewer: null });
  }

  goHome = event => {
    event?.preventDefault();
    if (location.search) history.pushState({}, '', location.pathname);
    this.reset();
  };

  remember(name) {
    const recent = [name, ...this.state.recent.filter(r => r !== name)].slice(0, RECENT_KEEP);
    writeRecent(recent);
    this.setState({ recent });
  }

  async load(c, f = '', { push = true, sort = this.state.sort } = {}) {
    this.abort?.abort();
    const ac = this.abort = new AbortController();
    this.pages = 0;
    if (push) history.pushState({}, '', shareUrl(location.href, c));
    document.title = `${c} · Commoner`;
    this.setState({ c, f, info: null, files: [], next: null, status: 'loading', error: null, viewer: null, sort, skipped: 0 });
    this.remember(c);
    fetchInfo(c, { signal: ac.signal }).then(info => { if (this.state.c === c) this.setState({ info }); }).catch(() => {});
    try { this.addPage(await fetchFiles(c, { sort, signal: ac.signal }), c); }
    catch (error) { if (!ac.signal.aborted) this.setState({ status: 'error', error }); }
  }

  addPage(page, c) {
    if (this.state.c !== c) return;
    this.pages += 1;
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
    const { c, next, sort, status } = this.state;
    if (!next || status !== 'ready') return;
    const ac = this.abort;
    this.setState({ status: 'more' });
    try { this.addPage(await fetchFiles(c, { sort, cont: next, signal: ac.signal }), c); }
    catch (error) { if (!ac.signal.aborted) this.setState({ status: 'ready', error }); }
  };

  openViewer = index => {
    const { c, files } = this.state;
    history.pushState({ v: 1 }, '', shareUrl(location.href, c, files[index].name));
    this.setState({ viewer: index });
  };
  setViewerIndex = index => {
    const { c, files, next } = this.state;
    if (!files[index]) return;
    history.replaceState({ v: 1 }, '', shareUrl(location.href, c, files[index].name));
    this.setState({ viewer: index });
    if (next && index >= files.length - 4) this.more();
  };
  closeViewer = () => {
    if (history.state?.v) history.back();
    else this.setState({ viewer: null });
  };

  toast(message) {
    clearTimeout(this.toastTimer);
    this.setState({ toast: message });
    this.toastTimer = setTimeout(() => this.setState({ toast: '' }), 3000);
  }
  share = async (title, url) => {
    try { if (navigator.share) { await navigator.share({ title, url }); return; } } catch (error) { if (error.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); this.toast('Link copied'); } catch { this.toast(url); }
  };
  toggleTheme = () => {
    const theme = this.state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('commoner-theme', theme); } catch { /* storage blocked */ }
    this.setState({ theme });
  };

  submit = event => {
    event.preventDefault();
    const name = parseCategory(this.state.input);
    if (!name) { this.setState({ inputError: 'That is not a Commons category. Use a name such as Photos taken by Vysakh Premkumar, or a link to a Category page on commons.wikimedia.org.' }); return; }
    this.setState({ inputError: '', input: '' });
    this.load(name);
  };
  openCategory = name => event => { event.preventDefault(); this.load(name); };
  clearRecent = () => { writeRecent([]); this.setState({ recent: [] }); };
  changeSort = sort => { if (sort !== this.state.sort) this.load(this.state.c, '', { push: false, sort }); };
  observe = el => {
    this.io?.disconnect();
    if (!el || !('IntersectionObserver' in window)) return;
    this.io = new IntersectionObserver(entries => { if (entries[0].isIntersecting) this.more(); }, { rootMargin: '800px' });
    this.io.observe(el);
  };

  renderHome() {
    const { input, inputError, recent } = this.state;
    return html`<section>
      <h1>Open a category</h1>
      <p class="ls-prose">Type or paste a Wikimedia Commons category and see its photos as a gallery. Tap one to swipe through them.</p>
      <form onSubmit=${this.submit} novalidate>
        <div class="ls-field">
          <label for="category">Category name or link</label>
          <input id="category" class="ls-input" type="text" inputmode="url" autocapitalize="off" autocomplete="off" spellcheck="false"
            value=${input} onInput=${e => this.setState({ input: e.target.value })} aria-invalid=${inputError ? 'true' : 'false'} aria-describedby="category-hint category-error" />
          <span class="ls-hint" id="category-hint">Example: Photos taken by Vysakh Premkumar</span>
          ${inputError && html`<span class="ls-callout ls-callout--error" id="category-error" role="alert"><${Icon} name="alert" /><span>${inputError}</span></span>`}
        </div>
        <button class="ls-btn ls-btn--primary" type="submit">Open</button>
      </form>
      ${recent.length > 0 && html`<h2>Recent</h2>
        <ul class="recent">${recent.map(name => html`<li><a href=${shareUrl(location.href, name)} onClick=${this.openCategory(name)}>${name}</a></li>`)}</ul>
        <button class="ls-btn ls-btn--small" type="button" onClick=${this.clearRecent}>Clear recent</button>`}
      <h2>Share a gallery</h2>
      <p class="ls-prose">Add <code>?c=</code> and the category name to the address, for example <code>${location.origin}/?c=Photos taken by Vysakh Premkumar</code>. Anyone who opens the link sees the same gallery.</p>
    </section>`;
  }

  renderGallery() {
    const { c, info, files, next, status, error, sort, skipped } = this.state;
    const url = shareUrl(location.href, c);
    const missing = info && !info.exists;
    return html`<section>
      <p><a class="back" href="./" onClick=${this.goHome}><${Icon} name="back" /> Open another category</a></p>
      <h1>${c}</h1>
      <p class="meta">${info ? `${info.files} ${info.files === 1 ? 'file' : 'files'}` : status === 'loading' ? 'Loading' : ''}${skipped ? `, ${skipped} not shown (not photos)` : ''}</p>
      <div class="actions">
        <button class="ls-btn ls-btn--small" type="button" onClick=${() => this.share(c, url)}><${Icon} name="share" small /> Share</button>
        <a class="ls-btn ls-btn--small ls-btn--outbound" href=${pageUrl(`Category:${c}`)} target="_blank" rel="noopener noreferrer">Open on Commons</a>
        <div class="segmented" role="group" aria-label="Sort">
          <button type="button" class="ls-btn ls-btn--small" aria-pressed=${sort === 'name'} onClick=${() => this.changeSort('name')}>Name</button>
          <button type="button" class="ls-btn ls-btn--small" aria-pressed=${sort === 'newest'} onClick=${() => this.changeSort('newest')}>Newest</button>
        </div>
      </div>
      ${info?.subcats.length > 0 && html`<ul class="ls-tags">${info.subcats.map(name => html`<li><a class="ls-tag" href=${shareUrl(location.href, name)} onClick=${this.openCategory(name)}>${name}</a></li>`)}</ul>`}
      ${status === 'loading' && html`<p class="status" role="status">Loading photos</p>`}
      ${status === 'error' && html`<${Notice} kind="error" icon="alert">${error?.message || 'Something went wrong.'} <button class="ls-btn ls-btn--small" type="button" onClick=${() => this.load(c, '', { push: false })}><${Icon} name="retry" small /> Try again</button><//>`}
      ${status !== 'loading' && status !== 'error' && files.length === 0 && !next && html`<${Notice} kind=${missing ? 'warning' : 'info'} icon=${missing ? 'alert' : 'info'}>${missing ? html`There is no category called <b>${c}</b> on Commons. Check the spelling.` : 'This category has no photos.'}<//>`}
      <div class="grid">${files.map((file, i) => html`<button type="button" class="tile" onClick=${() => this.openViewer(i)} aria-label=${displayTitle(file.name)}>
        <img src=${gridSrc(file)} alt="" loading=${i < 12 ? 'eager' : 'lazy'} decoding="async" width=${GRID_W} height=${GRID_W} /></button>`)}</div>
      ${status === 'more' && html`<p class="status" role="status">Loading more</p>`}
      ${error && status === 'ready' && html`<${Notice} kind="error" icon="alert">${error.message}<//>`}
      ${next && html`<div class="more" ref=${this.observe}><button class="ls-btn" type="button" onClick=${this.more} disabled=${status !== 'ready'}>Load more</button></div>`}
    </section>`;
  }

  render() {
    const { c, files, viewer, toast, theme } = this.state;
    return html`<a class="ls-skip" href="#main">Skip to content</a>
      <header class="app-header"><div class="header-inner">
        <a class="brand" href="./" onClick=${this.goHome} aria-label="Commoner, home">
          <img class="mark mark--light" src="./icons/logo-mark.svg" alt="" width="40" height="40" />
          <img class="mark mark--dark" src="./icons/logo-mark-inverse.svg" alt="" width="40" height="40" />
          <span>Commoner</span></a>
        <button class="ls-btn ls-btn--small theme" type="button" onClick=${this.toggleTheme}><${Icon} name=${theme === 'dark' ? 'sun' : 'moon'} small /> ${theme === 'dark' ? 'Light' : 'Dark'}</button>
      </div></header>
      <main id="main" class="page">${c ? this.renderGallery() : this.renderHome()}</main>
      <footer class="page foot">
        <p>Commoner is not endorsed by or affiliated with the Wikimedia Foundation. Photos and data come from Wikimedia Commons, and every file keeps its own licence, shown in the viewer.</p>
        <p><a href=${REPO_URL} target="_blank" rel="noopener noreferrer">Source</a> · AGPL-3.0-or-later · <a href=${LETSIMPL_URL} target="_blank" rel="noopener noreferrer">Part of letsimpl.fyi</a> · ${APP_VERSION}</p>
      </footer>
      ${viewer !== null && files[viewer] && html`<${Viewer} files=${files} index=${viewer} onIndex=${this.setViewerIndex} onClose=${this.closeViewer} onShare=${this.share} category=${c} />`}
      <div class="toast-wrap" role="status">${toast && html`<span class="ls-toast">${toast}</span>`}</div>`;
  }
}

const GRID_W = 250;

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

  render({ files, index, onClose, onShare, category }, { details }) {
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
          <button class="ls-btn ls-btn--small" type="button" aria-expanded=${details} onClick=${() => this.setState({ details: !details })}><${Icon} name="info" small /> Details</button>
          <button class="ls-btn ls-btn--small" type="button" onClick=${() => onShare(title, shareUrl(location.href, category, file.name))}><${Icon} name="share" small /> Share</button>
          <a class="ls-btn ls-btn--small ls-btn--outbound" href=${file.page} target="_blank" rel="noopener noreferrer">Commons page</a>
          <a class="ls-btn ls-btn--small ls-btn--outbound" href=${file.url} target="_blank" rel="noopener noreferrer">Original</a>
        </div>
        ${details && html`<dl class="details">
          <dt>Description</dt><dd>${file.description || 'None'}</dd>
          <dt>Author</dt><dd>${file.author || 'Unknown'}</dd>
          <dt>Licence</dt><dd>${file.license || 'See the Commons page'}</dd>
          <dt>Date</dt><dd>${file.date || 'Unknown'}</dd>
          <dt>Size</dt><dd>${file.width} × ${file.height}</dd>
        </dl>`}
      </div>
    </dialog>`;
  }
}
