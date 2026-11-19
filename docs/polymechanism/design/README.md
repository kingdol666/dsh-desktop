# PolyMechanism Studio — Home Design Handoff

Status: **implemented** for the new-session home surface (2026-11-20).
Target frame: **1600 × 1000** · 8 pt grid · light + dark · Windows/macOS desktop chrome.

## 1. What ships in this folder

| File | Purpose |
| --- | --- |
| `home-prototype.html` | Pixel-accurate, self-contained artboard. Toggle dark with the moon button or `?theme=dark`. |
| `home-light.png` / `home-dark.png` | Rendered artboards (1600 × 1000) for review and Figma reference. |
| `tokens.json` | Design tokens in a format Figma variables / Tokens Studio can import. |
| `README.md` | Layout, components, states, redlines, implementation mapping. |

**Figma:** this environment has no Figma API, so the handoff is built the way Figma ingests it:
open `home-prototype.html` with the **html.to.design** plugin (or drop the PNGs on a
1600 × 1000 frame) and map the layers to the tokens in `tokens.json`. Component names below
are already the implementation names (`PmHeroBrandMark`, `PmHomeConsole`, …), so the
Figma library and the code share one vocabulary.

## 2. Direction — “Lattice”

A scientific instrument, not a chat app. The screen answers three questions at a glance:
**which project am I in**, **which expert is acting**, and **what do we currently know**.
DeepSeek’s whale and wordmark are replaced by the PolyMechanism chain mark everywhere.

- **Surface** — paper white in light, graphite in dark. Separators are 1 px, never boxes
  around boxes. Shadows exist only for the composer and floating layers.
- **Colour** — one product blue (`--pm-brand`) for actions and the active expert; teal,
  amber and rose are state-only (evidence, candidate, refutation). No decorative colour.
- **Type** — UI sans, 13 px body, tabular numerals, mono for protocol labels and counts.
  The headline is the only large type on the screen.
- **Motif** — a single fine molecular polyline behind the hero (38 % opacity), plus a soft
  brand glow. It never competes with the composer.
- **Density** — the station rail fits in 110 px; the composer stays the largest control.

## 3. Frame anatomy

```
┌───────────────────────────────────────────────────────────────────┐
│ Titlebar 38 · remote status · PolyMechanism Studio · mode · window │
├──────────────┬───────────────────────────────────────┬────────────┤
│ Sidebar 288  │ Main header 52                         │            │
│              ├───────────────────────────────────────┤            │
│ brand 54     │  Home column max 860, vertically       │            │
│ new session  │  centred:                              │            │
│ nav          │   kicker 18 · headline 40/46           │            │
│ projects     │   subline 13.5                         │            │
│ sessions     │   expert rail 28 chips                 │            │
│ footer       │   quick starts 3 × 48                  │            │
│              │   composer 168                         │            │
│              │   project pulse 20                     │            │
└──────────────┴───────────────────────────────────────┴────────────┘
```

- Sidebar: `288 px` (collapses to the upstream rail; the design does not change the
  desktop layout service).
- Home column: `min(860px, 100% - 64px)`.
- Composer radius `10 px`; cards `8 px`; controls `6 px`; chips `999 px`.
- Vertical rhythm: 4/8/10/12/14/16/26 px; hero → station 26 px; station → quick 8 px;
  quick → pulse 14 px.

## 4. Components

### 4.1 Brand occupants

| Component | Slot | Notes |
| --- | --- | --- |
| `PmMark` | — | Two fused monomer rings + bond node; 18/24/26 px. `currentColor`, stroke 1.8. |
| `PmSidebarBrandMark` | `sidebar.brand.mark` | 24 px, brand blue. |
| `PmSidebarBrandName` | `sidebar.brand.name` | `PolyMechanism` 14/650 + `STUDIO` 8.5 mono capsule. Truncates with ellipsis before the tag. |
| `PmHeroBrandMark` | `conversation.hero.brand.mark` | Kicker (mark + `POLYMECHANISM · RESEARCH WORKBENCH` + `PVA–OPTICAL / 01`), `role="heading"` headline, subline. The upstream title group is hidden by CSS. |

**Why the hero lockup renders through the mark slot:** the upstream slot is a `single`
occupant with a fallback, so a product can replace the mark without forking `ui-conversation`.
The lockup therefore owns the whole headline composition; the host’s own `titleGroup` is
`display: none` in the studio stylesheet.

### 4.2 Expert station

- Six chips, `28 px` tall, icon 14 px + 11.5 px label. Order and ids are the six presets in
  `cordis.patch.yml`: scientist, physicist, characterization, modeler, literature, reviewer.
- Idle: surface + 1 px border + secondary text. Hover: border strong, `translateY(-1px)`.
  Active (`aria-pressed=true`): brand-soft fill, brand ink, 600 weight.
  Busy: 60 % opacity, progress cursor.
- Clicking calls the Host seat: `remote.agentPresets.select(sessionId, presetId)`. The active
  state reads `sessions.byId[sessionId].projectionValues.agentPreset`, so an upstream chip
  change and this rail never disagree. A refusal is rendered in the console note in
  `--pm-rose` (never a silent failure).
- The rail is hidden from assistive tech on active conversations because the whole console
  is `display: none` outside `[data-phase="hero"]`; it is not merely visually hidden.

### 4.3 Quick starts

