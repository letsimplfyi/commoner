// The upload screen (`?u=1`). Steps: sign in, pick photos, check them on the device (nothing leaves it), say what they are of,
// then confirm what will be public. Sign-in comes first because Commons' sign-in leaves the page, which would drop the photos.
import { h, Component } from '../vendor/preact.module.js';
import htm from '../vendor/htm.module.js';
import { Icon } from './icons.js';
import { Typeahead } from './typeahead.js';
import { analyse } from './measure.js';
import { judge, REASONS } from './rules.js';
import { pageUrl, displayTitle, fetchNearby } from './commons.js';
import { loginUrl, session, signOut, whoAmI } from './auth.js';
import { LICENCES, PRECISIONS, cleanProfile, makeFileName, buildPage, publicGps } from './wikitext.js';
const html = htm.bind(h);

// Only types Commons takes. Listing them (not "image/*") also makes iOS hand over JPEG instead of HEIC.
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/tiff';
const WORKERS = 3, PAGE = 100, REPAINT_MS = 250, PROFILE_KEY = 'commoner-profile';
const readProfile = () => { try { return cleanProfile(JSON.parse(localStorage.getItem(PROFILE_KEY))); } catch { return cleanProfile(null); } };
const writeProfile = profile => { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch { /* storage blocked */ } };

const staged = item => (item.mode === 'added' ? true : item.mode === 'removed' ? false : item.staged);
const reasonsOf = item => (item.mode === 'removed' ? ['removed'] : item.reasons);

function Notice({ kind = 'info', children }) {
  return html`<div class=${`ls-callout ls-callout--${kind}`} role=${kind === 'error' ? 'alert' : 'note'}><${Icon} name=${kind === 'error' ? 'alert' : 'info'} /><div>${children}</div></div>`;
}
function Why({ id }) {
  const r = REASONS[id];
  const link = r.page && html`<a href=${pageUrl(r.page)} target="_blank" rel="noopener noreferrer">${r.page}</a>`;
  return html`<li><b>${r.label}</b>${r.quote ? html`<details><summary>Why</summary><blockquote>${r.quote}</blockquote>${link}</details>` : link && html` ${link}`}</li>`;
}

export class Upload extends Component {
  state = { step: 'pick', view: 'ready', shown: PAGE, tick: 0, subject: '', category: '', near: [], profile: readProfile(), me: null, meError: '', signing: false };
  items = []; stopped = false; timer = 0; input = null; asking = false;

  // Dropping photos anywhere on the page works too; without a handler the browser would try to open the file instead.
  componentDidMount() {
    addEventListener('dragover', this.onDragOver); addEventListener('drop', this.onDrop);
    this.ensureMe();
  }
  componentDidUpdate() { this.ensureMe(); }
  componentWillUnmount() { this.stopped = true; clearTimeout(this.timer); removeEventListener('dragover', this.onDragOver); removeEventListener('drop', this.onDrop); }
  onDragOver = event => { if (event.dataTransfer?.types?.includes('Files')) event.preventDefault(); };
  onDrop = event => {
    if (!event.dataTransfer?.files?.length) return;
    event.preventDefault();
    if (session() && this.state.step === 'pick' && this.items.every(i => i.checked)) this.run([...event.dataTransfer.files]);
  };
  repaint = () => { if (!this.timer) this.timer = setTimeout(() => { this.timer = 0; this.refresh(); }, REPAINT_MS); };
  refresh = () => this.setState({ tick: this.state.tick + 1 });

  // ---- sign in
  // Who is signed in. Asked whenever a token appears, including right after Commons sends the user back.
  ensureMe() {
    if (!session() || this.state.me || this.state.meError || this.asking) return;
    this.asking = true;
    whoAmI().then(me => this.setState({ me, meError: '' })).catch(error => this.setState({ me: null, meError: error.message })).finally(() => { this.asking = false; });
  }
  signIn = async () => { this.setState({ signing: true }); try { location.href = await loginUrl('?u=1'); } catch { this.setState({ signing: false }); } };
  leave = () => { signOut(); this.setState({ me: null, meError: '', step: 'pick' }); this.props.onAuth?.(); };

