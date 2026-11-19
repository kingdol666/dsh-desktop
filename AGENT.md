# PolyMechanism Studio — 开发规范（AGENT.md）

> **本文件是本仓库所有 AI Agent 与人类开发者的最高开发约束。** 任何代码变更在动手前必须通读本文；评审时以本文为唯一规范来源（Standards 轴）。
> 架构深度阅读：[docs/polymechanism/01-架构解读.md](docs/polymechanism/01-架构解读.md) · UI 扩展模型：[02-UI改造指南.md](docs/polymechanism/02-UI改造指南.md) · 产品路线：[03-项目执行计划.md](docs/polymechanism/03-项目执行计划.md)。文末保留上游 DSH Desktop 规则，与本规范冲突时**以本规范为准**。

---

## 0. 产品身份

- 本仓库是 `anywhere-labs/dsh-desktop` 的 fork，产品名 **PolyMechanism Studio**——面向高分子科学的 AI 科研工作台（首个课题：PVA 光学膜加工结构演化机理）。
- 产品身份唯一来源：`dsh-plugin-desktop/src/product-identity.ts`。**任何地方不得硬编码产品名**，一律 import `DESKTOP_PRODUCT_NAME` / `DESKTOP_APP_ID` 等常量。
- 用户可见文案中：
  - 产品名 = `PolyMechanism Studio`（Beta = `PolyMechanism Studio Beta`）；内置终端 = `PolyMechanism Terminal` / `PolyMechanism 终端`。
  - 品牌串有**连字符变体**（安装包/下载文件名 `PolyMechanism-Studio-${version}-*`）。改品牌相关代码时必须同时检索空格与连字符两种形式（`grep "DSH Desktop"` **和** `grep "DSH-Desktop"`），历史上漏过连字符形式。
  - **保留** `X-DSH-Desktop-*` HTTP 头——它们是与更新服务之间的传输契约（Phase 0.5 自建更新服务时统一定夺），不属于用户可见品牌。
  - **允许**出现 "DSH"——仅指上游运行时本身（如"可能与当前 DSH 版本不兼容"）；**允许**出现 "DeepSeek"——仅指上游模型平台账号服务（如"登录 DeepSeek"）。
  - **禁止**将 "DeepSeek Harness / DSH Desktop" 用作产品名；"DeepSeek" 商标不得用于产品宣传物。
- 更新端点（`update-checker.ts` / `update-download.ts`）指向 `updates.polymechanism.dev`：在该发行服务上线前，**不得**改回任何 DSH 官方端点，也不得让更新流程静默降级到官方安装包。

## 1. 不可逾越的红线（违反即回滚）

1. **禁止修改 `deepseek-harness/` 子模块内任何文件**，也**禁止修改 `vendor/dsh-runtime/` 下的 vendored tarball**。上游能力只通过组合（cordis patch / slots / services）接入。
2. **领域层零 DSH 依赖**：`packages/domain`、`packages/research-core`（规划中）不得 import 任何 `@deepseek-ai/*`、`electron` 或 Node 专有 API——科学资产必须可在无 Harness 环境下复用（在仓库根 `scripts/` 有架构方向门禁，新增跨层 import 前先查）。
3. **Agent 永远不拥有事实写入权**：任何"机理结论/证据状态"的变更只能经科研引擎服务端 API（Evidence/Hypothesis 服务）发生，带审计日志；客户端与 Prompt 不得绕过。
4. **Compatibility 模式行为零覆盖**：兼容模式必须保留上游的交互与数据路径，不得替换上游 React 树或会话行为。产品品牌与视觉层允许经 **desktop-owned client 插件**（slot/service 组合 + 受作用域控制的样式层）在所有呈现模式中生效；上游组件自身的业务逻辑与状态管理不得改写。
5. **平台数据不变式**：`productName`/`appId`/`homeDirectoryName` 变更属破坏性产品决策，必须同步更新 `package.json` build 配置、全部受影响测试、并在 PR 描述中写明用户数据迁移影响。
6. **Secrets 不进仓库**：API Key、证书、用户数据路径白名单一律走 Profile 配置或系统凭据库；日志输出必须过 `mask-secrets.ts`。

## 2. 架构地图（改代码前先定位层）

