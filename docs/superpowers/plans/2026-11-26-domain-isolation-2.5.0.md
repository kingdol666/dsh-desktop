# 2.5.0 领域隔离与文献页 — 实施计划

日期：2026-11-26  
设计：[2026-11-26-domain-isolation-design.md](../specs/2026-11-26-domain-isolation-design.md)  
分支：`feat/domain-isolation-2.5.0`  
执行方式：每个 Phase 先写失败测试，再实现，再跑全量；每 Phase 一个 commit。

## Phase 0 — 预检/备份/文档

- [x] 记录基线：KB 17 docs / 842 chunks / 743 vectors；磁盘 24 唯一 PDF、12 未入库；Zotero 13 items / 11 PDFs。
- [x] 备份 `.kb` 到 `.kb-backup-20261126-114801`。
- [x] 写设计文档与计划文件。
- [ ] `git status` 确认只包含计划内改动。

## Phase 1 — `dsh-domain-router` host 插件

新增 `plugins/domain-router`：

- `package.json`：name `dsh-domain-router`，version `0.1.0`，`type: module`，`main: lib/index.js`，`dsh.bundle.patch`，peer cordis，deps `@deepseek-ai/dsh-tools`/`schemastery`。
- `cordis.patch.yml`：插入 `id: domain-router` / `name: dsh-domain-router`。
- `src/registry.ts`：读工作区 `domains/` + `$DSH_HOME/domains/`，合并覆盖；校验 id regex、`kbRoot`/`notesRoot` 工作区 jail、`relatedDomains` 存在；返回 `DomainConfig`。
- `src/classifier.ts`：CJK 二元组 + ASCII 词，keywords/name/description 权重；返回 confidence/margin/needsConfirmation/evidence/alternatives。
- `src/state.ts`：`.pm-domain/state.json` 原子读写；`activeDomain(workspace)`。
- `src/tools.ts`：`domain_list`、`domain_route`、`domain_scope`、`domain_remember`、`domain_recall`。
  - `domain_remember/recall` 通过捕获的 `scope.tools.get('cognition_*')` 调 `definition.execute`（绕过 guard），强制 workspace/project/domain tags。
  - `domain_recall` 跨域需 `confirmCrossDomain`。
- `src/guard.ts`：对 `polymer-*` 专家 preset 拒绝原始 `cognition_remember/recall`。
- `src/index.ts`：注册 tools、`connection.fetch` 路由 `/api/pm-domain/domains`、`/api/pm-domain/active`、`/api/pm-domain/literature`（docs/counts，读 `.kb-papers`/`.kb-notes` 的 docs；如 engine 不可用返回 typed error）。
- 单测：registry 覆盖/路径逃逸；classifier PVA/GIWAXS/歧义；state 原子读写；tools 的 project 校验/跨域确认；guard。
- 接入：`dsh-plugin-desktop/package.json` 依赖 `"dsh-domain-router": "workspace:*"`；`src/profile.ts` shipped bundles；`shipped-plugin-bundles.spec.ts`；`dsh-plugin-desktop` build script 先 build domain-router。

**验收**：`yarn workspace dsh-domain-router build`；`vitest` 新单测全过；`verify:profile` 注册 5 个 domain 工具。

## Phase 2 — `dsh-kb-rag` 1.6.8-pm2

- [ ] engine schema v5：`docs.domain` + index；v0→v5 migration；旧 docs NULL。
- [ ] `FILTER_COLS`/`build_where`：`domain` 精确、`domains` IN；`_effective_filters` 在 `cmd_search`/`cmd_rag` 解析 explicit/active/strict，默认 kind，`kind:'all'` 逃生。
- [ ] `related_docs`、`_lib_docs`/`_annotate_lib_matches` 按 domain 集合过滤。
- [ ] `cmd_ingest`/`_ingest_file`/`cmd_zotero`/`cmd_fetch` 传 domain；UPDATE `COALESCE`；domain 变更清 cache。
- [ ] `cmd_stats` 增加 domains/active_domain；新增 `cmd_docs`（title/year/doi/kind/domain/path/chunks，分页/过滤）。
- [ ] `lib/index.js`：`filterSchema` 加 domain/domains；`kb_ingest/kb_zotero/kb_fetch` 加 domain；`kb_scope` 加 domain；`kb_stats` 渲染；`connection.fetch` 路由 `/api/kb/docs`；严格 `DOMAIN_REQUIRED`。
- [ ] 打包 pm2、更新 desktop 依赖/lock；更新 `verify-research-tools`/`verify-literature-plugins` pin 与 domain/kind。
- 测试：schema v4→v5；domain 隔离/关联域/notes；strict 无域拒绝；docs 分页；ingest 幂等保留 domain。