  // ---- pick and check
  pick = event => {
    const files = [...event.target.files];
    event.target.value = '';
    if (files.length) this.run(files);
  };
  async run(files) {
    this.items = files.map((file, id) => ({ id, name: file.name, checked: false, mode: 'auto', staged: false, locked: false, reasons: [], preview: '' }));
    this.setState({ view: 'ready', shown: PAGE, step: 'pick' });
    let next = 0;
    const work = async () => {
      while (!this.stopped && next < files.length) {
        const i = next++;
        try { Object.assign(this.items[i], await analyse(files[i])); }
        catch { Object.assign(this.items[i], judge({ name: files[i].name, format: 'unreadable' })); }
        this.items[i].checked = true;
        this.repaint();
      }
    };
    await Promise.all(Array.from({ length: WORKERS }, work));
    clearTimeout(this.timer); this.timer = 0;
    if (!this.stopped) this.refresh();
    if (new URLSearchParams(location.search).has('debug')) this.debug(); // ?u=1&debug=1 prints what each photo measured, to tune the rules
  }
  debug() {
    const r = n => (n === undefined ? '' : Math.round(n * 1000) / 1000);
    console.table(this.items.map(i => ({ name: i.name, format: i.photo?.format, size: i.photo ? `${i.photo.width}x${i.photo.height}` : '', make: i.photo?.make, date: i.photo?.date, gps: !!i.photo?.gps, bright: r(i.stats?.bright), medium: r(i.stats?.medium), sharp: r(i.stats?.sharp), faces: i.stats?.faces, faceDetector: i.stats?.detector, verdict: i.staged ? 'ready' : i.reasons.join(', ') })));
  }
  setMode(item, mode) { item.mode = mode; this.refresh(); }
  ready() { return this.items.filter(i => i.checked && staged(i)); }

  // ---- what are these of
  toAbout = () => {
    this.setState({ step: 'about' });
    const first = this.ready().find(i => i.photo?.gps);
    if (first && !this.state.near.length) fetchNearby(first.photo.gps).then(near => this.setState({ near })).catch(() => { /* suggestions are a convenience */ });
  };
  choose = (subject, category) => this.setState({ subject, category });
  setProfile(change) { const profile = cleanProfile({ ...this.state.profile, ...change }); writeProfile(profile); this.setState({ profile }); }

  // What would be sent for one photo, from what the user decided. Also the base for the upload queue.
  plan(item) {
    const { subject, category, profile, me } = this.state;
    const gps = publicGps(item.photo?.gps, { precision: profile.precision });
    return {
      name: makeFileName({ subject, date: item.photo?.date, original: item.name }),
      text: buildPage({ subject, date: item.photo?.date, gps, author: me?.name, licence: profile.licence, categories: category ? [category] : [] }),
    };
  }

  // ---- views
  titlebar(title, onBack) {
    return html`<div class="titlebar">${onBack ? html`<button class="back" type="button" onClick=${onBack} aria-label="Back"><${Icon} name="back" /></button>` : html`<a class="back" href="./" onClick=${this.props.onBack} aria-label="Back to categories"><${Icon} name="back" /></a>`}<h1>${title}</h1></div>`;
  }