```
Electron 薄壳(main.ts) → Host 子进程(Cordis 运行时=vendored) → Web carrier(loopback HTTP/WS)
                                                      → 沙箱渲染层(上游 Web UI + Desktop client 插件)
自研目标分层：
  packages/domain          纯 TS 科学实体与契约（无运行时依赖）
  packages/research-core   科研引擎实现（被插件包装）
  plugins/*                Cordis Host 插件：Service Provider + defineTool 工具注册
  presets/*.patch.yml      六专家 Agent Preset（组合官方 Standard Preset）
  skills/ knowledge/       领域方法论文档与理论资产（Markdown+YAML，跨 Harness 可移植）
  science/                 Python 科学计算（uv 管理，MCP 接入，不写成 Cordis 工具）
  dsh-plugin-desktop/      桌面壳（本次已改版）：Host faces / client faces / native-ui
```

**判断改动归属**：纯科学概念/算法 → domain；流程编排与持久化 → research-core+plugins；Agent 能力 → presets/skills/tools；数值计算 → science(Python)；界面 → client faces 或新 client 插件；Electron 原生能力 → `src/`（main 侧）+ `native-ui/`。**改不动的边界**：`deepseek-harness/`、`vendor/`、上游 Web UI 行为。

## 3. 代码风格约定（从现有代码提炼，评审按此执行）

- **TypeScript strict**；相对导入**必须带 `.ts` 扩展名**（`from './runtime.ts'`）。
- **只用命名导出**，不用 default export；模块头一行 `/** 中文或英文职责说明 */`。
- **每个导出函数/常量/类必须有 JSDoc**：一句话职责 + `@param` 逐个标注；内部辅助函数可省。
- 常量用 `Object.freeze` + `as const`；接口字段倾向 `readonly`；可变状态收敛到 class（如 `DesktopLayoutState`）并配 `subscribe/getSnapshot`。
- **Cordis 插件三段式**：`inject` 声明依赖 → `apply(ctx)` 注册 → `ctx.effect(fn, '描述性标签')`，标签格式 `'dsh-plugin-desktop: xxx'`；作用域化的 inject 用 `ctx.inject([...], fn)` 并写明原因注释（参见 `src/client/index.ts:163` 的死锁说明——**关键耦合必须留"为什么"注释**）。
- **generation 纪律**：窗口、子进程、service reference 一律不跨 generation 缓存；释放路径必须幂等（`release()` 模式）。
- 双语文案**只在 copy 模块**（`*-copy.ts` / `*-locales.ts`）以 zh/en 成对定义，组件内禁止散落用户可见字符串；文案变更必须同步对应 spec 断言。
- CSS 类名前缀 `dshDesktop*`；Desktop-owned 样式集中在 `styles.ts` / `extended-styles.ts`（模板字符串导出）或 native-ui 的 `style.css`；颜色优先用上游主题变量（`--dsw-alias-*`），产品视觉层的 `--pm-*` 品牌/语义色集中定义在 `pm-studio/styles.ts` 的 token 块（docs 07 §2.1），组件与内联样式不得出现字面色值。
- Python（`science/`）：uv 管理依赖；公共函数带类型标注与 docstring；MCP 工具名 snake_case、动词开头（`fit_relaxation`）。

## 4. UI 开发规范

- **布局骨架**（`AdvancedFrame`/`ExtendedFrame`、`layout-state.ts`）是共享基础设施，改动需同时验证三种模式（compatibility/extended/advanced）与三平台（win32/darwin/linux）的表现；纯新增科研面板**优先走 slot 注册**（`sidebar` / `main`(keyed panel) / `rightbar` / `shell.overlay`），不改骨架。
- 新页面 = 新的 keyed main panel（参照 `MainPanel` 的 `entryKey` 机制）或 rightbar occupant；数据来源必须是 Host 服务或 SDK，渲染层**不得**直接读磁盘/进程。
- 原生小窗（涉密确认、系统级向导）走 `src/native-ui/` 独立 Vite 入口 + shadcn + 独立沙箱 `BrowserWindow`（参照 `desktop-dialog` 范式），并保持 CSP 最小化。
- 图标用 `lucide-react`；品牌 SVG（分子链 lockup）定义在 `DesktopFrameTitlebarView.tsx`，禁止复制到其他文件（单一来源）。

### 4.1 科研工作台前端风格约束（强制，完整版见 `docs/polymechanism/07-前端设计与交互规范.md`）

**定位纪律**
- 做**科研工作台**，不做聊天软件。屏幕主角是数据/图/参数/证据；对话只是操作方式之一。
- 任何**结论型 UI** 必须可下钻到证据 → 观测 → 原始文件；悬空结论视为视觉缺陷。