**验收**：真实 17-doc KB `kb_search` 带 domain 返回 3 hits；无 domain/kb_root → `DOMAIN_REQUIRED`；`notes.kb` 不进入论文默认结果。

## Phase 3 — 一次性迁移

- [ ] `scripts/domain-migrate.mjs`：dry-run 读旧 `.kb`，按 title/path 提议 `pva-optical-film` / `waxs-methods` / `generic-polymer` / `internal-notes`；输出映射、未入库 PDF、不可读路径、目标 counts。
- [ ] `--apply`：备份旧 `.kb`；新建 `.kb-papers`/`.kb-notes`；按域重灌；写 `domains/*/domain.json` + `registry.json` + `.pm-domain/state.json`；旧 `.kb` 保留。
- [ ] 先在真实工作区跑 dry-run，给用户看映射；确认后 apply；验收 papers 12/notes 5。
- [ ] 迁移单测：fixture 旧库 → 目标库；路径不可读/重复处理；旧库不动。

## Phase 4 — cognition pm3 + 记忆/专家

- [ ] vendor `dsh-cognition-engine` 0.14.0-pm3：`cognition_remember/recall` 加 `workspaceId`；默认从 `exec.agent.session.header.cwd` hash；recall 传给 `visibleByScope`。
- [ ] `domain_remember/recall` 接 pm3；`scope=workspace` 真正生效；跨域确认。
- [ ] `dsh-plugin-desktop/src/agent-team-seed.ts`：
  - 冻结 `BLUEPRINTS_2_4_0` 快照；
  - `UPGRADE_ADDITIONS` + `UPGRADE_REMOVALS`；
  - systemPrompt 迁移（仅 pristine）；
  - 五专家加 domain 工具、移除 raw cognition、加 `domain-routing`；
  - 2.4.0→2.5.0 测试；custom store 跳过。
- [ ] `skills/domain-routing/SKILL.md`；`polymer-chief-route` §5；`literature-review` domain/kind 规则；六 persona Domain protocol。
- [ ] `PM_SKILL_NAMES`/skills 测试更新；`verify-profile-boot`/`verify-agent-team` 加 domain 工具/技能/严格拒绝/guard。

## Phase 5 — 文献页

- [ ] `dsh-plugin-desktop/src/client/literature/`：`index.ts`（slots）、`LiteraturePage.tsx`、`copy.ts`、`styles.ts`、`data.ts`。
- [ ] `src/client/index.ts` 调用 `applyLiterature(ctx)`。
- [ ] `sidebar.panellist` id `pm-literature` order 20，`main` key `pm-literature`；i18n `pm.literature`；`installLiteratureStyles()`。
- [ ] 页面：domain selector、papers/reports/notes 计数、文档表、搜索、右栏 PDF、relatedDomains、未入库、健康（vectors/keyword）。
- [ ] `GET /api/pm-domain/domains` / `/api/kb/docs` / `POST /api/pm-domain/active`；路径 jail/认证。
- [ ] `tests/client-literature.spec.ts`；`tsconfig.tests.client.json` include。
- [ ] CDP 实测页面、domain 切换、PDF 打开、0 console error。

## Phase 6 — 回归/发布

- [ ] `typecheck`、`vitest`、`verify:profile`、`verify:agent-team`。
- [ ] 真实 App：domain 严格拒绝、PVA/waxs/notes 隔离、记忆 scope、文献页。
- [ ] 打包 2.5.0，Release，2.4.0→2.5.0 更新 E2E。
- [ ] `docs/polymechanism/acceptance/2026-11-26-domain-isolation-2.5.0.md`、release notes、memory。
