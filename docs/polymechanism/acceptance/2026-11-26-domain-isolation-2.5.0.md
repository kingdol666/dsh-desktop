# 验收：2.5.0 领域隔离与文献页

日期：2026-11-26  
版本：PolyMechanism Studio 2.5.0  
设计：[2026-11-26-domain-isolation-design.md](../../superpowers/specs/2026-11-26-domain-isolation-design.md)  
计划：[2026-11-26-domain-isolation-2.5.0.md](../../superpowers/plans/2026-11-26-domain-isolation-2.5.0.md)

## 1. 交付内容

### 1.1 `dsh-domain-router`（新 host 插件）

- `domains/<id>/domain.json`（工作区）+ `$DSH_HOME/domains` 回退；路径 jail 在工作区内。
- `.pm-domain/state.json` active domain/project。
- Tools：`domain_list`、`domain_route`（本地关键词分类，低置信度只问一个短问题）、
  `domain_scope`、`domain_remember`、`domain_recall`。
- Routes：`/api/pm-domain/domains|active|literature|orphans`（`connection.fetch` 认证）。
- Guard：polymer 专家 preset 拒绝原始 `cognition_remember/recall`。
- 单测 8 个：registry 覆盖/路径逃逸、PVA/WAXS/歧义分类、state、工具标签/跨域确认。

### 1.2 `dsh-kb-rag@1.6.8-pm2`

- schema v5：`docs.domain` + 索引；v4→v5 迁移实测通过。
- `domain`/`domains` 过滤（精确匹配），`crossDomain` 只展开 `relatedDomains`。
- `kb_search`/`kb_rag` 严格 `DOMAIN_REQUIRED`；默认 kind 来自 domain `defaultKind`；
  `kind:'all'` 逃生；`kb_root` 保留迁移/测试逃生。
- `kb_ingest`/`kb_zotero`/`kb_fetch` 支持 domain；`COALESCE` 防止重灌清空。
- `related_docs`、引文库内匹配按域过滤，避免 deep 检索泄漏。
- `kb_stats` 按域/kind 计数；结果带 `domain`。
- 引擎测试：v4→v5 migration；domain 过滤（pva 只返回 pva、waxs 只返回 waxs、
  `domains` 返回两者）。

### 1.3 `dsh-cognition-engine@0.14.0-pm3`

- `cognition_remember/recall` 增加 `workspaceId`，默认由会话 cwd 哈希派生；
  `cognition_recall` 传给 `visibleByScope`。
- `scope=workspace` 真正生效；同 workspace 可见、另一 workspace 不可见（实测）。

### 1.4 专家迁移

- 2.4.0 → 2.5.0：五专家移除 raw cognition，加入 domain 工具；Reviewer 只 recall；
  skills 加 `domain-routing`；pristine store 自动升级，custom whitelist 不动。
- 真实 store 副本迁移结果：physicist 23 / characterization 24 / modeler 26 /
  literature 38 / reviewer 16 tools，全部含 `domain_route`、无 `cognition_recall`、
  含 `domain-routing`。
- 六 preset persona 追加 Domain protocol；`polymer-chief-route` §5、
  `literature-review` 更新。

### 1.5 文献页

- 左侧栏「文献」+ keyed `main` 页；领域选择、论文/报告/手记计数、文档表、搜索、
  未入库 PDF 扫描、索引健康、右栏 PDF 打开。
  > 2.5.0 的 `openPdf` 未声明 `layout`/`sidebarRight` 注入，点击「打开」会显示
  > `cannot get property "sidebarRight" without inject`；已由 2.5.1 修复（scoped
  > `ctx.inject`），见 [2026-11-26-domain-isolation-2.5.1.md](2026-11-26-domain-isolation-2.5.1.md)。
- 真实 dev app：侧栏出现「文献」，页面渲染，**0 console errors**。
- `/api/pm-domain/domains` 真实工作区返回 3 领域：
  PVA 4 papers/4 reports/1 note；waxs 4；generic 4。
- `/api/pm-domain/literature?domain=pva-optical-film` 返回 4 papers + 5 notes 全量
  （修复 queryNumber 缺省 limit=1 的问题后）。

## 2. 迁移结果

真实工作区 `D:\pm-acceptance\pva-oblique-2026-11-20`：

| 目标 | 内容 | counts |
|---|---|---|
| `.kb-backup-2026-11-26T04-06-36-107Z` | 旧 `.kb` 全量备份 | 17 docs / 842 chunks / 743 vectors |
| `.kb-papers` | 12 PDF | 798 chunks；PVA 4 / waxs-methods 4 / generic-polymer 4 |
| `.kb-notes` | 4 md + 1 txt | 44 chunks；domain pva-optical-film |

- `domains/`：`pva-optical-film`（related waxs-methods、Zotero PVA、litProject
  pva-optical-film）、`waxs-methods`、`generic-polymer`。
- `.pm-domain/state.json` active `pva-optical-film`。
- 旧 `.kb` 保留；新库 vectors=0（embedding env 仍 ABI 失败，keyword 回退）。

## 3. 验证

### 3.1 单测/构建