**视觉纪律**
- 只用语义色表达状态：`--pm-evidence`(支持) / `--pm-refute`(反驳) / `--pm-candidate`(候选) / `--pm-established`(已确立) / `--pm-pending`(待审)。**禁止装饰性彩色卡片墙**。
- 同一物理量在所有面板必须同色（图表序列色按 `--pm-series-1..10` 固定顺序）；数值必须带单位，等宽数字（`tabular-nums`）。
- 正文 13px / 行高 20；面板标题 12px/600；禁止小于 11px 的文字。
- 阴影只用于浮层；面板间用 1px 分隔线。圆角：控件 6px、卡片 8px、面板 0。
- 文字对比度 ≥ 4.5:1，图表线 ≥ 3:1；深浅色模式都必须校验。

**布局纪律**
- 三区固定：左 Project Rail（280px，可折叠 48px）· 中 Dock（多面板）· 右 Inspector（320px）· 底 StatusBar（28px）。
- 面板可拖拽/分屏/布局持久化；嵌套滚动条不超过两层。
- 任何时候都要可见：当前项目、待验证假设数、门控状态、长任务进度。

**状态纪律**
- 四态齐全且必须实现：Loading（骨架屏，>400ms 才显示）/ Empty（说明原因 + 主次行动）/ Error（code + 人话 + 可操作建议）/ Streaming（工具卡占位→填充）。
- **UI 不做乐观写入**：证据/假设/知识属科研事实，必须服务端确认后刷新；写操作带 `expectedRevision` 做冲突检测。
- 长任务必须可后台化、可取消、进度在状态栏持续可见；离开面板不中断。

**交互纪律**
- 全键盘可达：`⌘K` 命令面板、`⌘1..8` 切面板、`Tab` 顺序符合视觉顺序；焦点环 2px `--pm-accent` 不可移除。
- 图表必须提供"查看数据表"替代视图；语义色不得单独承载信息（同时用形状/图标/文字）。
- 动效只用于状态转换，≤200ms，尊重 `prefers-reduced-motion`；禁止装饰性/自动播放动画。

**文案纪律**
- 中英双语走 copy 模块（`*-copy.ts` / 文案表），组件内禁止硬编码用户可见字符串。
- 错误信息必须给出"下一步做什么"，禁止只说"失败了"。

**验收纪律**（每个前端 story 必答）
1. 打开应用 3 秒内能否回答"我在哪个项目/几个待验证假设/Agent 在做什么"？
2. 从任一结论 2 次点击能否到达原始证据？
3. 键盘能否完成一次完整任务（建假设→关联证据→提交审查）？
4. 深/浅色下语义色与序列色是否都可区分（含色盲模拟）？

## 5. 质量门与验证命令（提交前全部通过）

```bash
corepack yarn install --immutable      # 依赖变更后
corepack yarn typecheck                # TS 类型门
corepack yarn test                     # 单测（文案断言必须随文案同步更新）
corepack yarn build                    # 构建（含 market:prepare）
corepack yarn check                    # 完整 headless 门（发布/合并前）
corepack yarn check:desktop-variants   # 触及 Stable/Beta 共享代码时
```

- GUI 启动验证（人工/视觉）：`corepack yarn start`（等价 `market:prepare` + workspace start）；完整开发工作流用 `corepack yarn dev`。
- 启动必须是显式动作；所有测试与 smoke **保持 headless 安全**（不得在 CI 里拉起窗口）。
- 新增功能必须**先写/改测试**：文案与行为断言放 `tests/*.spec.ts`（vitest）；引擎类逻辑同时补 `packages/*` 纯单测。
- **改默认配置必须同步组合层测试**：`cordis.patch.yml` 的默认值（如 `desktop-shell` 的 `mode`）会被 `tests/profile.spec.ts` 的组合断言与 `tests/package.spec.ts` 的 manifest 断言镜像——两处必须一起改。
- 平台注意：`module-resolution` / `verify-linux-artifacts` / `compatibility-shell` 等 spec 在 Windows 存在**上游遗留失败**（路径语义/平台分支），与本 fork 无关；改动后以"失败清单不新增"为通过标准（stash 对照法取证）。

## 6. 双轴代码评审协议（每次 PR / 重大 diff 必须执行）

评审分两轴独立进行，**不得混排**（防止一轴掩盖另一轴）：

