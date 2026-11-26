# PolyMechanism Studio 2.5.0 — 领域隔离与文献页设计

日期：2026-11-26  
状态：已批准（用户选择 A：薄 domain-router 插件）  
依据：`docs/polymechanism/2026-11-25-polymer-superagent-plugin-survey.md`、2026-11-26 缺口复核、当前 KB/Zotero 实测

## 1. 问题

2.4.0 已有 KB、Zotero、lit-library、五专家和证据账本，但知识侧存在四个结构性问题：

1. KB 是工作区级单一索引：17 条文档中 12 篇 PDF、4 份内部报告、1 份手记；默认检索不按 `kind` 过滤，报告可能被当成论文引用。
2. 磁盘 24 篇唯一 PDF，KB 只索引 12 篇；没有文献页，用户看不到库存、未入库文件和是否可读。
3. 没有领域隔离：PVA KB 混入人指甲 α-角蛋白、GIWAXS/PVDF 等方法/跨体系内容；`pm_project_create.domain` 只有两个枚举值且只是元数据，`kb_scope` 只管 kb/both/web。
4. `cognition_remember/recall` 的 `scope=workspace` 当前没有真正生效：工具不传 `workspaceId`，实际只能靠 global + tags。

## 2. 目标 / 非目标

**目标**

- 工作区 + 全局回退的领域注册表；`domain_route`/`domain_scope` 可解释、低置信度只问一个短问题。
- `kb_search`/`kb_rag` 严格带域；默认 `kind=pdf`；关联域显式放行；报告/手记进独立 `notes.kb`。
- 领域事实的记忆强制 workspace 作用域 + `project:`/`domain:` 标签；跨域召回显式确认。
- 左侧栏「文献」页：领域选择、论文/报告/手记计数、文档表、PDF 预览、未入库/索引健康。
- 与现有 KB、Zotero、lit-library 绑定，不复制第二套文献库。

**非目标**

- 不修复当前 Python 向量环境（仍可能 keyword 回退；页面显示健康状态）。
- 不自动补入 12 篇未入库 PDF（迁移只报告；用户确认后再补）。
- 不做多用户/团队 ACL、自动建域、GROMACS/COMSOL、新的阅读器后端。
- 不扩宽 PM `domain` 枚举（先由 `.pm-domain/state.json` 绑定 projectId→domain；PM 项目只读校验）。

## 3. 架构决策

- **A. 薄 `dsh-domain-router` host 插件 + 最小 KB/cognition patch（选定）**：职责干净，领域注册表/分类/active domain/记忆包装可复用；不成为第二个 PM 引擎。
- B. 只扩展 pm-research：不新增 bundle，但 pm-research 继续变大，KB/PM 各自读注册表。
- C. 只写 prompt/技能：无法强制、没有 UI，排除。

**UI 修正（探索后）**：文献页放在 desktop-owned client（`dsh-plugin-desktop/src/client/literature`），不放在 domain-router client。理由是复用 desktop 的 `sidebar.panellist`/`main` 插槽、样式、i18n 和 PDF 预览；避免把 PolyMechanism 产品页装进通用 kb-rag 消费者。domain-router 保持 host-only，提供 `/api/pm-domain/*` 路由。

## 4. 数据模型

```
<workspace>/
  domains/registry.json
  domains/<id>/domain.json
  .pm-domain/state.json
  .kb-papers/kb.sqlite
  .kb-notes/kb.sqlite
```

`domain.json`：

```json
{
  "schemaVersion": 1,
  "id": "pva-optical-film",
  "name": "PVA 光学膜",
  "description": "PVA 双轴拉伸、取向、结晶度、双折射",
  "keywords": ["PVA", "polyvinyl alcohol", "聚乙烯醇", "双轴拉伸", "双折射", "取向", "结晶度", "热定型"],
  "kbRoot": ".kb-papers",
  "notesRoot": ".kb-notes",
  "zoteroCollection": "PVA",
  "litProject": "pva-optical-film",
  "allowedKinds": ["pdf"],
  "defaultKind": "pdf",
  "relatedDomains": ["waxs-methods"],
  "priority": 10
}
```

- 工作区 `domains/` 覆盖 `$DSH_HOME/domains/` 同 id；路径解析后必须在工作区内，拒绝 `..`/绝对路径逃逸。
- `.pm-domain/state.json` 是 workspace 级 active 状态：`{ schemaVersion, domain, projectId, updatedAt }`，原子写。
- 论文域共享 `.kb-papers`，用 `docs.domain` 隔离；内部报告/手记独占 `.kb-notes`。
- 单主域 + `relatedDomains`；不做 `doc_domains` 多主域（同一论文不重复入库）。

## 5. 领域路由

`domain_route(question, projectId?)` 纯本地关键词/描述打分（CJK 二元组 + ASCII 词），返回：

