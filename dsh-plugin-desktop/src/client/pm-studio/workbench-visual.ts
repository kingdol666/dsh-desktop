/** Scoped presentation for the Stable research desk and its conversation dock launcher. */

/** Append to the desktop-owned Studio stylesheet and remove with its existing effect. */
export const PM_WORKBENCH_VISUAL_CSS = `
.dshDesktopPmWbLauncher,
.dshDesktopPmWbDialog,
.dshDesktopPmWbDesk {
  color: var(--pm-text-1);
  font: 400 13px/20px var(--pm-font);
  font-variant-numeric: tabular-nums;
}
.dshDesktopPmWbLauncher {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-block: 6px;
}
.dshDesktopPmWbLauncher > span { font-size: 11px; color: var(--pm-text-2); }
.dshDesktopPmWbDialog {
  box-sizing: border-box;
  position: fixed;
  padding: 0;
  max-width: none;
  max-height: none;
  margin: auto;
  inline-size: min(1120px, calc(100% - 40px));
  block-size: min(820px, calc(100% - 40px));
  overflow: hidden;
  border: 1px solid var(--pm-border-strong);
  border-radius: 10px;
  background: var(--pm-surface);
  box-shadow: var(--pm-shadow-card);
}
.dshDesktopPmWbDialog::backdrop { background: color-mix(in srgb, var(--pm-text-1) 35%, transparent); }
body[data-pm-theme="dark"] .dshDesktopPmWbDialog::backdrop { background: color-mix(in srgb, var(--pm-surface) 68%, transparent); }
.dshDesktopPmWbDesk {
  box-sizing: border-box;
  container: pm-workbench / inline-size;
  display: flex;
  flex-direction: column;
  inline-size: 100%;
  block-size: 100%;
  min-inline-size: 0;
  min-block-size: 0;
  overflow: hidden;
  overflow-wrap: anywhere;
  background: var(--pm-surface);
}
.dshDesktopPmWbDesk *, .dshDesktopPmWbDesk *::before { box-sizing: border-box; }
.dshDesktopPmWbDesk :where(h1,h2,h3,h4,p,dl,dd,ol) { margin: 0; }
.dshDesktopPmWbDesk :where(code,pre,time) { font-family: var(--pm-mono); }
.dshDesktopPmWbDesk svg, .dshDesktopPmWbLauncher svg { flex: none; stroke-width: 1.75; }
.dshDesktopPmWbDesk :where(button,select,a,summary,[tabindex]):focus-visible,
.dshDesktopPmWbLauncher button:focus-visible {
  outline: 2px solid var(--pm-accent, var(--pm-brand));
  outline-offset: 2px;
}
.dshDesktopPmWbDesk :where(button,select), .dshDesktopPmWbLauncher button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  max-width: 100%;
  min-height: 30px;
  padding: 4px 9px;
  border: 1px solid var(--pm-border-strong);
  border-radius: 6px;
  background: var(--pm-surface);
  color: var(--pm-text-1);
  font: inherit;
  cursor: pointer;
}
.dshDesktopPmWbDesk :where(button,select):not(:disabled):hover,
.dshDesktopPmWbLauncher button:hover { background: var(--pm-surface-hover); }
.dshDesktopPmWbDesk select:disabled { cursor: default; color: var(--pm-text-2); }
.dshDesktopPmWbToolbar,
.dshDesktopPmWbContext,
.dshDesktopPmWbTabs {
  padding-inline: 16px;
  border-block-end: 1px solid var(--pm-border);
}
.dshDesktopPmWbToolbar,
.dshDesktopPmWbControls,
.dshDesktopPmWbContext,
.dshDesktopPmWbTabs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 10px;
}
.dshDesktopPmWbToolbar { justify-content: space-between; padding-block: 10px; }
.dshDesktopPmWbToolbar h2 { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 650; }
.dshDesktopPmWbControls { flex: 0 1 auto; min-inline-size: 0; }
.dshDesktopPmWbControls select { display: block; max-width: min(320px, 100%); text-overflow: ellipsis; }
.dshDesktopPmWbContext { padding-block: 6px; background: var(--pm-surface-subtle); color: var(--pm-text-2); }
.dshDesktopPmWbContext strong { color: var(--pm-text-1); }
.dshDesktopPmWbContext > span:not(.dshDesktopPmWbBadge) { font-size: 12px; }
.dshDesktopPmWbContext > span:not(.dshDesktopPmWbBadge) b { color: var(--pm-text-1); }
.dshDesktopPmWbTabs { padding-block: 7px; gap: 4px; }
.dshDesktopPmWbTabs button { border-color: transparent; background: transparent; color: var(--pm-text-2); font-size: 12px; }
.dshDesktopPmWbTabs button[aria-pressed="true"] { border-color: var(--pm-border-strong); background: var(--pm-brand-soft); color: var(--pm-brand-ink); font-weight: 650; }
.dshDesktopPmWbTabs button span { font-family: var(--pm-mono); }
.dshDesktopPmWbBody {
  flex: 1 1 auto;
  min-block-size: 0;
  overflow: auto;
  padding: clamp(12px, 2cqi, 24px);
  background: var(--pm-surface-subtle);
}
.dshDesktopPmWbBody:focus-visible { outline-offset: -2px; }
.dshDesktopPmWbOverview { display: grid; gap: 16px; }
.dshDesktopPmWbHero {
  display: grid;
  gap: 8px;
  padding: clamp(16px, 2.8cqi, 28px);
  border: 1px solid var(--pm-border-strong);
  border-inline-start: 3px solid var(--pm-accent, var(--pm-brand));
  background: var(--pm-surface);
}
.dshDesktopPmWbHero h1 { font-size: clamp(23px, 3cqi, 34px); line-height: 1.18; font-weight: 650; letter-spacing: -.025em; }
.dshDesktopPmWbHero > p:not(.dshDesktopPmWbEyebrow) { color: var(--pm-text-2); white-space: pre-wrap; }
.dshDesktopPmWbEyebrow { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; color: var(--pm-text-2); font-size: 11px; font-weight: 650; }
.dshDesktopPmWbMeta { display: flex; flex-wrap: wrap; gap: 8px 24px; padding-block-start: 12px; margin-block-start: 5px; border-block-start: 1px solid var(--pm-border); }
.dshDesktopPmWbMeta > div { display: grid; gap: 2px; }
.dshDesktopPmWbMeta dt, .dshDesktopPmWbRecords dt { color: var(--pm-text-2); font-size: 11px; }
.dshDesktopPmWbColumns { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 16px; align-items: start; }
.dshDesktopPmWbPanel { min-inline-size: 0; border: 1px solid var(--pm-border-strong); background: var(--pm-surface); }
.dshDesktopPmWbPanelHead { padding: 10px 13px; border-block-end: 1px solid var(--pm-border); }
.dshDesktopPmWbPanelHead h3, .dshDesktopPmWbNext h4 { font-size: 12px; line-height: 16px; font-weight: 650; }
.dshDesktopPmWbPanelHead p, .dshDesktopPmWbNext > p, .dshDesktopPmWbInspection > p { margin-block-start: 4px; color: var(--pm-text-2); }
.dshDesktopPmWbPanelBody { display: grid; gap: 12px; padding: 13px; }
.dshDesktopPmWbWorkflow { padding: 0 13px; list-style: none; }
.dshDesktopPmWbWorkflow li { display: grid; grid-template-columns: 30px minmax(0, 1fr); align-items: center; gap: 7px; padding-block: 4px; }
.dshDesktopPmWbWorkflow li + li { border-block-start: 1px solid var(--pm-border); }
.dshDesktopPmWbStep { color: var(--pm-text-2); font: 550 11px/16px var(--pm-mono); }
.dshDesktopPmWbWorkflow button { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 9px; width: 100%; padding: 7px 6px; border-color: transparent; text-align: start; }
.dshDesktopPmWbWorkflow button small { display: block; margin-block-start: 1px; font-size: 11px; color: var(--pm-text-2); }
.dshDesktopPmWbBadge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 1px 6px;
  border: 1px solid var(--pm-border-strong);
  border-radius: 6px;
  color: var(--pm-text-1);
  background: var(--pm-surface-subtle);
  font-size: 11px;
  line-height: 16px;
  font-weight: 600;
}
.dshDesktopPmWbBadge[data-tone] { border-inline-start-width: 3px; }
.dshDesktopPmWbBadge:is([data-tone="supports"],[data-tone="supported"],[data-tone="approved"]) { border-inline-start-color: var(--pm-evidence); }
.dshDesktopPmWbBadge:is([data-tone="refutes"],[data-tone="refuted"],[data-tone="disputed"],[data-tone="rejected"]) { border-inline-start-color: var(--pm-refute); }
.dshDesktopPmWbBadge:is([data-tone="candidate"],[data-tone="conditional"],[data-tone="under_test"]) { border-inline-start-color: var(--pm-candidate); }
.dshDesktopPmWbBadge[data-tone="established"] { border-inline-start-color: var(--pm-established); }
.dshDesktopPmWbBadge[data-tone="pending"] { border-inline-start-color: var(--pm-pending); }
.dshDesktopPmWbRecords > div { display: grid; grid-template-columns: minmax(0, .65fr) minmax(0, 1fr); gap: 8px; padding-block: 5px; border-block-start: 1px solid var(--pm-border); }
.dshDesktopPmWbNext { border-block-start: 1px solid var(--pm-border); padding-block-start: 10px; }
.dshDesktopPmWbActions { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-block-start: 8px; }
.dshDesktopPmWbActions button:first-of-type { background: var(--pm-brand-soft); color: var(--pm-brand-ink); }
.dshDesktopPmWbActions button:first-of-type:hover { background: var(--pm-surface-hover); }
.dshDesktopPmWbTable { width: 100%; table-layout: fixed; border-collapse: collapse; text-align: start; }
.dshDesktopPmWbTable th, .dshDesktopPmWbTable td { padding: 7px 8px; text-align: start; vertical-align: top; }
.dshDesktopPmWbTable thead { color: var(--pm-text-2); font-size: 11px; }
.dshDesktopPmWbTable thead th:first-child { width: 30%; }
.dshDesktopPmWbTable thead th:last-child { width: 21%; }
.dshDesktopPmWbTable tbody tr { border-block-start: 1px solid var(--pm-border); }
.dshDesktopPmWbTable tbody tr[data-selected="true"] { background: var(--pm-brand-soft); }
.dshDesktopPmWbTable button { padding-inline: 5px; font-size: 11px; overflow-wrap: anywhere; }
.dshDesktopPmWbTable button[aria-pressed="true"] { border-color: var(--pm-accent, var(--pm-brand)); color: var(--pm-brand-ink); }
.dshDesktopPmWbClaim { font-weight: 650; white-space: pre-wrap; }
.dshDesktopPmWbPanelBody a { display: inline-flex; align-items: center; gap: 5px; justify-self: start; color: var(--pm-brand-ink); text-decoration: underline; text-underline-offset: 3px; }
.dshDesktopPmWbPayload { padding: 8px; border: 1px solid var(--pm-border); background: var(--pm-surface-subtle); }
.dshDesktopPmWbPayload summary { cursor: pointer; }
.dshDesktopPmWbPayload pre { margin: 6px 0 0; white-space: pre-wrap; font-size: 12px; }
.dshDesktopPmWbList { display: grid; }
.dshDesktopPmWbList > article { padding: 12px; border: 1px solid var(--pm-border); background: var(--pm-surface); }
.dshDesktopPmWbList > article + article { border-block-start: 0; }
.dshDesktopPmWbList article header { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-block-end: 4px; }
.dshDesktopPmWbList article h3 { font-size: 13px; }
.dshDesktopPmWbList article p { white-space: pre-wrap; }
.dshDesktopPmWbMuted { color: var(--pm-text-2); }
.dshDesktopPmWbToolList { padding: 8px 13px; }
.dshDesktopPmWbToolList > div { display: grid; grid-template-columns: minmax(0, 132px) minmax(0, 1fr); gap: 8px; padding-block: 6px; }
.dshDesktopPmWbToolList > div + div { border-block-start: 1px solid var(--pm-border); }
.dshDesktopPmWbNotice, .dshDesktopPmWbLoading { margin-block-end: 12px; padding: 12px; border: 1px solid var(--pm-border); background: var(--pm-surface); }
.dshDesktopPmWbPanel > .dshDesktopPmWbNotice { margin: 0; border: 0; }
.dshDesktopPmWbNotice h3 { font-size: 13px; }
.dshDesktopPmWbNotice[role="alert"] { border-inline-start: 3px solid var(--pm-refute); }
.dshDesktopPmWbNotice button { margin-block-start: 8px; }
.dshDesktopPmWbLoading div { display: grid; gap: 6px; padding-block-start: 8px; }
.dshDesktopPmWbLoading i { height: 10px; width: 65%; border-radius: 6px; background: var(--pm-surface-hover); }
.dshDesktopPmWbLoading i:nth-child(2) { width: 52%; }
.dshDesktopPmWbLoading i:nth-child(3) { width: 59%; }
@media (max-width: 1024px) {
  .dshDesktopPmWbDialog { inline-size: calc(100% - 24px); block-size: calc(100% - 24px); }
}
@container pm-workbench (max-width: 760px) {
  .dshDesktopPmWbColumns { grid-template-columns: minmax(0, 1fr); gap: 12px; }
}
@container pm-workbench (max-width: 480px) {
  .dshDesktopPmWbToolbar, .dshDesktopPmWbContext, .dshDesktopPmWbTabs { padding-inline: 10px; }
  .dshDesktopPmWbControls { flex-basis: 100%; }
  .dshDesktopPmWbToolList > div { grid-template-columns: minmax(0, 1fr); gap: 2px; }
}
`