  renderSignIn() {
    const { signing } = this.state, { authError } = this.props;
    return html`<section>${this.titlebar('Upload')}
      ${authError && html`<${Notice} kind="error">${authError}<//>`}
      <div class="actions"><button class="ls-btn ls-btn--primary" type="button" disabled=${signing} onClick=${this.signIn}>Sign in with Wikimedia</button></div>
    </section>`;
  }

  renderPick() {
    const { view, shown, me, meError } = this.state;
    const done = this.items.filter(i => i.checked), busy = done.length < this.items.length;
    const ready = done.filter(staged), left = done.filter(i => !staged(i));
    const current = view === 'ready' ? ready : left, list = current.slice(0, shown);
    return html`<section>${this.titlebar('Upload')}
      <p class="meta">${me ? html`Signed in as ${me.name} · <button class="quiet" type="button" onClick=${this.leave}>Sign out</button>` : meError ? '' : 'Signing in'}</p>
      ${meError && html`<${Notice} kind="error">${meError}<//>`}
      ${me && (me.blocked || !me.canUpload) && html`<${Notice} kind="warning">${me.blocked ? 'This account is blocked on Commons.' : 'This account cannot upload yet.'}<//>`}
      <input type="file" multiple accept=${ACCEPT} hidden ref=${el => { this.input = el; }} onChange=${this.pick} />
      <div class="actions">
        <button class=${`ls-btn${ready.length && !busy ? '' : ' ls-btn--primary'}`} type="button" disabled=${busy} onClick=${() => this.input.click()}>Choose photos</button>
        ${ready.length > 0 && !busy && html`<button class="ls-btn ls-btn--primary" type="button" onClick=${this.toAbout}>Continue with ${ready.length}</button>`}
      </div>
      ${this.items.length > 0 && html`<p class="meta" role="status">${busy ? `Checking ${done.length} of ${this.items.length}` : `${ready.length} ready · ${left.length} not selected`}</p>`}
      ${done.length > 0 && html`<div class="segmented" role="group" aria-label="Show">
        <button type="button" class="ls-btn ls-btn--small" aria-pressed=${view === 'ready'} onClick=${() => this.setState({ view: 'ready', shown: PAGE })}>Ready ${ready.length}</button>
        <button type="button" class="ls-btn ls-btn--small" aria-pressed=${view === 'left'} onClick=${() => this.setState({ view: 'left', shown: PAGE })}>Not selected ${left.length}</button>
      </div>`}
      ${view === 'ready'
        ? html`<div class="grid">${list.map(item => html`<button type="button" class="tile" key=${item.id} onClick=${() => this.setMode(item, 'removed')} aria-label=${`Remove ${displayTitle(item.name)} from the selection`}>
            ${item.preview && html`<img src=${item.preview} alt="" loading="lazy" decoding="async" width="200" height="200" />`}</button>`)}</div>`
        : html`<ul class="skips">${list.map(item => html`<li key=${item.id}>
            <span class="skip-thumb">${item.preview && html`<img src=${item.preview} alt="" loading="lazy" decoding="async" width="64" height="64" />`}</span>
            <div class="skip-body"><b>${displayTitle(item.name)}</b>
              <ul class="why">${reasonsOf(item).map(id => html`<${Why} id=${id} />`)}</ul>
              ${!item.locked && html`<button class="ls-btn ls-btn--small" type="button" onClick=${() => this.setMode(item, 'added')}>${item.mode === 'removed' ? 'Add back' : 'Add anyway'}</button>`}</div></li>`)}</ul>`}
      ${current.length > list.length && html`<div class="more"><button class="ls-btn" type="button" onClick=${() => this.setState({ shown: shown + PAGE })}>More</button></div>`}
    </section>`;
  }

  renderAbout() {
    const { subject, category, near } = this.state;
    return html`<section>${this.titlebar('What are these of?', () => this.setState({ step: 'pick' }))}
      ${subject
        ? html`<p class="chosen"><b>${subject}</b> <button class="quiet" type="button" onClick=${() => this.choose('', '')}>Change</button></p>`
        : html`<${Typeahead} id="subject" label="Category or subject" placeholder="Search Commons categories" submitLabel="Use" onPick=${name => this.choose(name, name)} onText=${text => { this.choose(text, ''); return true; }} />`}
      ${!subject && near.length > 0 && html`<h2>Near where you were</h2><ul class="ls-tags">${near.map(name => html`<li><button class="ls-tag" type="button" onClick=${() => this.choose(name, name)}>${name}</button></li>`)}</ul>`}
      ${subject && !category && html`<${Notice}>No category chosen, so Commons volunteers will sort these. A category helps people find them.<//>`}
      <div class="actions"><button class="ls-btn ls-btn--primary" type="button" disabled=${!subject} onClick=${() => this.setState({ step: 'confirm' })}>Continue</button></div>
    </section>`;
  }

  renderConfirm() {
    const { subject, category, profile, me } = this.state, ready = this.ready(), first = ready[0];
    const located = ready.filter(i => i.photo?.gps).length, example = first && this.plan(first);
    return html`<section>${this.titlebar('Check', () => this.setState({ step: 'about' }))}
      <dl class="details">
        <dt>Photos</dt><dd>${ready.length}</dd>
        <dt>Of</dt><dd>${subject}</dd>
        <dt>Category</dt><dd>${category || 'None'}</dd>
        <dt>Author</dt><dd>${me?.name || ''}</dd>
      </dl>
      <div class="ls-field"><label for="licence">Licence</label>
        <select id="licence" class="ls-select" value=${profile.licence} onChange=${e => this.setProfile({ licence: e.target.value })}>${Object.entries(LICENCES).map(([id, l]) => html`<option value=${id} selected=${profile.licence === id}>${l.label}</option>`)}</select></div>
      ${located > 0 && html`<div class="ls-field"><label for="precision">Location of ${located} ${located === 1 ? 'photo' : 'photos'}</label>
        <select id="precision" class="ls-select" value=${profile.precision} onChange=${e => this.setProfile({ precision: e.target.value })}>${Object.entries(PRECISIONS).map(([id, label]) => html`<option value=${id} selected=${profile.precision === id}>${label}</option>`)}</select></div>`}
      ${example && html`<details class="example"><summary>Example</summary><p><b>${example.name}</b></p><pre class="wikitext">${example.text}</pre></details>`}
    </section>`;
  }

  render() {
    if (!session()) return this.renderSignIn();
    const { step } = this.state;
    return step === 'about' ? this.renderAbout() : step === 'confirm' ? this.renderConfirm() : this.renderPick();
  }
}