```json
{
  "domain": "pva-optical-film",
  "confidence": 0.82,
  "evidence": ["keyword:PVA", "keyword:双轴拉伸"],
  "kbRoot": ".kb-papers",
  "collection": "PVA",
  "litProject": "pva-optical-film",
  "relatedDomains": ["waxs-methods"],
  "needsConfirmation": false
}
```

- 置信度阈值 + 前两名 margin；低置信度返回 `needsConfirmation:true` + 一个短问题 + 候选 domain。
- 不自动建域；`domain_list` 列出注册表。
- `domain_scope(domain, projectId?, save?)` 写 active 状态；`domain_scope` 必须能作用于后续 KB 调用。

## 6. KB 强制

- `docs` 表加 `domain TEXT`（schema v5），索引；旧库迁移时 NULL。
- `filters.domain` 精确匹配；`filters.domains` 用于关联域；`build_where` 特殊处理，避免 LIKE 误匹配。
- `kb_search/kb_rag` 解析：显式 `domain` → active domain → 显式 `kb_root`（仅迁移/测试逃生口）→ `DOMAIN_REQUIRED`。
- 默认 kind 来自 domain `defaultKind`；`kind:'all'` 逃生口。
- `crossDomain=true` 只展开 `relatedDomains`；结果带 domain 标签。
- `related_docs`、`_lib_docs`/引文匹配也按 domain 集合过滤。
- `kb_ingest/kb_zotero/kb_fetch` 增加 `domain`；UPDATE `COALESCE(?, domain)`；domain 变化清 cache。
- `kb_stats` 增加 `domains`/`active_domain`；引擎 `docs` 命令供 UI；**不新增 kb 工具**（保持 10 个）。
- `kb-rag` 新增认证路由 `/api/kb/docs`（`connection.fetch.register`），返回 docs + counts，供文献页。

## 7. 记忆

- vendor `dsh-cognition-engine` 升 `0.14.0-pm3`：`cognition_remember/recall` 增加可选 `workspaceId`，默认由 `exec.agent.session.header.cwd` 哈希派生；`cognition_recall` 把 `workspaceId` 传给 `visibleByScope`。
- `domain_remember` 强制 `scope=workspace` + `tags: ['project:<id>','domain:<id>', ...]`；`domain_recall` 默认同域同项目；跨域必须 `confirmCrossDomain:true`。
- 专家白名单移除原始 `cognition_remember/recall`，只留 `domain_remember/recall`（Reviewer 只 recall）；domain-router 注册 `tools.guard` 对 polymer 专家拒绝原始 cognition；主会话保留原始工具。
- 记忆不是证据；`polymer-chief-route` 明确。

## 8. 文献页

- desktop client 新增 `src/client/literature/`：`sidebar.panellist` + `main` 两个插槽，`id: 'pm-literature'`，order `20`，标签「文献 / Literature」。
- 页面：domain 选择器、论文/报告/手记计数、文档表（标题/年份/DOI/kind/domain/chunks）、搜索、打开 PDF（右栏 `sidebarRight.openResource`，先 `layout.selectPanel(null)`）、关联域开关、未入库计数、索引健康。
- 数据：`/api/pm-domain/domains`、`/api/pm-domain/active`、`/api/kb/docs`；不复制文献库。
- Zotero/lit-library 只显示 domain 绑定的 `zoteroCollection`/`litProject`；Literature 专家按域使用。
- 样式走 `installLiteratureStyles()`（不 import CSS），i18n 走 `ctx.locale.register`，客户端代码不得使用 `process.`。

## 9. 迁移

- `scripts/domain-migrate.mjs` dry-run：读旧 `.kb`，按 title/path 提议 PVA / waxs-methods / generic-polymer / internal-notes；输出映射、未入库 PDF、不可读路径。
- `--apply`：备份旧 `.kb`，新建 `.kb-papers`/`.kb-notes`，按域重灌；写 registry/state；旧 `.kb` 不删。
- 先审 dry-run，再 apply；验收 counts。迁移不自动补 12 篇未入库 PDF，只报告。

## 10. 验证

- `domain_route` PVA/GIWAXS/歧义；无 domain/kb_root → `DOMAIN_REQUIRED`；PVA 不返回 waxs-methods/notes；`crossDomain` 只返回 related。
- `domain_remember` scope=workspace + tags；跨域 recall 确认；专家 raw cognition 被拒。
- 文献页 counts/表格/PDF/未入库/健康；0 console error。
- 2.4.0 pristine store 升级；custom store 不动。
- `verify:profile`/`verify:agent-team`；2.4.0→2.5.0 更新 E2E。

## 11. 风险与回滚

- 严格模式破坏旧调用：更新所有 prompt/技能/测试；`kb_root` 仅迁移/测试逃生口；`strictDomain` 开关。
- 迁移误分类：dry-run + 可编辑 registry；旧 `.kb` 备份。
- deep 检索泄漏：`related_docs`/引文匹配同步过滤。
- UI 插槽/预览：先复用 desktop 插槽；失败退化为 OS 打开。
- 回滚：保留 2.4.0 安装包、旧 `.kb`、git tag。
