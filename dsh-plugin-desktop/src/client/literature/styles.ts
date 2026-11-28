/** Namespaced Literature workspace styles, owned by the desktop client effect. */

const STYLE_ID = 'pm-literature-styles'

const CSS = `
body[data-pm-studio] .pm-lit-page {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 18px;
  height: 100%;
  min-height: 0;
  padding: 24px clamp(16px, 3vw, 36px) 28px;
  overflow: auto;
  color: var(--pm-text-1);
  background: var(--pm-surface);
  font-family: var(--pm-font);
  font-size: 13px;
  line-height: 1.55;
}
body[data-pm-studio] .pm-lit-page * { box-sizing: border-box; }
body[data-pm-studio] .pm-lit-page button,
body[data-pm-studio] .pm-lit-page input,
body[data-pm-studio] .pm-lit-page select { font: inherit; }
body[data-pm-studio] .pm-lit-page :is(button, input, select):focus-visible {
  outline: 2px solid var(--pm-brand);
  outline-offset: 2px;
}
body[data-pm-studio] .pm-lit-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
}
body[data-pm-studio] .pm-lit-heading { min-width: 0; }
body[data-pm-studio] .pm-lit-eyebrow,
body[data-pm-studio] .pm-lit-section-kicker {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0 0 5px;
  color: var(--pm-brand-ink);
  font-family: var(--pm-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .04em;
}
body[data-pm-studio] .pm-lit-eyebrow svg { flex: none; color: var(--pm-brand); }
body[data-pm-studio] .pm-lit-title {
  margin: 0;
  font-size: clamp(24px, 2.2vw, 30px);
  font-weight: 650;
  letter-spacing: -.035em;
  line-height: 1.2;
}
body[data-pm-studio] .pm-lit-subtitle {
  max-width: 720px;
  margin: 7px 0 0;
  color: var(--pm-text-2);
  font-size: 13px;
}
body[data-pm-studio] .pm-lit-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 36px;
  padding: 6px 11px;
  border: 1px solid var(--pm-border-strong);
  border-radius: 6px;
  background: var(--pm-surface);
  color: var(--pm-text-1);
  font-size: 12px;
  font-weight: 550;
  line-height: 1.4;
  cursor: pointer;
}
body[data-pm-studio] .pm-lit-button:hover:not(:disabled) { background: var(--pm-surface-hover); }
body[data-pm-studio] .pm-lit-button:disabled { cursor: default; opacity: .55; }
body[data-pm-studio] .pm-lit-scan-button { flex: none; }
body[data-pm-studio] .pm-lit-scope {
  display: grid;
  grid-template-columns: minmax(190px, .72fr) minmax(320px, 1.28fr);
  gap: 12px 24px;
  padding: 14px 16px;
  border: 1px solid var(--pm-border);
  border-left: 3px solid var(--pm-brand);
  border-radius: 8px;
  background: var(--pm-surface-subtle);
}
body[data-pm-studio] .pm-lit-scope-heading {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
}
body[data-pm-studio] .pm-lit-scope-icon,
body[data-pm-studio] .pm-lit-state-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--pm-border);
  border-radius: 6px;
  background: var(--pm-brand-soft);
  color: var(--pm-brand-ink);
}
body[data-pm-studio] .pm-lit-scope-heading h2,
body[data-pm-studio] .pm-lit-inventory h2,
body[data-pm-studio] .pm-lit-collection-heading h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
}
body[data-pm-studio] .pm-lit-scope-heading p {
  max-width: 390px;
  margin: 4px 0 0;
  color: var(--pm-text-2);
  font-size: 12px;
  line-height: 18px;
}
body[data-pm-studio] .pm-lit-scope-controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  min-width: 0;
}
body[data-pm-studio] .pm-lit-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  color: var(--pm-text-2);
  font-size: 11px;
  font-weight: 550;
}
body[data-pm-studio] .pm-lit-field select,
body[data-pm-studio] .pm-lit-scope-value {
  width: 100%;
  min-width: 0;
  min-height: 36px;
  overflow: hidden;
  padding: 7px 10px;
  border: 1px solid var(--pm-border-strong);
  border-radius: 6px;
  background: var(--pm-surface);
  color: var(--pm-text-1);
  font-size: 13px;
  font-weight: 450;
  text-overflow: ellipsis;
  white-space: nowrap;
}
body[data-pm-studio] .pm-lit-field select:disabled { opacity: .7; }
body[data-pm-studio] .pm-lit-scope-value { display: flex; align-items: center; }
body[data-pm-studio] .pm-lit-scope-detail {
  grid-column: 1 / -1;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px 20px;
  padding-top: 10px;
  border-top: 1px solid var(--pm-border);
}
body[data-pm-studio] .pm-lit-domain-description {
  min-width: 120px;
  margin: 0;
  color: var(--pm-text-2);
  font-size: 12px;
}
body[data-pm-studio] .pm-lit-scope-tags {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 5px 12px;
  color: var(--pm-text-1);
  font-size: 11px;
  text-align: right;
}
body[data-pm-studio] .pm-lit-scope-tags span { display: inline-flex; flex-wrap: wrap; gap: 4px; }
body[data-pm-studio] .pm-lit-scope-tags b { color: var(--pm-text-2); font-weight: 550; }
body[data-pm-studio] .pm-lit-inventory {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 14px;
  padding: 10px 14px;
  border-block: 1px solid var(--pm-border);
}
body[data-pm-studio] .pm-lit-inventory h2 {
  color: var(--pm-text-2);
  font-size: 11px;
  font-weight: 600;
}
body[data-pm-studio] .pm-lit-inventory dl {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
}
body[data-pm-studio] .pm-lit-inventory dl > div {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 3px 8px;
  min-width: 0;
}
body[data-pm-studio] .pm-lit-inventory dt { overflow: hidden; color: var(--pm-text-2); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
body[data-pm-studio] .pm-lit-inventory dd { margin: 0; color: var(--pm-text-1); font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }
body[data-pm-studio] .pm-lit-inventory dl > div > span { grid-column: 1 / -1; color: var(--pm-text-2); font-size: 11px; }
body[data-pm-studio] .pm-lit-collection {
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  min-height: 250px;
  border: 1px solid var(--pm-border);
  border-radius: 8px;
  background: var(--pm-surface);
}
body[data-pm-studio] .pm-lit-collection-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 13px 16px 10px;
}
body[data-pm-studio] .pm-lit-section-kicker { margin: 0 0 3px; font-size: 11px; }
body[data-pm-studio] .pm-lit-collection-heading h2 { font-size: 16px; }
body[data-pm-studio] .pm-lit-health {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px 16px;
  padding: 0 16px 11px;
  color: var(--pm-text-2);
  font-size: 11px;
}
body[data-pm-studio] .pm-lit-health span { display: inline-flex; gap: 5px; align-items: baseline; }
body[data-pm-studio] .pm-lit-health b { color: var(--pm-text-1); font-weight: 550; }
body[data-pm-studio] .pm-lit-collection-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 12px;
  border-block: 1px solid var(--pm-border);
  background: var(--pm-surface-subtle);
}
body[data-pm-studio] .pm-lit-tabs {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex: none;
  padding: 3px;
  border: 1px solid var(--pm-border);
  border-radius: 6px;
  background: var(--pm-surface);
}
body[data-pm-studio] .pm-lit-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 32px;
  padding: 5px 9px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--pm-text-2);
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
}
body[data-pm-studio] .pm-lit-tab:hover { color: var(--pm-text-1); }
body[data-pm-studio] .pm-lit-tab[aria-selected='true'] {
  border-color: var(--pm-border);
  background: var(--pm-brand-soft);
  color: var(--pm-brand-ink);
  font-weight: 600;
}
body[data-pm-studio] .pm-lit-tab span {
  color: inherit;
  font-family: var(--pm-mono);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
body[data-pm-studio] .pm-lit-filters {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
}
body[data-pm-studio] .pm-lit-search,
body[data-pm-studio] .pm-lit-kind-filter {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 34px;
  padding: 5px 9px;
  border: 1px solid var(--pm-border-strong);
  border-radius: 6px;
  background: var(--pm-surface);
  color: var(--pm-text-2);
}
body[data-pm-studio] .pm-lit-search { flex: 1 1 260px; max-width: 360px; }
body[data-pm-studio] .pm-lit-search svg,
body[data-pm-studio] .pm-lit-kind-filter svg { flex: none; }
body[data-pm-studio] .pm-lit-search input {
  width: 100%;
  min-width: 80px;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--pm-text-1);
  font-size: 12px;
}
body[data-pm-studio] .pm-lit-search input::placeholder { color: var(--pm-text-2); opacity: 1; }
body[data-pm-studio] .pm-lit-search:focus-within,
body[data-pm-studio] .pm-lit-kind-filter:focus-within { border-color: var(--pm-brand); }
body[data-pm-studio] .pm-lit-kind-filter { flex: none; }
body[data-pm-studio] .pm-lit-kind-filter select {
  max-width: 150px;
  min-width: 80px;
  padding: 0 16px 0 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--pm-text-1);
  font-size: 12px;
}
body[data-pm-studio] .pm-lit-results-count {
  display: flex;
  justify-content: space-between;
  min-height: 34px;
  padding: 8px 14px 6px;
  color: var(--pm-text-2);
  font-size: 11px;
}
body[data-pm-studio] .pm-lit-table-region { min-height: 150px; outline: 0; }
body[data-pm-studio] .pm-lit-table-region:focus-visible { outline: 2px solid var(--pm-brand); outline-offset: -2px; }
body[data-pm-studio] .pm-lit-table-wrap { min-width: 0; overflow: auto; }
body[data-pm-studio] .pm-lit-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  line-height: 18px;
  text-align: left;
}
body[data-pm-studio] .pm-lit-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 8px 12px;
  border-bottom: 1px solid var(--pm-border);
  background: var(--pm-surface-subtle);
  color: var(--pm-text-2);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
body[data-pm-studio] .pm-lit-table td {
  max-width: 300px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--pm-border);
  color: var(--pm-text-1);
  vertical-align: middle;
}
body[data-pm-studio] .pm-lit-table tbody tr:hover { background: var(--pm-surface-hover); }
body[data-pm-studio] .pm-lit-table tbody tr:last-child td { border-bottom: 0; }
body[data-pm-studio] .pm-lit-doc-title { overflow-wrap: anywhere; font-size: 13px; font-weight: 550; }
body[data-pm-studio] .pm-lit-muted {
  display: block;
  max-width: 440px;
  margin-top: 3px;
  overflow: hidden;
  color: var(--pm-text-2);
  font-family: var(--pm-mono);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
body[data-pm-studio] .pm-lit-doi { overflow-wrap: anywhere; font-family: var(--pm-mono); font-size: 11px; }
body[data-pm-studio] .pm-lit-number { font-variant-numeric: tabular-nums; white-space: nowrap; }
body[data-pm-studio] .pm-lit-kind {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 2px 7px;
  border: 1px solid var(--pm-border);
  border-radius: 4px;
  background: var(--pm-surface-subtle);
  color: var(--pm-text-2);
  font-size: 11px;
  white-space: nowrap;
}
body[data-pm-studio] .pm-lit-open { min-height: 30px; padding: 4px 8px; white-space: nowrap; }
body[data-pm-studio] .pm-lit-empty-state {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 26px 20px;
  color: var(--pm-text-1);
  text-align: center;
}
body[data-pm-studio] .pm-lit-empty-state h2,
body[data-pm-studio] .pm-lit-empty-state h3 { margin: 0; font-size: 14px; font-weight: 600; }
body[data-pm-studio] .pm-lit-empty-state p { max-width: 560px; margin: 0; color: var(--pm-text-2); font-size: 12px; }
body[data-pm-studio] .pm-lit-state-icon { width: 36px; height: 36px; margin-bottom: 2px; }
body[data-pm-studio] .pm-lit-collection-empty { min-height: 140px; }
body[data-pm-studio] .pm-lit-text-button {
  min-height: 32px;
  padding: 4px 9px;
  border: 1px solid var(--pm-border-strong);
  border-radius: 6px;
  background: var(--pm-surface);
  color: var(--pm-brand-ink);
  font-size: 12px;
  cursor: pointer;
}
body[data-pm-studio] .pm-lit-text-button:hover { background: var(--pm-brand-soft); }
body[data-pm-studio] .pm-lit-error,
body[data-pm-studio] .pm-lit-warning,
body[data-pm-studio] .pm-lit-orphan-result {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--pm-border);
  border-radius: 6px;
  font-size: 12px;
}
body[data-pm-studio] .pm-lit-error {
  border-color: color-mix(in srgb, var(--pm-refute) 35%, var(--pm-border));
  background: color-mix(in srgb, var(--pm-refute) 8%, var(--pm-surface));
}
body[data-pm-studio] .pm-lit-error-copy { display: grid; gap: 3px; min-width: 0; }
body[data-pm-studio] .pm-lit-error-code { color: var(--pm-refute); font-family: var(--pm-mono); font-size: 11px; }
body[data-pm-studio] .pm-lit-error-copy strong { font-weight: 600; }
body[data-pm-studio] .pm-lit-error-copy p,
body[data-pm-studio] .pm-lit-error-copy > span:last-child { margin: 0; color: var(--pm-text-2); overflow-wrap: anywhere; }
body[data-pm-studio] .pm-lit-warning {
  justify-content: flex-start;
  border-color: color-mix(in srgb, var(--pm-candidate) 35%, var(--pm-border));
  background: color-mix(in srgb, var(--pm-candidate) 8%, var(--pm-surface));
}
body[data-pm-studio] .pm-lit-orphan-result { display: grid; justify-content: stretch; gap: 8px; }
body[data-pm-studio] .pm-lit-orphan-summary { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; }
body[data-pm-studio] .pm-lit-orphan-summary svg { color: var(--pm-text-2); }
body[data-pm-studio] .pm-lit-orphan-summary strong { font-weight: 600; }
body[data-pm-studio] .pm-lit-orphan-hint { margin-left: auto; color: var(--pm-text-2); font-size: 11px; }
body[data-pm-studio] .pm-lit-orphan-paths { display: grid; gap: 4px; margin: 0; padding: 8px 0 0 22px; border-top: 1px solid var(--pm-border); color: var(--pm-text-2); font-family: var(--pm-mono); font-size: 11px; overflow-wrap: anywhere; }
body[data-pm-studio] .pm-lit-loading { display: grid; gap: 0; padding: 0 12px 10px; }
body[data-pm-studio] .pm-lit-skeleton-head { height: 28px; border-bottom: 1px solid var(--pm-border); background: var(--pm-surface-subtle); }
body[data-pm-studio] .pm-lit-skeleton-row { display: grid; grid-template-columns: 2fr 1fr .6fr; gap: 18px; align-items: center; height: 48px; border-bottom: 1px solid var(--pm-border); }
body[data-pm-studio] .pm-lit-skeleton-row span { width: min(100%, 190px); height: 10px; border-radius: 4px; background: var(--pm-surface-subtle); }
body[data-pm-studio] .pm-lit-skeleton-row span:first-child { width: min(100%, 300px); }
body[data-pm-studio] .pm-lit-orphan-note {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--pm-text-2);
  font-size: 11px;
}
body[data-pm-studio] .pm-lit-orphan-note svg { flex: none; }
body[data-pm-studio] .pm-lit-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  clip-path: inset(50%);
  white-space: nowrap;
}
@media (max-width: 900px) {
  body[data-pm-studio] .pm-lit-scope { grid-template-columns: minmax(160px, .75fr) minmax(260px, 1.25fr); gap: 12px 16px; }
  body[data-pm-studio] .pm-lit-health { gap: 5px 10px; }
}
@media (max-width: 700px) {
  body[data-pm-studio] .pm-lit-page { gap: 14px; padding: 18px 14px 22px; }
  body[data-pm-studio] .pm-lit-header { align-items: flex-start; flex-direction: column; gap: 10px; }
  body[data-pm-studio] .pm-lit-scope { grid-template-columns: minmax(0, 1fr); }
  body[data-pm-studio] .pm-lit-scope-detail { flex-direction: column; }
  body[data-pm-studio] .pm-lit-scope-tags { justify-content: flex-start; text-align: left; }
  body[data-pm-studio] .pm-lit-inventory { grid-template-columns: minmax(0, 1fr); gap: 7px; }
  body[data-pm-studio] .pm-lit-inventory dl { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  body[data-pm-studio] .pm-lit-collection-toolbar { align-items: stretch; flex-direction: column; }
  body[data-pm-studio] .pm-lit-tabs { align-self: flex-start; max-width: 100%; }
  body[data-pm-studio] .pm-lit-tab { white-space: normal; }
  body[data-pm-studio] .pm-lit-filters { justify-content: stretch; }
  body[data-pm-studio] .pm-lit-search { max-width: none; }
  body[data-pm-studio] .pm-lit-collection-heading { padding-inline: 12px; }
  body[data-pm-studio] .pm-lit-table,
  body[data-pm-studio] .pm-lit-table tbody,
  body[data-pm-studio] .pm-lit-table tr,
  body[data-pm-studio] .pm-lit-table td { display: block; width: 100%; }
  body[data-pm-studio] .pm-lit-table thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  body[data-pm-studio] .pm-lit-table tbody { display: grid; gap: 8px; padding: 0 8px 8px; }
  body[data-pm-studio] .pm-lit-table tbody tr { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border: 1px solid var(--pm-border); border-radius: 6px; }
  body[data-pm-studio] .pm-lit-table td { display: flex; flex-direction: column; gap: 3px; max-width: none; padding: 8px 10px; border: 0; }
  body[data-pm-studio] .pm-lit-table td::before { content: attr(data-label); color: var(--pm-text-2); font-size: 11px; }
  body[data-pm-studio] .pm-lit-table td:first-child,
  body[data-pm-studio] .pm-lit-table td:last-child { grid-column: 1 / -1; }
  body[data-pm-studio] .pm-lit-table td:first-child { padding-top: 10px; }
  body[data-pm-studio] .pm-lit-table td:last-child { align-items: flex-start; padding-bottom: 10px; }
  body[data-pm-studio] .pm-lit-table .pm-lit-muted { max-width: 100%; }
  body[data-pm-studio] .pm-lit-results-count { min-height: 30px; }
}
@media (max-width: 440px) {
  body[data-pm-studio] .pm-lit-scope-controls { grid-template-columns: minmax(0, 1fr); }
  body[data-pm-studio] .pm-lit-filters { align-items: stretch; flex-direction: column; }
  body[data-pm-studio] .pm-lit-kind-filter select { max-width: none; }
  body[data-pm-studio] .pm-lit-orphan-hint { flex-basis: 100%; margin-left: 23px; }
}
@media (prefers-reduced-motion: reduce) {
  body[data-pm-studio] .pm-lit-page * { scroll-behavior: auto !important; }
}
`

/** Install the Literature stylesheet once; returns an effect disposer. */
export function installLiteratureStyles(): () => void {
  if (typeof document === 'undefined') return () => {}
  if (document.getElementById(STYLE_ID) !== null) return () => {}
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.dataset.plugin = 'dsh-plugin-desktop'
  style.dataset.pluginCss = 'dsh-plugin-desktop/literature'
  style.textContent = CSS
  document.head.appendChild(style)
  return () => { style.remove() }
}