- **Standards 轴**：以本文件为唯一规范来源，逐文件报告违反项（引用本文件的节+条款）；同时跑下方"坏味道基线"。
- **Spec 轴**：对照原始需求（issue / 执行计划阶段验收标准 / 用户指令）报告：(a) 缺失或部分实现；(b) 未被要求的行为（scope creep）；(c) 看似实现但实现可疑的点——每条引用需求原文。

**坏味道基线**（Fowler《重构》第三章；均为"判断题"而非硬违规；仓库明文规范优先于基线；工具已强制的跳过）：

| 坏味道 | 信号 → 处置 |
| --- | --- |
| Mysterious Name | 名不达意 → 重命名；起不出诚实的名字说明设计混浊 |
| Duplicated Code | 同形逻辑出现于多个 hunk → 提取共享 |
| Feature Envy | 方法频繁伸手别的对象的数据 → 移到数据所在处 |
| Data Clumps | 几个字段/参数总是结伴 → 捆成类型 |
| Primitive Obsession | 裸 string/number 冒充领域概念 → 建小类型（如 EvidenceId） |
| Repeated Switches | 同一类型上的 switch/if 级联重复 → 多态或共享映射表 |
| Shotgun Surgery | 一个逻辑变更被迫散落多文件 → 聚拢到一个模块 |
| Divergent Change | 一个文件因多个不相关原因被改 → 拆分 |
| Speculative Generality | 为"将来可能"加的抽象/参数/钩子 → 删掉，等真实需求 |
| Message Chains | `a.b().c().d()` 长链导航 → 在首对象上封装一个方法 |
| Middle Man | 纯转发的类/函数 → 删掉直连 |
| Refused Bequest | 继承者拒绝/覆盖大部分遗产 → 改组合 |

## 7. 变更流程纪律

- 分支：`feat/<域>-<简述>` / `fix/<域>-<简述>`；一次 PR 只做一件事。
- **提交粒度**：大方向改变前先提交；子模块 pin 更新与桌面行为变更**永远分开提交**（上游规则）。
- Stable/Beta 镜像规则（上游规则）继续生效：共享改动先 beta 后 stable，`yarn check:desktop-variants` 通过后才可提交。fork 过渡期若只改 Stable，必须在 PR 描述注明 "beta mirror pending"。
- 文档三件套（`docs/polymechanism/`）与代码行为同步演进：改了架构/UI 机制，当天更新对应文档。
- 提交信息：`type(scope): summary`（type ∈ feat/fix/docs/refactor/test/chore）。

## 8. 提交前自查清单（Agent 必须逐项自答）

1. 改动是否落在正确的层（§2）？是否越过红线（§1）？
2. 产品名/文案是否走了常量与 copy 模块（§0/§3）？zh/en 是否成对？
3. 每个导出都有 JSDoc？相对导入带 `.ts`？（§3）
4. 新增用户可见行为有测试断言？`yarn typecheck` + `yarn test` 绿？（§5）
5. 是否需要双轴评审（§6）？Spec 轴的需求原文是什么？
6. 相关文档（§0 头部三件套）是否需要同步？

---

---

# DSH Desktop repository rules（上游规则，继续生效；与本规范冲突时以上方为准）

This repository owns the desktop product around an unmodified DeepSeek Harness checkout.

## Prerequisites and setup

- Use Node.js `^22.19.0` or `>=24.0.0` and the root Yarn `4.18.0` release through Corepack.
- Initialize the pinned upstream checkout with `git submodule update --init --recursive`.
- Install root dependencies with `corepack yarn install --immutable`.

## Build, run, and verify

