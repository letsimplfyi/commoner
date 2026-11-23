import { h, Component } from '../vendor/preact.module.js';
import htm from '../vendor/htm.module.js';
import { fetchSuggestions } from './commons.js';
const html = htm.bind(h);

// A category box with live predictions: type, see matching Commons categories, arrow keys or tap to choose.
// onPick(name) when a prediction is chosen; onText(text) when the typed text is submitted as it is.
export class Typeahead extends Component {
  state = { value: '', items: [], active: -1, open: false };
  timer = 0; abort = null; blurTimer = 0;
  componentWillUnmount() { clearTimeout(this.timer); clearTimeout(this.blurTimer); this.abort?.abort(); }

  onInput = event => {
    const value = event.target.value;
    this.setState({ value, active: -1 });
    clearTimeout(this.timer); this.abort?.abort();
    const query = value.trim().replace(/^category:/i, '');
    if (query.length < 2 || /^https?:/i.test(query)) { this.setState({ items: [], open: false }); return; }
    this.timer = setTimeout(async () => {
      const ac = this.abort = new AbortController();
      try { const items = await fetchSuggestions(query, { signal: ac.signal }); if (!ac.signal.aborted) this.setState({ items, open: items.length > 0 }); }
      catch { /* predictions are a convenience; typing and submitting still work without them */ }
    }, 250);
  };
  onKey = event => {
    const { items, active, open } = this.state;
    if (event.key === 'ArrowDown' && items.length) { event.preventDefault(); this.setState({ open: true, active: Math.min(active + 1, items.length - 1) }); }
    else if (event.key === 'ArrowUp' && items.length) { event.preventDefault(); this.setState({ active: Math.max(active - 1, -1) }); }
    else if (event.key === 'Enter' && open && active >= 0) { event.preventDefault(); this.pick(items[active]); }
    else if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); this.setState({ open: false, active: -1 }); }
  };
  pick = name => { this.setState({ value: '', items: [], open: false, active: -1 }); this.props.onPick(name); };
  submit = event => {
    event.preventDefault();
    const { value, items, active, open } = this.state;
    if (open && active >= 0) return this.pick(items[active]);
    const text = value.trim();
    if (!text) return;
    if (this.props.onText(text) !== false) this.setState({ value: '', items: [], open: false, active: -1 });
  };
  onBlur = () => { clearTimeout(this.blurTimer); this.blurTimer = setTimeout(() => this.setState({ open: false }), 150); };

  render({ id, label, hideLabel, placeholder, submitLabel, error }, { value, items, active, open }) {
    const query = value.trim().replace(/^category:/i, '');
    const bold = name => (name.toLowerCase().startsWith(query.toLowerCase()) && query ? html`<b>${name.slice(0, query.length)}</b>${name.slice(query.length)}` : name);
    return html`<form class="typeahead" onSubmit=${this.submit} novalidate>
      <div class="ls-field">
        <label for=${id} class=${hideLabel ? 'ls-vh' : undefined}>${label}</label>
        <div class="field-row">
          <input id=${id} class="ls-input" type="text" role="combobox" aria-autocomplete="list" aria-expanded=${open && items.length > 0} aria-controls=${`${id}-list`}
            aria-activedescendant=${active >= 0 ? `${id}-opt-${active}` : undefined} aria-invalid=${error ? 'true' : 'false'} aria-describedby=${`${id}-error`} placeholder=${placeholder}
            inputmode="url" autocapitalize="off" autocomplete="off" spellcheck="false" value=${value} onInput=${this.onInput} onKeyDown=${this.onKey} onBlur=${this.onBlur} />
          <button class="ls-btn ls-btn--primary" type="submit">${submitLabel}</button>
        </div>
        ${error && html`<span class="ls-callout ls-callout--error" id=${`${id}-error`} role="alert"><span>${error}</span></span>`}
        ${open && items.length > 0 && html`<ul class="suggest" id=${`${id}-list`} role="listbox" aria-label="Suggested categories">
          ${items.map((name, i) => html`<li role="option" id=${`${id}-opt-${i}`} aria-selected=${i === active} class=${i === active ? 'active' : ''} onMouseDown=${e => e.preventDefault()} onClick=${() => this.pick(name)}>${bold(name)}</li>`)}
        </ul>`}
        <span class="ls-vh" role="status">${open && items.length ? `${items.length} suggestions` : ''}</span>
      </div>
    </form>`;
  }
}