Three buttons: **设计判别实验 / 分析表征数据 / 评审机理图谱**.
Each is a 26 px icon tile + title + one-line hint. Clicking **fills the composer draft**
through `conversation.input(...).setDraft` and focuses it; it never sends on the user’s behalf.
The filled prompt names the observation, the competing hypotheses, and the evidence contract.

### 4.4 Project pulse

A single line: `PROJECT PULSE · N 条证据 · N 个假设 · N 张待审知识卡 · N 个项目` and a CAE
status dot. Data is the Host’s `/pm/overview` (same stores the tools write) under the documented
`{ ok, data }` envelope, not a mock:

```json
{ "ok": true,
  "data": {
    "totals": { "projects": 1, "evidence": 42, "hypotheses": 3,
                "supported": 2, "refuted": 0, "pendingKnowledge": 7 },
    "cae": { "configured": true } } }
```

`cae.configured` means the checkout is configured (env/config), not that a run has been
probed; the label is `CAE 已配置`, never `已连接`. Empty state:
`尚无研究项目 · 从一次课题拆解开始`. If the route is unavailable (browser preview), the
line shows `研究脉冲不可用 · 检查 Host 的 /pm/overview` and the rest of the console stays usable.

### 4.5 Composer

Upstream card with a product skin: 10 px radius, 1 px border, soft elevation, 4 px brand focus
halo. Send is a 32 px brand circle. The placeholder is replaced through
`[data-composer-placeholder]` (visual only; the editor’s accessible name is unchanged):
`描述课题、贴上表征数据，或让我设计一组判别实验…`.

## 5. Tokens

Import `tokens.json`. Core values:

| Token | Light | Dark |
| --- | --- | --- |
| `pm.brand` | `#4F6BFF` | `#6E86FF` |
| `pm.brand.ink` | `#2F3FA8` | `#B7C2FF` |
| `pm.surface` | `#FFFFFF` | `#121821` |
| `pm.sidebar` | `#FAFBFD` | `#0B0F16` |
| `pm.text.1` | `#12151C` | `#E9EDF6` |
| `pm.text.2` | `#596174` | `#9AA4B8` |
| `pm.text.3` | `#667085` | `#7D889D` |
| `pm.border` | `#E5E8EF` | `#1D2431` |
| `pm.teal` / `pm.amber` / `pm.rose` | `#0E9F87` / `#B07610` / `#C94B5B` | `#2CC3A8` / `#E0AC4D` / `#EF7180` |

`text.3` is deliberately darker than the first draft so 9.5–10.5 px labels clear 4.5:1 on
their surfaces. Semantic colours are never used for decoration.

## 6. Interaction & motion

- Entry: none beyond the theme transition; the home must feel instant. The hero glow and
  lattice are static; no autoplay decoration runs in the product shell.
- Hover: 140 ms border/background/translate; no scale.
- Composer focus: border brand-mix + 4 px halo, 160 ms.
- Motion is limited to state transitions under 200 ms; no JS or infinite animation loops.
- Clicking a station focuses the composer after the selection settles, so the next action is
  typing. Selecting an expert never clears an existing draft.

## 7. Implementation map

| Design | Code |
| --- | --- |
| Tokens + surface skins | `dsh-plugin-desktop/src/client/pm-studio/styles.ts` (`body[data-pm-studio]`) |
| Brand / hero lockup | `dsh-plugin-desktop/src/client/pm-studio/brand.tsx` (mark sourced from `DesktopProductMark`) |
| Station, quick starts, pulse | `dsh-plugin-desktop/src/client/pm-studio/home-console.tsx` |
| Bilingual copy | `dsh-plugin-desktop/src/client/pm-studio/copy.ts` |
| Slot wiring + theme + title | `dsh-plugin-desktop/src/client/pm-studio/index.ts` |
| Host pulse route | `plugins/pm-research/src/service.ts` (`overview()`), `src/index.ts` (`/pm/overview`) |
| Official DeepSeek artwork disabled | `dsh-plugin-desktop/cordis.patch.yml` (`ui-brand-official`) |

Selectors use stable class **suffixes** (`[class*="_titleGroup"]`) and data attributes
(`[data-composer-card]`, `[data-phase]`, `[data-composer-placeholder]`) rather than upstream
hash prefixes, so a Web bundle rebuild does not silently un-theme the product.

## 8. What is target-only (next goals)

The prototype’s research navigation (`工作台 / 机理图谱 / 表征分析 / 文献库 / 知识卡`) and the
mini project rail are **G007/G008 targets**. This change lands the visual system, the brand,
the blank-home console, the live pulse, and the composer/home skin. Panels and the Dockview
layout are implemented in G007/G008; the prototype is the acceptance reference for them.

## 9. Acceptance checklist

- [x] Sidebar and hero show PolyMechanism artwork; no whale, no “DeepSeek Harness” document title.
- [x] Six stations select the matching Host preset; the upstream chip and the rail agree.
- [x] Quick starts fill (not send) the composer; focus lands in the editor; a failed write is reported.
- [x] Pulse numbers come from `/pm/overview` under `{ok,data}`; empty, error and CAE-unconfigured states are explicit.
- [x] Console exists only on the blank home (`[data-phase="hero"]`); active conversations are unchanged.
- [x] Light and dark pass the contrast check for body/labels; focus-visible on every control; all copy ≥ 11px.
- [x] No autoplay decoration; reduced motion is a no-op because the product shell has no decorative animation.
- [x] No upstream token overwritten globally; styles are scoped to `body[data-pm-studio]`; copy lives in `copy.ts`.
