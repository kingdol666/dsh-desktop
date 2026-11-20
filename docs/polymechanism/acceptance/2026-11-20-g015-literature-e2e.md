# G015 验收记录:文献闭环端到端(2026-11-20)

对应台账 G015(docs/polymechanism/11-文献检索与高分子筛选设计.md §6)。执行分支 `feat/lit-g015-e2e`。

## 端到端链路(permanent test:`plugins/pm-research/tests/literature-e2e.spec.ts`)

真实组件全链路,网络/机器缺失时优雅 skip:

| 步骤 | 组件 | 实测结果 |
| --- | --- | --- |
| 1. 在线检索+预筛 | OpenAlex + rubric | "biaxial stretching PVA optical film birefringence" top10 ≥5,首条 core/important |
| 2a. OA 下载 | litsearch 下载链 | arXiv DOI → **DOWNLOADED**,PDF 落盘 workspace/literature/ |
| 2b. 付费墙探测 | 同上 | Elsevier DOI → 状态如实记录(DOWNLOADED/OA_LINK_ONLY/CAMPUS_REQUIRED/MANUAL_REQUIRED 之一,本机未连校园网时 MANUAL_REQUIRED 附直链) |
| 3. 知识库入库 | kb-rag 引擎(desktop profile) | ingest 下载的 PDF → search 命中(results>0) |
| 4. 精读 | pm_literature_read(pypdf) | 锚定 PDF(Ursu 2015,复制入工作区后围栏内读取) |
| 5. 证据抽取 | pm_literature_extract | 3 条 claims 逐条入账 |
| 6. 账本校验 | verifyEvidence | SHA-256 链 verified=true |
| 7. 知识卡 | pm_knowledge_propose → pm_knowledge_review | literature 提议 → reviewer approve → status=approved |

## 已知边界(如实)

- **Zotero 未安装**:收录/附件挂载 spike 未执行(skill 已注册,装 Zotero 后按 contracts 文档补测);降级路径已写入 skill(manual 下 RIS+PDF 同目录)。
- **付费墙直连**:本机当前不在校园网 → 付费墙探测记录为 MANUAL_REQUIRED;校园网内出版商直连(IP 授权)待用户在校园网环境验证——工具语义已支持(CAMPUS_REQUIRED)。
- **校准锚集**:G014 初始校准为 3+1 query 小样本;30-50 篇课题锚集校准留待用户文献积累。

## 文档同步

- docs 04:dsh-kb-rag → 已集成(G012);dsh-zotero-skill → 已安装(待 Zotero)
- docs 09 §2.8a:三工具契约 + §6 权限行
- plugin-contracts.md:pm 文献工具实测形状 + kb_fetch 对照边界
- skills/literature-review v2:两阶段筛选协议(G014)

## 门

- pm-research vitest:46/46(45+1 E2E)
- verify:literature EXIT=0 / verify:profile EXIT=0