- Start the desktop development workflow with `corepack yarn dev`.
- Build the desktop package with `corepack yarn build`.
- Root build, dev/start, and packaging commands refresh `dshmarket` from npm `latest` for Stable, Beta, and Next via `corepack yarn market:prepare`. Commit its exact dependency versions, Desktop compatibility patch, and lockfile together. `corepack yarn market:check` verifies freshness without writes; offline lookups or incompatible patches fail rather than silently retaining an old market. Installed apps do not hot-update executable plugins on launch.
- Before each release, run `corepack yarn aa:prepare-release` to build the latest official Agents Anywhere `main` for both Desktop channels. Commit the resulting artifact, provenance, manifests, and lockfile before packaging. Signed macOS releases and root Windows distribution commands verify freshness and installed versions; `DSH_AA_SOURCE_REF=pinned` is no longer supported.
- Run unit tests with `corepack yarn test`.
- Run type checking with `corepack yarn typecheck`.
- Run the complete headless gate with `corepack yarn check`.
- `corepack yarn dev:next` explicitly launches the experimental Next app; `corepack yarn check:next` validates it without a graphical application. Next uses the official published Web frontend and the recorded upstream Desktop presentation, with product capabilities composed as a separate bundle.
- Develop and validate Desktop feature changes in `dsh-plugin-desktop-beta/` first, then synchronize shared changes into `dsh-plugin-desktop/` while preserving declared variant differences. Before committing or pushing shared Desktop changes, run `corepack yarn check:desktop-variants` and validate both affected packages; neither package automatically inherits the other's source edits.
- Next and Beta may follow different upstream releases: the `next` and `beta` channels in `upstream.json`. While those versions differ, `scripts/verify-desktop-variants.mjs` treats the runtime version as a declared pair, lets each variant keep its own product version (the `package.json` `version` and the version pin in `tests/package.spec.ts`), so Beta can release on its own, lets each variant keep its own upstream-family pins (`@deepseek-ai/dsh*`, Cordis, Schemastery, Cosmokit) and upstream-family `dsh.optionalBundles` entries in `package.json` and its own `src/upstream-family.ts`, `src/upstream-family-labels.ts`, `src/upstream-family-preload.ts`, `src/client/upstream-family.ts`, `scripts/upstream-family.ts` and `tests/upstream-family.ts`, lets files below `src/upstream-family/`, `scripts/upstream-family/` and `tests/upstream-family/` exist in one variant only, and keeps lines between `// next-lead:start` and `// next-lead:end` in Next only. Keep every other upstream API difference behind those files or regions. A feature that needs the newer release keeps its modules, scripts and specs below those directories; the other variant's upstream-family files export the same names as `undefined`, and the shared code skips the feature. Once both follow the same release they must mirror again.
- Run upstream operations through the root scripts, such as `corepack yarn upstream:build`.

- `deepseek-harness/` is a pinned upstream Git submodule. Never edit files inside it from a desktop feature branch.
- `dsh-plugin-desktop/` owns the Cordis Host and Client faces, Electron bootstrap, packaging, and release tests.
- `dsh-desktop-next/` owns the separate experimental Desktop shell, Profiles and recovery, and adapters for the existing AA bridge and Community Market. Next-only changes do not belong in the Stable/Beta variant mirror. Keep its upstream reference and published runtime versions aligned; do not fork the official main frontend.
- `dsh-community-fabric/` owns the community interoperability RFC. Until schemas and a reviewed reference adapter exist, it remains a private documentation scaffold and must not declare loadable DSH or package entry points.
- `dsh-community-market/` owns the community-market shell. Until its runtime is implemented, it remains a private documentation scaffold and must not declare loadable DSH or package entry points.
- `dsh-tokens-anywhere/` owns the Anywhere account plugin, `@agents-anywhere/dsh-tokens-anywhere`: Tokens Anywhere sign-in, its models and usage. No Desktop variant loads it yet; the Next and Beta Host smokes assert that it is not mounted. Keep its `@deepseek-ai/dsh*` peers on Next's runtime version.
- `dsh-acp-bridge/` owns the Agent Client Protocol (ACP) bridge plugin published as `@agents-anywhere/dsh-acp-bridge`. It loads into a running DSH of the 0.2.2 runtime family, serves ACP to local editors such as Zed through a private MeshCall endpoint and a generated stdio launcher, and drives sessions only through the official Session Controller. It is not part of the Desktop variant mirror; its headless check runs a real in-process DSH Host with a scripted model. Its local RPC is a public interface, contract version 1, with a client in `@agents-anywhere/dsh-acp-bridge/client` that the launcher is built on: within a contract version changes only add fields or methods, and anything else takes the next contract version and a major release (`src/contract.ts`, `tests/unit/contract.test.ts`).
- The outer repository and all owned packages use the root Yarn release with `nodeLinker: node-modules`.
- The upstream submodule keeps its own pnpm workspace. Run upstream commands through the root `upstream:*` scripts, whose Yarn portable-shell commands enter the submodule before invoking Corepack.
- Compatibility mode must run the upstream default client without overrides. Advanced presentation belongs to desktop-owned client plugins and may replace documented slots or services through profile composition.
- Keep graphical application launch explicit. Builds, typechecks, unit tests, and Loader smokes must remain headless-safe.
- Commit before major changes of direction and keep the submodule pin update separate from desktop behavior changes.
- Keep the repository topology and package-manager split consistent with the [owning Agent Note](.agents/notes/implemented/process/2026-08-15-pinned-upstream-and-isolated-yarn-workspace.md).
