## PolyMechanism Studio 2.5.0

领域隔离与文献页：在 2.4.0 的 KB/Zotero/lit-library/五专家之上，新增可审计的领域注册表、
领域路由、严格检索门、独立 notes KB、workspace 作用域记忆和左侧栏「文献」页。

### 领域注册表与路由

- `domains/<id>/domain.json`：`kbRoot`/`notesRoot`/`zoteroCollection`/`litProject`/
  `allowedKinds`/`defaultKind`/`relatedDomains`/keywords；工作区优先，`$DSH_HOME/domains`
  回退；路径必须留在工作区内。
- `.pm-domain/state.json`：active domain + projectId。
- 新 `dsh-domain-router` host 插件：
  - `domain_list` / `domain_route` / `domain_scope` / `domain_remember` / `domain_recall`
  - `/api/pm-domain/domains|active|literature|orphans`（认证的 `connection.fetch` 路由）
  - 对 polymer 专家拒绝原始 `cognition_remember/recall` 的 guard

### 严格检索与资料分层

- `dsh-kb-rag@1.6.8-pm2`：`docs.domain`（schema v5）、`domain`/`domains` 过滤、
  严格 `DOMAIN_REQUIRED`、默认 `kind=pdf`、`crossDomain` 只展开 `relatedDomains`。
- deep 检索的 `related_docs`/引文库内匹配同样按域过滤，避免跨域泄漏。
- `kb_ingest`/`kb_zotero`/`kb_fetch` 支持 domain；`kb_stats` 给出按域计数。
- 论文 KB 与 `.kb-notes` 分离：内部报告/手记不再和论文同池。

### 记忆

- `dsh-cognition-engine@0.14.0-pm3`：`cognition_remember/recall` 新增 `workspaceId`，
  `scope=workspace` 真正生效。
- `domain_remember/recall` 强制 workspace + `project:`/`domain:`/`workspace:` 标签；
  跨域召回需 `confirmCrossDomain=true`。
- 五专家 seed 迁移：移除 raw cognition，加入 domain 工具和 `domain-routing` 技能；
  2.4.0 pristine store 自动升级，custom whitelist 保持不动。

### 文献页

- 左侧栏「文献」页：领域选择、论文/报告/手记计数、文档表、搜索、未入库 PDF 扫描、
  索引健康、右栏 PDF 预览。
- 领域切换写 active state；Zotero collection / lit-library project 绑定显示在页头。

### 迁移

真实工作区 `D:\pm-acceptance\pva-oblique-2026-11-20`：

- 旧 `.kb` 备份为 `.kb-backup-2026-11-26T04-06-36-107Z`（保留不删）
- `.kb-papers`：12 篇 PDF（PVA 4 / waxs-methods 4 / generic-polymer 4），798 chunks
- `.kb-notes`：5 份内部报告/手记，44 chunks
- active domain `pva-optical-film`；related `waxs-methods`
- 旧 KB 17 docs/842 chunks/743 vectors 保留；新库 vectors=0（当前 Python ABI 仍
  keyword 回退，页面显示 health）

### 验证

- `dsh-domain-router` 8 tests；desktop 94 tests（package 49、preset 20、integration 4、
  shipped 6、seed 13、client literature 2）；PM skills 3 tests。
- `verify:profile` EXIT=0；`verify:agent-team` EXIT=0：
  - 全局 112 tools；科学家 142
  - 专家可见工具：literature 35 / characterization 20 / modeler 23 / physicist 20 / reviewer 14
  - strict `DOMAIN_REQUIRED` 拒绝；真实 PVA KB 4 hits 全部 `pva-optical-film`；
    `crossDomain` 5 hits 含 `waxs-methods`
  - cognition workspace isolation：同 workspace 可见，另一 workspace 不可见
  - 2.4.0→2.5.0 真实 store 迁移：五专家全部 upgraded，cognition 移除、domain 工具加入
- 真实 dev app：左侧栏「文献」页渲染，控制台 0 错误；`/api/pm-domain/domains` 返回
  3 领域（PVA 4 papers/4 reports/1 note；waxs 4；generic 4）。

### 已知限制

- 打包 Python 仍可能 keyword 回退（vectors=0）；本轮未修 numpy/torch 环境。
- 迁移只处理旧 `.kb` 的 17 条文档，不自动补 12 篇未入库 PDF；文献页“扫描未入库”
  会列出。
- 不做自动建域；低置信度只问用户一个短问题。
- PM `domain` 枚举未扩宽；域绑定由 `.pm-domain/state.json` 维护。
- `pm-research` 的 live `literature-e2e` 网络测试在本环境失败（OpenAlex search
  ok:false），其余 52/53 tests 通过；domain 改动不涉及该工具。
- Mimosa 扫描仍 ENOBUFS；未宣称安全审计通过。

### 安装包

- `PolyMechanism-Studio-2.5.0-x64-Setup.exe`
- 383,027,311 字节
- SHA-256 `63326192ba2989d956862baca672def9fa6cedd85abe1c16b3036a7fecc40e8d`
- 构建日志：`Windows installer verification passed`
