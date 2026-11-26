/** Literature page styles, owned by the desktop client effect. */

const STYLE_ID = 'pm-literature-styles'

const CSS = `
body[data-pm-studio] .pm-lit-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  min-height: 0;
  padding: 24px 28px;
  overflow: auto;
  color: var(--pm-text-1);
  background: var(--pm-surface);
}
body[data-pm-studio] .pm-lit-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
}
body[data-pm-studio] .pm-lit-title { margin: 0; font-size: 22px; line-height: 1.2; }
body[data-pm-studio] .pm-lit-subtitle { margin: 4px 0 0; color: var(--pm-text-2); font-size: 13px; }
body[data-pm-studio] .pm-lit-controls { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; }
body[data-pm-studio] .pm-lit-field { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--pm-text-3); }
body[data-pm-studio] .pm-lit-field select,
body[data-pm-studio] .pm-lit-search {
  min-width: 160px;
  padding: 7px 9px;
  border: 1px solid var(--pm-border);
  border-radius: 8px;
  background: var(--pm-surface);
  color: var(--pm-text-1);
  font-size: 13px;
}
body[data-pm-studio] .pm-lit-cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
body[data-pm-studio] .pm-lit-card {
  border: 1px solid var(--pm-border);
  border-radius: 12px;
  padding: 14px 16px;
  background: var(--pm-surface-subtle);
}
body[data-pm-studio] .pm-lit-card-label { color: var(--pm-text-3); font-size: 11px; letter-spacing: .04em; text-transform: uppercase; }
body[data-pm-studio] .pm-lit-card-value { margin-top: 6px; font-size: 26px; font-weight: 650; }
body[data-pm-studio] .pm-lit-card-note { margin-top: 4px; color: var(--pm-text-2); font-size: 11px; }
body[data-pm-studio] .pm-lit-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
body[data-pm-studio] .pm-lit-tabs { display: inline-flex; border: 1px solid var(--pm-border); border-radius: 9px; overflow: hidden; }
body[data-pm-studio] .pm-lit-tab {
  border: 0;
  padding: 7px 12px;
  background: transparent;
  color: var(--pm-text-2);
  font-size: 13px;
  cursor: pointer;
}
body[data-pm-studio] .pm-lit-tab[data-active='true'] { background: var(--pm-brand-soft); color: var(--pm-brand-ink); font-weight: 600; }
body[data-pm-studio] .pm-lit-search { flex: 1 1 220px; }
body[data-pm-studio] .pm-lit-button {
  border: 1px solid var(--pm-border-strong);
  border-radius: 8px;
  padding: 7px 11px;
  background: var(--pm-surface);
  color: var(--pm-text-1);
  font-size: 12px;
  cursor: pointer;
}
body[data-pm-studio] .pm-lit-button:hover { background: var(--pm-surface-hover); }
body[data-pm-studio] .pm-lit-table-wrap { border: 1px solid var(--pm-border); border-radius: 12px; overflow: auto; min-height: 180px; }
body[data-pm-studio] .pm-lit-table { width: 100%; border-collapse: collapse; font-size: 13px; }
body[data-pm-studio] .pm-lit-table th {
  position: sticky; top: 0;
  padding: 9px 12px;
  background: var(--pm-surface-subtle);
  color: var(--pm-text-3);
  font-size: 11px;
  font-weight: 600;
  text-align: left;
  border-bottom: 1px solid var(--pm-border);
}
body[data-pm-studio] .pm-lit-table td { padding: 9px 12px; border-bottom: 1px solid var(--pm-border); vertical-align: top; }
body[data-pm-studio] .pm-lit-table tr:last-child td { border-bottom: 0; }
body[data-pm-studio] .pm-lit-doc-title { font-weight: 550; }
body[data-pm-studio] .pm-lit-muted { color: var(--pm-text-3); font-size: 11px; }
body[data-pm-studio] .pm-lit-empty { padding: 28px; text-align: center; color: var(--pm-text-2); }
body[data-pm-studio] .pm-lit-error { padding: 10px 12px; border-radius: 9px; background: var(--pm-rose); color: #fff; font-size: 12px; }
body[data-pm-studio] .pm-lit-warning { padding: 9px 12px; border-radius: 9px; background: var(--pm-amber-soft); color: var(--pm-amber); font-size: 12px; }
body[data-pm-studio] .pm-lit-health { display: flex; gap: 14px; color: var(--pm-text-2); font-size: 12px; flex-wrap: wrap; }
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
