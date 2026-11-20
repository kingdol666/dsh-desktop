/**
 * PolyMechanism Studio design layer.
 *
 * Upstream paints its own CSS-module components; this sheet adds the product
 * tokens and restyles only the surfaces named by the design handoff
 * (`docs/polymechanism/design/`). Selectors avoid upstream hash prefixes by
 * matching stable class suffixes and data attributes, so an upstream rebuild
 * does not silently drop the theme. Every rule is scoped to a Desktop shell
 * mode, which also keeps an ordinary browser preview untouched.
 */

const STYLE_ID = 'pm-studio-design-styles'

const CSS = `
body[data-pm-studio] {
  --pm-brand: #4f6bff;
  --pm-brand-strong: #3d53d9;
  --pm-brand-soft: #edf0ff;
  --pm-brand-ink: #2f3fa8;
  --pm-brand-glow: rgba(79, 107, 255, 0.13);

  --pm-surface: #ffffff;
  --pm-surface-subtle: #f2f4f8;
  --pm-surface-hover: #eef1f7;
  --pm-text-1: #12151c;
  --pm-text-2: #596174;
  --pm-text-3: #667085;
  --pm-border: #e5e8ef;
  --pm-border-strong: #d7dce7;

  --pm-teal: #0e9f87;
  --pm-teal-soft: #e5f6f1;
  --pm-amber: #b07610;
  --pm-amber-soft: #fbf2df;
  --pm-rose: #c94b5b;
  --pm-violet: #7a66e0;

  /* Semantic layer (docs 07 §2.1). Literals live only in this token block;
     components consume the named token, never a colour. */
  --pm-evidence: var(--pm-teal);
  --pm-refute: var(--pm-rose);
  --pm-candidate: var(--pm-amber);
  --pm-established: var(--pm-brand);
  --pm-pending: var(--pm-violet);
  --pm-series-1: #4c8dff;
  --pm-series-2: #23b58a;
  --pm-series-3: #e8833a;
  --pm-series-4: #b968e0;
  --pm-series-5: #e0c341;
  --pm-series-6: #3fb6d8;
  --pm-series-7: #d95f6e;
  --pm-series-8: #6fbf5a;
  --pm-series-9: #8a8fe8;
  --pm-series-10: #b08968;

  --pm-shadow-card: 0 1px 2px rgba(18, 21, 28, 0.04), 0 10px 28px rgba(18, 21, 28, 0.07);
  --pm-font: "Inter", "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  --pm-mono: "JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace;
}

body[data-pm-studio][data-pm-theme="dark"] {
  --pm-brand: #6e86ff;
  --pm-brand-strong: #8b9dff;
  --pm-brand-soft: #171f3d;
  --pm-brand-ink: #b7c2ff;
  --pm-brand-glow: rgba(110, 134, 255, 0.16);

  --pm-surface: #121821;
  --pm-surface-subtle: #141a24;
  --pm-surface-hover: #182030;
  --pm-text-1: #e9edf6;
  --pm-text-2: #9aa4b8;
  --pm-text-3: #7d889d;
  --pm-border: #1d2431;
  --pm-border-strong: #2a3242;

  --pm-teal: #2cc3a8;
  --pm-teal-soft: #0f2b26;
  --pm-amber: #e0ac4d;
  --pm-amber-soft: #2c2314;
  --pm-rose: #ef7180;
  --pm-violet: #a392ff;

  --pm-shadow-card: 0 1px 2px rgba(0, 0, 0, 0.25), 0 12px 32px rgba(0, 0, 0, 0.35);
}

/* ---------- Product wordmark ---------- */

body[data-pm-studio] .pm-wordmark {
  display: inline-flex;
  align-items: baseline;
  gap: 7px;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  font-family: var(--pm-font);
}

body[data-pm-studio] .pm-wordmark-name {
  overflow: hidden;
  color: var(--pm-text-1);
  font-size: 13px;
  font-weight: 650;
  letter-spacing: -0.015em;
  text-overflow: ellipsis;
}

body[data-pm-studio] .pm-wordmark-tag {
  flex: none;
  padding: 1px 4px 0;
  border: 1px solid color-mix(in srgb, var(--pm-brand) 32%, transparent);
  border-radius: 4px;
  background: var(--pm-brand-soft);
  color: var(--pm-brand-ink);
  font-family: var(--pm-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  line-height: 1.35;
}

/* ---------- Blank-home lockup ---------- */

body[data-pm-studio] [class*="_composerHero"] [class*="_titleGroup"] {
  display: none !important;
}

body[data-pm-studio] [class*="_composerHero"] [class*="_headline"] {
  display: block;
  position: relative;
  font-size: inherit;
  line-height: inherit;
}

body[data-pm-studio] [class*="_composerHero"] [class*="_headline"]::before {
  content: "";
  position: absolute;
  inset: -120px -220px -40px;
  z-index: -1;
  border-radius: 50%;
  background: radial-gradient(closest-side, var(--pm-brand-glow), transparent 72%);
  pointer-events: none;
}

body[data-pm-studio] [class*="_composerHero"] [class*="_fishHitbox"] {
  display: block;
  flex: 1 1 100%;
  width: 100%;
}

body[data-pm-studio] .pm-hero-lockup {
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  width: 100%;
  font-family: var(--pm-font);
}

/* The handoff's single molecular polyline; static, decorative, and behind the
   copy so it never competes with the composer. */
body[data-pm-studio] .pm-hero-lattice {
  position: absolute;
  top: -90px;
  right: -240px;
  z-index: -1;
  width: 520px;
  height: 390px;
  color: var(--pm-border-strong);
  opacity: 0.38;
  pointer-events: none;
}

body[data-pm-studio] .pm-hero-lattice svg {
  width: 100%;
  height: 100%;
}

body[data-pm-studio] .pm-hero-kicker {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  color: var(--pm-text-3);
  font-family: var(--pm-mono);
  font-size: 11px;
  font-weight: 550;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

body[data-pm-studio] .pm-hero-kicker > svg {
  flex: none;
  color: var(--pm-brand);
}

body[data-pm-studio] .pm-hero-rule {
  width: 22px;
  height: 1px;
  background: var(--pm-border-strong);
}

body[data-pm-studio] .pm-hero-protocol {
  padding: 2px 7px;
  border: 1px solid color-mix(in srgb, var(--pm-brand) 24%, transparent);
  border-radius: 999px;
  background: var(--pm-brand-soft);
  color: var(--pm-brand-ink);
  letter-spacing: 0.12em;
}

body[data-pm-studio] .pm-hero-title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  column-gap: 12px;
  row-gap: 8px;
  margin-top: 13px;
  min-width: 0;
}

body[data-pm-studio] .pm-hero-title-row > svg {
  flex: none;
  color: var(--pm-brand);
}

body[data-pm-studio] .pm-hero-title {
  margin: 0;
  color: var(--pm-text-1);
  font-family: var(--pm-font);
  font-size: clamp(28px, 2.7vw, 40px);
  font-weight: 640;
  letter-spacing: -0.028em;
  line-height: 1.16;
  text-align: center;
  text-wrap: balance;
}

body[data-pm-studio] .pm-hero-accent {
  color: var(--pm-brand);
}

body[data-pm-studio] .pm-hero-sub {
  margin-top: 11px;
  color: var(--pm-text-2);
  font-size: 13.5px;
  line-height: 1.6;
  text-align: center;
  text-wrap: pretty;
}

body[data-pm-studio] .pm-hero-sep {
  margin: 0 7px;
  color: var(--pm-text-3);
}

/* ---------- Research console (blank home only) ---------- */

body[data-pm-studio] .pm-console {
  display: none;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  margin: 2px 0 0;
  font-family: var(--pm-font);
}

/* The conversation root publishes its own phase; the console follows it rather
   than re-deriving "blank" from session summaries that lag the open state. */
body[data-pm-studio] [data-phase="hero"] .pm-console {
  display: flex;
}

body[data-pm-studio] .pm-console-head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

body[data-pm-studio] .pm-console-label,
body[data-pm-studio] .pm-pulse-label {
  flex: none;
  color: var(--pm-text-3);
  font-family: var(--pm-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
}

body[data-pm-studio] .pm-experts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

body[data-pm-studio] .pm-expert {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 9px 0 8px;
  border: 1px solid var(--pm-border);
  border-radius: 999px;
  background: var(--pm-surface);
  color: var(--pm-text-2);
  font: inherit;
  font-size: 11.5px;
  white-space: nowrap;
  cursor: pointer;
  transition: border-color 140ms ease, background-color 140ms ease, color 140ms ease, transform 140ms ease;
}

body[data-pm-studio] .pm-expert:hover {
  border-color: var(--pm-border-strong);
  color: var(--pm-text-1);
  transform: translateY(-1px);
}

body[data-pm-studio] .pm-expert[aria-pressed="true"] {
  border-color: color-mix(in srgb, var(--pm-brand) 46%, var(--pm-border));
  background: var(--pm-brand-soft);
  color: var(--pm-brand-ink);
  font-weight: 600;
}

body[data-pm-studio] .pm-expert[aria-pressed="true"] .pm-console-glyph {
  color: var(--pm-brand);
}

body[data-pm-studio] .pm-expert[aria-busy="true"] {
  opacity: 0.6;
  cursor: progress;
}

body[data-pm-studio] .pm-console-glyph {
  flex: none;
  color: var(--pm-text-3);
}

body[data-pm-studio] .pm-console-ready {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  flex: none;
  color: var(--pm-text-3);
  font-size: 11px;
}

body[data-pm-studio] .pm-console-dot {
  width: 5px;
  height: 5px;
  flex: none;
  border-radius: 50%;
  background: var(--pm-teal);
}

body[data-pm-studio] .pm-quick-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

body[data-pm-studio] .pm-quick {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  padding: 9px 11px;
  border: 1px solid var(--pm-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--pm-surface) 74%, transparent);
  text-align: left;
  cursor: pointer;
  transition: border-color 140ms ease, background-color 140ms ease, transform 140ms ease;
}

body[data-pm-studio] .pm-quick:hover {
  border-color: color-mix(in srgb, var(--pm-brand) 32%, var(--pm-border));
  background: var(--pm-surface);
  transform: translateY(-1px);
}

body[data-pm-studio] .pm-quick-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  background: var(--pm-brand-soft);
  color: var(--pm-brand);
}

body[data-pm-studio] .pm-quick-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

body[data-pm-studio] .pm-quick-title {
  color: var(--pm-text-1);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.35;
}

body[data-pm-studio] .pm-quick-hint {
  overflow: hidden;
  color: var(--pm-text-3);
  font-size: 11px;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

body[data-pm-studio] .pm-pulse-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  min-width: 0;
  color: var(--pm-text-2);
  font-size: 11px;
}

body[data-pm-studio] .pm-pulse-items {
  display: flex;
  align-items: baseline;
  gap: 0;
  flex-wrap: wrap;
}

body[data-pm-studio] .pm-pulse-item {
  padding: 0 10px;
  border-left: 1px solid var(--pm-border);
  white-space: nowrap;
}

body[data-pm-studio] .pm-pulse-item:first-child {
  padding-left: 2px;
  border-left: 0;
}

body[data-pm-studio] .pm-pulse-item b {
  margin-right: 3px;
  color: var(--pm-text-1);
  font-family: var(--pm-mono);
  font-size: 11px;
  font-weight: 600;
}

body[data-pm-studio] .pm-pulse-empty {
  color: var(--pm-text-3);
}

body[data-pm-studio] .pm-sim {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: auto;
  flex: none;
  color: var(--pm-text-3);
}

body[data-pm-studio] .pm-sim .pm-console-dot {
  background: var(--pm-amber);
}

body[data-pm-studio] .pm-sim-on {
  color: var(--pm-text-2);
}

body[data-pm-studio] .pm-sim-on .pm-console-dot {
  background: var(--pm-teal);
}

body[data-pm-studio] .pm-console-note {
  min-height: 14px;
  margin: 0;
  color: var(--pm-text-3);
  font-size: 11px;
  line-height: 1.35;
}

body[data-pm-studio] .pm-console-failure {
  color: var(--pm-rose);
}

/* ---------- Composer ---------- */

body[data-pm-studio] [data-composer-card] {
  border: 1px solid var(--pm-border) !important;
  border-radius: 10px !important;
  background: var(--pm-surface) !important;
  box-shadow: var(--pm-shadow-card) !important;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

body[data-pm-studio] [data-composer-card]:focus-within {
  border-color: color-mix(in srgb, var(--pm-brand) 52%, var(--pm-border)) !important;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--pm-brand) 10%, transparent), var(--pm-shadow-card) !important;
}

body[data-pm-studio] [data-composer-card] button[class*="_primary"] {
  border-radius: 50% !important;
  background: var(--pm-brand) !important;
  color: #ffffff !important;
  box-shadow: 0 4px 12px color-mix(in srgb, var(--pm-brand) 35%, transparent);
}

body[data-pm-studio] [data-composer-card] button[class*="_primary"]:hover {
  background: var(--pm-brand-strong) !important;
}

/* The upstream placeholder lives in a dedicated node; replace its copy without
   touching the editor's accessible name (which still comes from the host). */
body[data-pm-studio] [data-composer-placeholder] {
  font-size: 0;
}

body[data-pm-studio] [data-composer-placeholder]::after {
  content: "描述课题、贴上表征数据，或让我设计一组判别实验…";
  color: var(--pm-text-3);
  font-size: 14px;
  line-height: 1.6;
}

/* ---------- Sidebar ---------- */

body[data-pm-studio] [class*="_logoRow"] [class*="_brandName"] {
  min-width: 0;
}

body[data-pm-studio] [class*="_logoRow"] [class*="_brandMark"] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--pm-brand);
}

body[data-pm-studio] [class*="_logoRow"] [class*="_brandMark"] > svg {
  color: var(--pm-brand);
}

body[data-pm-studio] [class$="_newSession"] {
  height: 36px;
  margin: 4px 14px 12px;
  border: 1px solid color-mix(in srgb, var(--pm-brand) 28%, var(--pm-border));
  border-radius: 6px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--pm-brand) 10%, var(--pm-surface)),
    color-mix(in srgb, var(--pm-brand) 4%, var(--pm-surface))
  );
  color: var(--pm-brand-ink);
  transition: border-color 140ms ease, background-color 140ms ease;
}

body[data-pm-studio] [class$="_newSession"]:hover {
  border-color: color-mix(in srgb, var(--pm-brand) 52%, var(--pm-border));
  background: color-mix(in srgb, var(--pm-brand) 12%, var(--pm-surface));
}

body[data-pm-studio] [class*="_newSessionContent"] {
  gap: 8px;
  font-weight: 600;
}

body[data-pm-studio] [class*="_panelList"] [class*="_panelRow"] {
  border-radius: 6px;
}

body[data-pm-studio] [class*="_panelList"] [class*="_panelActive"] {
  background: var(--pm-surface);
  box-shadow: 0 1px 2px rgba(18, 21, 28, 0.05), 0 0 0 1px var(--pm-border);
}

body[data-pm-studio] [data-sidebar-scrollport] [class*="_projectRow"],
body[data-pm-studio] [data-sidebar-scrollport] [class*="_sessionRow"] {
  border-radius: 6px;
}

body[data-pm-studio] [data-sidebar-scrollport] [class*="_projectRow"]:hover,
body[data-pm-studio] [data-sidebar-scrollport] [class*="_sessionRow"]:hover {
  background: var(--pm-surface-hover);
}

body[data-pm-studio] [data-sidebar-scrollport] [class*="_sessionRow"][class*="_selected"] {
  background: var(--pm-brand-soft);
  color: var(--pm-brand-ink);
}

body[data-pm-studio] [data-sidebar-scrollport] [class*="_sectionHeader"] {
  color: var(--pm-text-3);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
}

/* ---------- Focus and motion ---------- */

body[data-pm-studio] .pm-expert:focus-visible,
body[data-pm-studio] .pm-quick:focus-visible {
  outline: 2px solid var(--pm-brand);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  body[data-pm-studio] .pm-expert,
  body[data-pm-studio] .pm-quick,
  body[data-pm-studio] [data-composer-card] {
    transition: none;
  }
}

@media (max-width: 980px) {
  body[data-pm-studio] .pm-console-label,
  body[data-pm-studio] .pm-console-ready {
    display: none;
  }
  body[data-pm-studio] .pm-quick-hint {
    display: none;
  }
}

/* ---------------------------------------------------------------- workbench */

body[data-pm-studio] .pm-wb-launcher {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 2px 6px;
}

body[data-pm-studio] .pm-wb-open {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--pm-border-strong);
  border-radius: 8px;
  background: var(--pm-surface);
  color: var(--pm-text-1);
  font: 600 12px/1 var(--pm-font);
  cursor: pointer;
}

body[data-pm-studio] .pm-wb-open:hover {
  background: var(--pm-surface-hover);
  border-color: var(--pm-brand);
}

body[data-pm-studio] .pm-wb-launcher-hint {
  color: var(--pm-text-3);
  font: 500 11px/1 var(--pm-font);
}

body[data-pm-studio] .pm-wb-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4vh 3vw;
  background: rgba(18, 21, 28, 0.42);
  backdrop-filter: blur(2px);
}

body[data-pm-studio] .pm-wb {
  display: flex;
  flex-direction: column;
  width: min(1180px, 94vw);
  height: min(760px, 88vh);
  border: 1px solid var(--pm-border);
  border-radius: 14px;
  background: var(--pm-surface);
  box-shadow: var(--pm-shadow-card);
  overflow: hidden;
}

body[data-pm-studio] .pm-wb-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--pm-border);
  background: var(--pm-brand-soft);
}

body[data-pm-studio] .pm-wb-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--pm-brand-ink);
  font: 700 14px/1 var(--pm-font);
}

body[data-pm-studio] .pm-wb-head-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

body[data-pm-studio] .pm-wb-select {
  height: 30px;
  max-width: 340px;
  padding: 0 8px;
  border: 1px solid var(--pm-border-strong);
  border-radius: 8px;
  background: var(--pm-surface);
  color: var(--pm-text-1);
  font: 500 12px/1 var(--pm-font);
}

body[data-pm-studio] .pm-wb-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--pm-border-strong);
  border-radius: 8px;
  background: var(--pm-surface);
  color: var(--pm-text-2);
  cursor: pointer;
}

body[data-pm-studio] .pm-wb-icon:hover {
  color: var(--pm-text-1);
  background: var(--pm-surface-hover);
}

body[data-pm-studio] .pm-wb-tabs {
  display: flex;
  gap: 4px;
  padding: 8px 12px 0;
  border-bottom: 1px solid var(--pm-border);
}

body[data-pm-studio] .pm-wb-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  background: transparent;
  color: var(--pm-text-2);
  font: 600 12px/1 var(--pm-font);
  cursor: pointer;
}

body[data-pm-studio] .pm-wb-tab em {
  font-style: normal;
  font-weight: 600;
  color: var(--pm-text-3);
}

body[data-pm-studio] .pm-wb-tab[aria-pressed='true'] {
  background: var(--pm-surface);
  border-color: var(--pm-border);
  color: var(--pm-brand-ink);
  box-shadow: 0 1px 0 var(--pm-surface);
}

body[data-pm-studio] .pm-wb-body {
  flex: 1;
  padding: 16px;
  overflow: auto;
  background: var(--pm-surface-subtle);
}

body[data-pm-studio] .pm-wb-note {
  margin: 0 0 12px;
  color: var(--pm-text-2);
  font: 500 12px/1.6 var(--pm-font);
}

body[data-pm-studio] .pm-wb-error {
  color: var(--pm-rose);
}

body[data-pm-studio] .pm-wb-grid {
  display: grid;
  grid-template-columns: 1.6fr 1fr;
  gap: 12px;
}

body[data-pm-studio] .pm-wb-card,
body[data-pm-studio] .pm-wb-row {
  padding: 14px 16px;
  border: 1px solid var(--pm-border);
  border-radius: 10px;
  background: var(--pm-surface);
}

body[data-pm-studio] .pm-wb-card h3 {
  margin: 0 0 6px;
  color: var(--pm-text-1);
  font: 700 13px/1.3 var(--pm-font);
}

body[data-pm-studio] .pm-wb-h3 {
  margin: 4px 0 8px;
  color: var(--pm-text-1);
  font: 700 13px/1.3 var(--pm-font);
}

body[data-pm-studio] .pm-wb-sub {
  margin: 0 0 10px;
  color: var(--pm-text-2);
  font: 500 12px/1.5 var(--pm-font);
}

body[data-pm-studio] .pm-wb-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  margin: 0 0 10px;
}

body[data-pm-studio] .pm-wb-stats div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

body[data-pm-studio] .pm-wb-stats dt {
  color: var(--pm-text-3);
  font: 500 11px/1 var(--pm-font);
}

body[data-pm-studio] .pm-wb-stats dd {
  margin: 0;
  color: var(--pm-text-1);
  font: 700 18px/1 var(--pm-font);
}

body[data-pm-studio] .pm-wb-badge {
  display: inline-block;
  margin: 0;
  padding: 4px 8px;
  border-radius: 6px;
  font: 600 11px/1.3 var(--pm-font);
}

body[data-pm-studio] .pm-wb-ok {
  background: var(--pm-teal-soft);
  color: var(--pm-teal);
}

body[data-pm-studio] .pm-wb-bad {
  background: var(--pm-rose);
  color: #ffffff;
}

body[data-pm-studio] .pm-wb-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}

body[data-pm-studio] .pm-wb-primary,
body[data-pm-studio] .pm-wb-secondary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border-radius: 8px;
  font: 600 12px/1 var(--pm-font);
  cursor: pointer;
}

body[data-pm-studio] .pm-wb-primary {
  border: 1px solid var(--pm-brand);
  background: var(--pm-brand);
  color: #ffffff;
}

body[data-pm-studio] .pm-wb-secondary {
  border: 1px solid var(--pm-border-strong);
  background: var(--pm-surface);
  color: var(--pm-text-1);
}

body[data-pm-studio] .pm-wb-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

body[data-pm-studio] .pm-wb-row p {
  margin: 6px 0 0;
  color: var(--pm-text-1);
  font: 500 12px/1.6 var(--pm-font);
}

body[data-pm-studio] .pm-wb-row-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

body[data-pm-studio] .pm-wb-row-head code,
body[data-pm-studio] .pm-wb-eq {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--pm-surface-subtle);
  color: var(--pm-brand-ink);
  font: 500 11px/1.5 var(--pm-mono);
}

body[data-pm-studio] .pm-wb-chip {
  display: inline-block;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--pm-surface-subtle);
  color: var(--pm-text-2);
  font: 600 10px/1.7 var(--pm-font);
}

body[data-pm-studio] .pm-wb-supports { background: var(--pm-teal-soft); color: var(--pm-teal); }
body[data-pm-studio] .pm-wb-refutes { background: #fbe9ec; color: var(--pm-rose); }
body[data-pm-studio] .pm-wb-neutral { background: var(--pm-surface-subtle); color: var(--pm-text-2); }
body[data-pm-studio] .pm-wb-established { background: var(--pm-brand-soft); color: var(--pm-brand-ink); }
body[data-pm-studio] .pm-wb-candidate { background: var(--pm-amber-soft); color: var(--pm-amber); }
body[data-pm-studio] .pm-wb-disputed,
body[data-pm-studio] .pm-wb-refuted { background: #fbe9ec; color: var(--pm-rose); }
body[data-pm-studio] .pm-wb-status-supported { background: var(--pm-teal-soft); color: var(--pm-teal); }
body[data-pm-studio] .pm-wb-status-refuted { background: #fbe9ec; color: var(--pm-rose); }
body[data-pm-studio] .pm-wb-status-under_test { background: var(--pm-amber-soft); color: var(--pm-amber); }
body[data-pm-studio] .pm-wb-card-approved { background: var(--pm-teal-soft); color: var(--pm-teal); }
body[data-pm-studio] .pm-wb-card-pending { background: var(--pm-violet); color: #ffffff; }
body[data-pm-studio] .pm-wb-card-rejected { background: #fbe9ec; color: var(--pm-rose); }

body[data-pm-studio] .pm-wb-muted {
  color: var(--pm-text-3);
  font: 500 11px/1.5 var(--pm-font);
}

body[data-pm-studio] .pm-wb-split {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.4fr);
  gap: 16px;
}

body[data-pm-studio] .pm-wb-nodes,
body[data-pm-studio] .pm-wb-edges,
body[data-pm-studio] .pm-wb-capabilities {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

body[data-pm-studio] .pm-wb-nodes li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border: 1px solid var(--pm-border);
  border-radius: 8px;
  background: var(--pm-surface);
  color: var(--pm-text-1);
  font: 500 12px/1.4 var(--pm-font);
}

body[data-pm-studio] .pm-wb-nodes li code {
  color: var(--pm-brand-ink);
  font: 500 11px/1.4 var(--pm-mono);
}

body[data-pm-studio] .pm-wb-edges li {
  padding: 9px 12px;
  border: 1px solid var(--pm-border);
  border-radius: 8px;
  background: var(--pm-surface);
}

body[data-pm-studio] .pm-wb-edges li p {
  margin: 4px 0 0;
  color: var(--pm-text-1);
  font: 500 12px/1.5 var(--pm-font);
}

body[data-pm-studio] .pm-wb-capabilities li {
  padding: 8px 10px;
  border-left: 2px solid var(--pm-brand);
  color: var(--pm-text-1);
  font: 500 12px/1.6 var(--pm-font);
}

@media (max-width: 980px) {
  body[data-pm-studio] .pm-wb-grid,
  body[data-pm-studio] .pm-wb-split {
    grid-template-columns: 1fr;
  }
}
`

/** Install the studio sheet once; tolerate headless Client boot. */
export function installPmStudioStyles(): () => void {
  if (typeof document === 'undefined') return () => {}
  if (document.getElementById(STYLE_ID) !== null) return () => {}
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.dataset.plugin = 'dsh-plugin-desktop'
  style.dataset.pluginCss = 'dsh-plugin-desktop/pm-studio'
  style.textContent = CSS
  document.head.appendChild(style)
  return () => { style.remove() }
}