- `dsh-domain-router`：8 passed。
- desktop：94 passed（package 49、preset-composition 20、presets-integration 4、
  shipped 6、agent-team-seed 13、client-literature 2）。
- `pm-research` skills：3 passed。
- `pm-research` 全量：52/53，live `literature-e2e` 网络测试失败（OpenAlex
  `pm_literature_search` ok:false）；与 domain 改动无关。
- `typecheck` EXIT=0；`build` EXIT=0。

### 3.2 真实 Host

- `verify:profile` EXIT=0：domain tools + `domain-routing` 注册。
- `verify:agent-team` EXIT=0：
  - 全局 112 tools；科学家 142
  - 专家可见：literature 35 / characterization 20 / modeler 23 / physicist 20 / reviewer 14
  - strict `DOMAIN_REQUIRED` 拒绝
  - 真实 PVA KB：4 hits 全部 `pva-optical-film`；`crossDomain` 5 hits 含 `waxs-methods`
  - cognition workspace isolation：同 workspace 可见、另一 workspace 不可见
  - 真实 `domain_remember`/`domain_recall`：domain_scope 绑定 PR-1 后写入并召回成功，
    标签含 project/domain/workspace；随后 forget
  - 六组委派矩阵/禁止调用/真实链路仍通过

### 3.3 真实 dev app

- 侧栏「文献」渲染；控制台 0 错误。
- `/api/pm-domain/domains`/`literature` 真实数据通过。
- 页面在默认空工作区显示“没有领域注册表”；真实 profile 的 PVA 会话会显示数据。

### 3.4 打包版 2.5.0（win-unpacked，隔离 DSH_HOME/APPDATA/LOCALAPPDATA）

- 启动 URL `dsh-desktop-version=2.5.0`；日志 `agent team: seeded ...`；`[kb-rag] v1.6.8-pm2`。
- 侧栏「文献」出现；`/api/pm-domain/domains` 返回 3 域：
  `pva-optical-film` 4 papers/4 reports/1 note、`waxs-methods` 4、`generic-polymer` 4，
  active `pva-optical-film`；控制台 0 错误。
- 打包内 `dsh-domain-router 0.1.0`、`dsh-kb-rag 1.6.8-pm2`、
  `dsh-cognition-engine 0.14.0-pm3`、`app/skills/domain-routing/SKILL.md` 均已确认。

> 注意：用同一 Electron appName 启动 dev 与 packaged 两个实例会争 `%LOCALAPPDATA%` 缓存，
> packaged 实例可能直接退出；测试时需隔离 `LOCALAPPDATA` 或先停掉另一个实例。

### 3.5 2.4.0 → 2.5.0 应用内更新 E2E

- 2.4.0 应用内检查到 2.5.0，下载 `PolyMechanism-Studio-2.5.0-x64-Setup.exe`
  383,027,311 字节，下载 SHA-256 与 Release 一致 → 重启安装 → 版本 2.5.0。
- 安装版启动日志：`agent team: upgraded physicist, characterization, modeler,
  literature, reviewer whitelists`。
- 真实 profile 18 bundles（含 `dsh-domain-router`）；`agents.json` 工具数
  physicist 23 / characterization 24 / modeler 26 / literature 38 / reviewer 16，
  均含 `domain_route`、无 `cognition_recall`。
- 安装版「文献」页读取真实工作区：domain `pva-optical-film`，4 论文 / 4 报告 /
  1 手记 / 0 向量（关键词回退）；论文表 4 篇 PVA PDF 带标题/DOI/chunks。
- 点击论文「打开」在 2.5.0 报 `sidebarRight without inject`（见 1.5 注），
  2.5.1 修复后 dev/packaged 实测右栏 PDF 渲染 22/4 页 canvas、0 console 错误。

## 4. 已知限制

- **向量仍 keyword 回退**：迁移后 `.kb-papers` vectors=0；`KB_RAG_PYTHON` 指向的
  Anaconda numpy/sentence-transformers ABI 仍失败。检索可用，语义召回弱。
- **12 篇未入库 PDF 不自动补**：文献页“扫描未入库”列出；需用户确认后 `kb_ingest`。
- **不做自动建域**：低置信度只问用户；新域需手写 `domains/<id>/domain.json`。
- **PM domain 枚举未扩宽**：域绑定在 `.pm-domain/state.json`；PM 项目仍只读校验。
- **文献页默认工作区**：全局页从会话 cwd 推导工作区；若当前没有对应会话，显示空态。
- **安全审计**：Mimosa 扫描 ENOBUFS，未宣称通过。

## 5. 安装包

| 项 | 值 |
|---|---|
| 文件 | `PolyMechanism-Studio-2.5.0-x64-Setup.exe` |
| 大小 | 383,027,311 字节 |
| SHA-256 | `63326192ba2989d956862baca672def9fa6cedd85abe1c16b3036a7fecc40e8d` |
| 构建 | `Windows installer verification passed` |
| 打包内插件 | `dsh-domain-router 0.1.0`、`dsh-kb-rag 1.6.8-pm2`、`dsh-cognition-engine 0.14.0-pm3`；`app/skills/domain-routing/SKILL.md` |
