# 高分子科研 Superagent 插件调查报告

日期：2026-11-25  
范围：DSH 社区目录 6,808 条 + npm tarball / GitHub README 逐包核验  
结论：**本轮只调查，不安装、不改代码**。推荐的核心组合是「1 个路由/专家层 + 1 个上下文审计 + 1 个论文 KB + 1 个记忆 + 1 个文献索引」，其余按需加，不做全家桶。

---

## 0. 调查方法与诚实边界

- 主索引：DSH 社区目录 `catalog.json`，2026-11-24 快照，**6,808 个插件**。
- 关键词漏斗：
  - 编排/专家/子代理/路由/团队/预设：**1,974 条**
  - 文献/论文/DOI/arXiv/Zotero/PDF/下载：**420 条**
  - 科研/数据/Python/仿真/分子/材料/机理：**416 条**
- 精读：下载并解包 **20+ 个** tarball，读 README、工具表、`cordis.patch.yml`、`package.json`（license/engines/host services）。
- 不是把 6,808 条全下载；目录是社区索引，README 才是实现事实。报告里的“结论”均来自实际包内容，不是市场文案。
- 兼容基线：本机 **DSH 0.2.1-rc.3**、Electron 44、Node 24；`engines.dsh` 明确要求 ≥0.2.2-rc.x 的插件直接标“不可装”，不靠 `allow-version` 硬豁免。
- 当前 2.2.6 基线：**6 个专家 preset、36 个 PM 工具、101 个总工具、28 个技能**；MATLAB 插件已移除；`dsh-kb-rag` 已装。

---

## 1. 目标拆解：你要的 8 条流水线

| # | 需求 | 现有能力 | 主要缺口 |
|---|---|---|---|
| 1 | 机理分析 | PM `pm_hypothesis_*` / `pm_mechanism_*` / `pm_evidence_*` / 机理图谱 | 缺“高分子机理本体 + 判别实验设计”的领域层 |
| 2 | 数据分析 | PM `pm_*_analyze` / `pm_model_fit` / `pm_analysis_report` + Python | 缺自动 EDA、统计检验选择、批量数据管线 |
| 3 | 论文检索 | PM `pm_literature_search`（OpenAlex/Crossref + rubric） | 缺跨源去重、覆盖度判定、系统综述循环 |
| 4 | 非 OA 下载 | PM `pm_literature_download`（OA 链）+ `pm_literature_browser_download`（真实浏览器，机构 IP） | 无合法 SSO/CARSI 自动化；付费墙必须人来登录 |
| 5 | 下载后入 KB | 已实现：下载成功 → `kb_ingest`；`pm_kb_note` 手动存 | 打包 Python 的向量/精排降级关键词；KB 无分区/浏览页 |
| 6 | 记忆 | cognition-engine（双时态 + 准则本 + RSI） | 无跨专家共享工作记忆；记忆分区靠 tags/scope |
| 7 | 模拟软件集成 | PM `pm_sim_*` 9 个；LAMMPS 可选；Python | 无 LAMMPS/GROMACS/COMSOL 适配器；无作业队列/输入生成器 |
| 8 | 自研模拟业务 | PM 解析模型 + Python + `pm_model_fit` | 无统一模拟服务/结果可视化/参数扫描框架 |
| 9 | Route → 子 Agent | 预设有六专家，但无硬路由/队列；全局工具 101 个 | 缺“总工硬白名单 + 任务队列 + 工具裁剪” |

---

## 2. 推荐总架构

```
用户
  │
  ▼
总工 / Chief（主会话或独立 chief 子智能体）
  ├─ 路由技能 polymer-chief-route（决策表，不是另一个 LLM）
  ├─ 任务账本：PM project / goal / todo / evidence
  ├─ delegate_agent(agent=…, prompt=brief)
  │
  ├─ Physicist（机理/物理）
  │    pm_hypothesis_* / pm_mechanism_* / pm_sim_* / pm_model_fit
  ├─ Characterization（表征）
  │    pm_waxs_pro / pm_ftir_analyze / pm_saxs_analyze / pm_hermans_analyze / pm_evidence_record
  ├─ Modeler（建模/仿真）
  │    pm_sim_* / pm_model_fit / pm_experiment_plan / python-env
  ├─ Literature（文献）
  │    pm_literature_* / kb_search / kb_rag / lit_find / zotero
  └─ Reviewer（独立复核）
       pm_gate_check / pm_evidence_verify / pm_knowledge_review / second-opinion
  │
  ▼
证据账本 + 机理图谱 + KB + 认知记忆
  │
  ▼
pm_analysis_report（HTML/MD）→ 总工汇总 → 用户
```

### 路由决策表（写进技能，不写进插件）

| 输入特征 | 路由到 | 必带 brief |
|---|---|---|
| 机理、假设、竞争解释、判别实验 | Physicist | 现象、候选假设、可观测判别量、已有证据 ID |
| WAXS/FTIR/SAXS/取向/结晶度/光谱 | Characterization | 数据路径、测量条件、峰位/基线假设、要回答的量 |
| 模拟、拟合、参数扫描、模型选择 | Modeler | 模型、参数范围、数据、验收标准（r²/CI/收敛） |
| 检索、筛文献、下载、引用、综述 | Literature | 主题、年份窗、 inclusion/exclusion、目标分区、是否入库 |
| 复核、门控、结论审计 | Reviewer | 结论、证据 ID、极性、竞争假设、要审的 gate |
| 跨域、课题拆解、最终交付 | 总工自己 | 目标、约束、验收、已知事实 |

brief 固定四段：**目标 / 约束 / 验收 / 已知事实**。子代理看不到主会话历史，brief 必须自包含。

---

## 3. 核心采用（本轮建议先装这 2 个，其余已装）

### 3.1 `dsh-agent-skill` 0.3.0 — 路由/专家层（核心）

| 项 | 内容 |
|---|---|
| 设计思路 | 把“六个专家”做成六个**具名子智能体**，而不是六个完整 preset。每个专家有独立的模型、思考强度、工具白名单、技能清单、附加指令；主会话用 `delegate_agent` 按名字派活，或用 `/chief <任务>` 硬触发。 |
| 排版布局 | 左侧栏新增 **Agent & Skill**；面板两栏：左栏子智能体列表（名称/显示名/描述/启动方式/模型/思考强度/工具清单/技能/附加指令），右栏技能列表；对话里直接说“派给子智能体 X”。 |
| 编写逻辑 | 定义存 `<dshHome>/agent-skill/agents.json`，技能绑定存 `skills.json`；Host 半边注册 `delegate_agent`，用 `ctx.subagents` 起子会话；`ctx.tools.restrict` 收窄子代理工具面，`ctx.tools.guard` 执行时兜底拒绝；勾选的技能正文（合计 ≤24,000 字符）在子代理开跑前注入提示词；`/chief` 在 Host 侧直接启动 `chief` 子智能体，跳过模型判断。 |
| 兼容 | MIT；无 `engines.dsh` 上限；依赖 `ctx.subagents` / `ctx.tools` / `ctx.systemPrompt`，本机 rc.3 都有。 |
| 结论 | **采用。** 它是唯一同时做到“具名专家 + 硬工具白名单 + 按专家模型路由 + 技能按需注入”的插件；直接把 101 个工具的全集裁成每个专家 8–15 个，正好解决上下文被工具/技能淹没的问题。 |
| 缺口 | 没有任务队列/工作台/重试；主会话仍看到全部工具；子代理并行度取决于宿主 `ctx.subagents`。 |

> **后续核验修正（2026-11-25）**：原包 0.3.0 在 rc.3 上不可直接用——`startActivation` 仍是旧扁平 spec，rc.3 要 `request` 嵌套；且没有 `agentPreset`，子代理会继承调用者 preset，Reviewer 派 Characterization 会被 PM 权限矩阵拒绝。正式方案要求 **vendored `0.3.0-pm1`**（嵌套 request + `agentPreset` + `normalizeAgent` 保留字段）。这样六个 polymer preset 都能当协调者，子会话挂目标专家的 preset。

### 3.2 `@bushizhanghan/dsh-context-budget` 0.1.2 — 上下文审计（核心）

| 项 | 内容 |
|---|---|
| 设计思路 | 不注入任何提示词，只读会话日志，把每轮固定开销拆成 system / AGENTS.md / skill catalog / tools / runtime / team / history / other，并标记“内容没变却每轮重发”的纯浪费。 |
| 排版布局 | 4 个工具输出表格：`ctx_budget`（单会话）、`ctx_budget_sweep`（全会话排序）、`ctx_budget_skills`（技能目录治理）、`ctx_budget_tools`（工具 schema 膨胀）。无侧栏页面。 |
| 编写逻辑 | 读 `<workspace>/session-<uuid>/session.v4.jsonl`（UTF-16LE BOM / UTF-8 都见过）；`request/header` 累加 tools schema，`system/message` 算 system，`source.kind=skill-catalog` 算 skills；token 估算 CJK 按 1 字符≈1 token；重复块按长度+头尾 32 字符签名判浪费；未识别 source.kind 归 `other` 不静默丢弃。 |
| 兼容 | MIT；Node ≥22；零依赖；只读，无工具名冲突。 |
| 结论 | **采用。** 它把“为什么 101 工具/242 技能会让小模型胡言乱语”变成可量化报告；装完先跑一次，决定每个专家白名单裁到多少。 |
| 缺口 | 只诊断，不自动裁剪；需要人根据报告改 `agent-skill` 白名单/技能清单。 |

### 3.3 已装但需要明确角色的三个

| 插件 | 角色 | 现状 | 备注 |
|---|---|---|---|
| `dsh-kb-rag` 1.6.8 | 论文证据 KB | 已装；16 文档/841 块/743 向量 | 10 工具；`kb_fetch(ingest=true)`、`kb_search`、`kb_rag`；无浏览页；打包 Python 的 numpy ABI 使向量/精排降级关键词 |
| `dsh-cognition-engine` 0.14.0 | 记忆 + RSI | 已装；记忆 0/准则 0（测试后清理） | 9 工具；侧栏「认知引擎」；双时态/反思/准则本；本地已打 POST/CPE 补丁 |
| `dsh-lit-library` 0.2.1 | 文献项目索引 | 已装；8 工具 + 技能 | 一课题一项目区，一篇一行索引，摘录逐字回查；无 UI，索引是 Markdown 总表 |

---

## 4. 可选增强（按需，不先装）

| 插件 | 版本/许可 | 设计/布局/逻辑 | 适合什么时候加 | 结论 |
|---|---|---|---|---|
| `dsh-zotero-local` | 0.4.0 / MIT / dsh ≥0.2.0-rc.1 | 17 个 `zotero_*` 工具；Zotero 本地 API 23119；全文缓存、PDF 批注、笔记、`zotero_retrieve` 段落级检索、`zotero_digest`；不复制文献库，Zotero 仍是权威 | 你的非 OA PDF 主要放在 Zotero，且希望 agent 直接检索/读全文/写批注 | **推荐加**（若 Zotero 是主库）；代价是 +17 工具，只给 Literature 子代理白名单，主会话可先不启用 |
| `dsh-lit-harvest` | 0.1.2 / Apache-2.0 / dsh ≥0.2.1-0 | 4 工具：`lit_search` 扇出 OpenAlex/Crossref/arXiv/Europe PMC，`lit_resolve_oa` 查 Unpaywall，`lit_sufficiency` 配额/子主题覆盖，`lit_harvest_run` 有界循环；5 个主机白名单、拒绝重定向、按主机串行 | 你要做系统综述/覆盖度审计，怕漏检 | **推荐加**（Literature 子代理专用）；不下载 PDF，只给 OA 链接和 gaps |
| `@a9i5k4/dsh-literature` | 0.3.6 / MIT / 无 dsh 约束 | 侧栏「文献」；内置文献库 + PDF 阅读器 + OA 多源下载 + 自定义机构源（可带 header）+ 每 30s 自动扫描新 PDF + 引用生成 + 全文 AI 问答；付费墙只提示登录/导入，不绕过 | 你想要一个**可浏览的文献库/阅读器**，且愿意让它成为第二个文献库 | **试点**；与 `lit-library`/`kb-rag` 存储重叠，先别和它们同时做“唯一真相” |
| `dsh-literature-lab` | 0.2.4 / MIT / 无 dsh 约束 | 侧栏「文献实验室」5 页：总览/雷达/AI 分析/阅读/设置；7 渠道采集、3 层 AI 筛选（摘要→初筛→精读）、OA 原文下载、Zotero 入库、每日额度；自动采集与自动分析分离，默认自动分析关 | 你要“每天自动盯新文献 + 三层筛选”的流水线，而不是单次检索 | **试点**；与 PM `pm_literature_*` 功能重叠，选一个做自动化，另一个做按需 |
| `@58catmiao/dsh-sciwork` | 0.4.10 / MIT / Node≥20 | 新增 `research` preset「科研模式」；侧栏「科研库」；课题/图表/数据/草稿/文献/期刊档案/投稿七段；Python `research.py` + 登记索引；6 技能；12 份期刊规范；Origin 出图需另装 `dsh-origin-plugin` | 你要“数据→图→写作→投稿”的科研项目库，且已装 Origin | **试点**；不是高分子专用，和 PM workbench 有概念重叠 |
| `dsh-python-env` | 0.1.2 / MIT / Node≥20 | 封装 venv 创建/安装/运行；工具内部自动镜像路由；严格读写权限 | 你要把 LAMMPS/GROMACS/自写 Python 模拟放进可复现 venv | **推荐加**（模拟子代理专用） |
| `dsh-preview-stl` | 0.1.1 / MIT / Node≥22 | 右栏预览 STL；WebGL 尺寸/体积/表面积/水密统计；无 agent 工具 | 模拟输出是 STL/3D 网格，需要人眼检查 | **可选**；零工具，低冲突 |
| `dsh-progress-nudge` | 0.3.0 / MIT / dsh ≥0.2.0-rc.2 | 统计“只调工具不说话”的轮数，在下一请求边界插入过程汇报提醒；设置页可调阈值/文案/是否统计子代理 | 长时间模拟/下载时 agent 沉默循环 | **可选**；无工具，纯提示，低冲突 |
| `dsh-second-opinion` | 0.1.0 / MIT / Node≥22 | 独立“顾问”会话；`ask_advisor` / `advisor_status` / `advisor_watch` / `advisor_note`；不冒充用户、不唤醒闲置会话 | Reviewer 卡住或需要第二意见 | **可选**；与 reviewer 概念重叠，按需用 |
| `dsh-doc-router` | 0.6.3 / MIT / dsh ≥0.2.0-rc.1 或 ≥0.2.1-rc.1 | `doc_route` 按魔数嗅探格式 + PDF 文本层/分栏检测；`pdf_markdown` 用 PyMuPDF 按分栏阅读顺序转 Markdown | 复杂双栏/扫描 PDF，`pm_literature_read` 抽不干净 | **可选**；与 kb-rag 的 PDF 解析重叠，按 PDF 质量选用 |
| `dsh-answer-reviewer` | 0.7.7 / MIT / Node≥18 | 每轮最终回答由独立 LLM 打 1–100，低于阈值带反馈重试；角标显示通过/未达标 | 你要“每轮自动质检”而非只靠 reviewer 子代理 | **可选**；与科学 gate/reviewer 重复，先不上 |
| `dsh-force-collab` | 0.1.0 / MIT | 输入框左侧选 0–6 个子 Agent；`collab_fanout` 无数量参数，必须拆给正好这么多子 Agent 并行，主 Agent 汇总 | 你要“强制并行”而非模型自觉 | **可选**；没有具名专家/工具白名单，和 agent-skill 二选一 |
| `dsh-origin-bridge` | 0.4.19 / 无 dsh 约束 | 27 个 MCP 工具驱动本机 Origin/OriginPro：导入 csv/dat/bin、绘图、样式、拟合、导出 PNG/TIF/SVG/PDF + .opju；读回验证 | 你本机有 Origin，且要出版级图 | **可选**；需 Origin 授权；工具多，只给绘图子代理 |
| `@bushizhanghan/dsh-openfoam-doctor` | 0.1.6 / MIT | 6 个工具体检 OpenFOAM 算例 25 类静默错误 | 你本机有 OpenFOAM，且做流场/加工模拟 | **可选**；无 OpenFOAM 不装 |
| `dsh-sw-cad` | 1.5.0 / MIT | 2 个 MCP 驱动 AutoCAD/SolidWorks + 2 技能 + 交付检查 | 你要 CAD 几何/模具 | **可选**；非高分子专用 |

---

## 5. 明确不采用（以及为什么）

| 插件 | 原因 |
|---|---|
| `dsh-lit-fetch` 1.0.8 | **Sci-Hub 优先**，遍历 8 个镜像抓 PDF；这是侵权/合规风险，不是“非 OA 下载”的合法方案。**明确拒绝，不安装。** |
| `dsh-mini-superagent` 0.10.4 | 任务派发/工作台/队列/10 工具很好，但**没有 per-agent 工具白名单**，子会话继承全部 101 工具，正好放大上下文问题；与 `agent-skill` 同层冲突。作为 B 方案备选，不并行装。 |
| `@wjj865-code/dsh-orchestrator` 0.33.1 | `engines.dsh >=0.2.2-rc.2`，本机 0.2.1-rc.3 不满足；硬装要 `allow-version`，API 风险高。 |
| `dsh-expert` 0.5.28 | 636 位专家、10MB、`summon_t_expert` 子代理；对“六个高分子专家”是过度供给，专家市场会重新把技能/人设灌进上下文。 |
| `dsh-armory` 2.5.11 | 军械库管理 UI：MCP/技能/429 专家/19 万技能市场；工具裁缝很有用，但“一键装技能”会重新制造 242 技能目录问题。只取工具账本思路，不整包装。 |
| `dsh-multi-model-orchestrator` 0.2.2 | 只是注入“拆解 + `subagent` 带 provider/model”的提示，并加 token 统计；`agent-skill` 已能给每个专家单独设模型，功能重复；还需额外 GLM/Kimi/Qwen 路由和 key。 |
| `@creait/dsh-research-mode` 0.2.0 | 是一个独立 preset「Research mode」，不是可被总工调用的工具；`deep_research` 循环很好（计划→自适应并行→综合→对抗审阅），但没有 PM 工具/KB/模拟，子代理继承同一 composition。**作为“深度研究循环”的模板研究，不作为核心装。** |
| `dsh-vibe-math` 2.8.5 | 数学多代理 preset（院士/研究员/CAS）；架构值得学，领域不匹配，preset 重。 |
| `dsh-atn` 0.7.0 / `dsh-agentdeck` 0.3.1 / `@starsharryzhu/dsh-assistant` 0.3.1 / `dsh-dev-plan-presets` 0.4.0 / `@suifei/dsh-pmo-button` 0.13.3 / `@michengai/dsh-pua` 0.1.13 / `clearai-dsh` 0.6.0 / `dsh-living` 0.3.14 | `engines.dsh` 要求 ≥0.2.2-rc.x / ≥0.2.1-rc.5，本机 rc.3 不满足；不硬豁免。 |
| `dsh-moa-native` 4.6.4 | MoA 参考模型并行 + 聚合，token 成本高；对“总工+六专家”是重复的模型编排层。 |
| `dsh-answer-reviewer` | 每轮独立 LLM 评分，和 PM 科学 gate + reviewer 子代理重复；先不上。 |
| `dsh-knowledge-base` 0.1.5 | 通用 FTS5 文件库，无 RAG/DOI 下载；和 kb-rag 同层重叠，已退役。 |
| `@weibaohui/dsh-kb` 0.7.19 | 团队 KB：raw 自动入队 + bot 串行蒸馏 + 月度 lint；适合 SOP/团队 wiki，不是论文证据库；会引入第二套 KB/bot 会话。 |
| `dsh-kb-lite` 0.4.13 | 6 工具、目录即 KB、BM25/可选 dense；无 UI，和 kb-rag 功能重叠。 |
| `dsh-molecular-viewer` 0.2.4 | 蛋白结构查看/比对，`engines.dsh >=0.2.2-rc.5`，不是高分子链/MD。 |
| `dsh-science-workbench` 0.3.1 | 基因/生物信息工作台，9 个 `bio_*` 工具，不是高分子。 |
| `dsh-matlab-runner` 0.2.4 | 还是 MATLAB；你刚移除 MATLAB 桥。 |
| `multisim-mcp-dsh-plugin` 1.3.1 | 电路仿真，不是高分子。 |
| `dsh-memory-tiers` / `sage-mem` / `dsh-memtree` / `dsh-auto-memory` / `dsh-hermes-memory` / `dsh-hy-memory` / `dsh-memory-palace` | 都是记忆层；和 cognition 同层冲突。多装会多次注入/抢占，先只用 cognition；真要换，做 A/B 替换，不叠加。 |
| `dsh-lit-fetch` 之外的“Sci-Hub/破解”类 | 不列举、不安装；付费墙只走机构/浏览器/Zotero/文献传递。 |

---

## 6. 冲突矩阵（同层互斥，跨层独立）

| 同层 | 冲突点 | 解决 |
|---|---|---|
| `agent-skill` vs `mini-superagent` vs `orchestrator` vs `expert` vs `armory` 专家召唤 | 都在做“主 → 子代理/专家” | **只选 `agent-skill`**；`mini-superagent` 作为 B 方案；其余不装 |
| `agent-skill` vs `multi-model-orchestrator` | 都在做子代理模型路由 | `agent-skill` 每个专家可设 provider/model；不装 multi-model |
| `kb-rag` vs `knowledge-base` vs `kb-lite` vs `weibaohui-kb` | 都是知识库 | **只选 `kb-rag`**（论文证据）；`weibaohui-kb` 只在你要团队 SOP wiki 时单独试点 |
| `lit-library` vs `a9i5k4-literature` vs `litbench` vs `paper-reader` | 都是文献库/阅读器 | `lit-library` 做项目索引；阅读器最多选一个，先不装；`kb-rag` 做证据 |
| PM `pm_literature_*` vs `literature-lab` vs `lit-harvest` | 都是检索/筛选/下载 | PM 做按需 + 机构下载 + 自动入库；`lit-harvest` 只做覆盖度审计；`literature-lab` 只在要每日雷达时试点 |
| PM `pm_sim_*` vs `origin`/`openfoam`/`molecular-viewer` | 都是模拟/分析 | PM 是高分子解析模拟主层；Origin/OpenFOAM 只在有对应软件时作为“出图/算例”工具；molecular-viewer 不装 |
| `context-budget` vs `armory` 工具裁缝 | 都统计工具/skill token | 先只装 `context-budget`（只读、4 工具）；`armory` 的管理 UI 暂不装 |
| `second-opinion` vs `answer-reviewer` vs reviewer 子代理 | 都是复核 | PM reviewer + gate 是主；`second-opinion` 作为“卡住时”可选；`answer-reviewer` 先不上 |

**跨层独立**：`context-budget`（只读）、`progress-nudge`（提示）、`preview-stl`（渲染）、`doc-router`（PDF 工具）、`python-env`（venv）没有工具名冲突；但仍要逐个装、逐个 boot smoke，不能一次全加。

---

## 7. 缺口清单（插件补不上的部分）

| 缺口 | 严重度 | 现状 | 要做什么 |
|---|---|---|---|
| 合法非 OA 全文 | 高 | PM browser 用真实浏览器 + 机构 IP；Zotero 可存；无 SSO 自动化 | 建“校园会话”Chrome profile；人工登录 CARSI/机构；登录后 browser 下载 → 自动 `kb_ingest`；无权限时生成 manual manifest/文献传递 |
| 高分子 MD/COMSOL 适配 | 高 | 只有 `pm_sim_md_run`（需 LAMMPS）；无 GROMACS/COMSOL 插件 | 建 `polymer-sim` 服务：LAMMPS 输入生成/运行/解析（Rg、应力、Tg）、GROMACS 适配、COMSOL 导出接口；先 LAMMPS |
| 路由 + 队列 + 工具白名单三合一 | 高 | `agent-skill` 有白名单无队列；`mini-superagent` 有队列无白名单 | 先 `agent-skill` + PM 任务账本 + route 技能；吞吐不够再评估 mini-superagent 或自研薄队列 |
| 总工仍看到 101 工具 | 中高 | `agent-skill` 只收窄子代理，不收窄主会话 | 总工换强模型；`context-budget` 定期审计；必要时做“总工 preset”只挂 delegation/todo/PM 读工具 |
| 跨专家共享工作记忆 | 中 | cognition 全局可共享，但子代理各自上下文 | 用 PM 证据/假设/机理 + KB 作为共享真相；子代理 brief 带证据 ID；`cognition_recall` 按 tags 召回 |
| 自动 EDA/统计检验选择 | 中 | PM 工具有拟合/分析，但无自动 EDA | 写 `data-analysis` 技能 + Python 脚本模板；输出图表 + `pm_analysis_report` |
| 期刊格式/投稿 | 中 | PM 报告是 HTML/MD；sciwork 有 12 期刊规范但依赖 Origin | 先 PM 报告；要投稿再试点 `sciwork` + Origin bridge |
| KB 向量在打包 Python 下降级 | 中 | 743 向量存在，但 numpy ABI 报错，BM25 兜底 | 加 `KB_RAG_PYTHON` 指向可用 Python；或打包 torch/numpy 环境（~1GB）；否则接受关键词 |
| 论文自动入库只覆盖 PM 下载 | 中 | PM 下载 → `kb_ingest` 已通；其它下载器不自动 | 统一走 PM `pm_literature_download`/browser；Zotero 用 `kb_zotero` 批量迁移；不要把 `lit-fetch` 接进来 |
| 模拟作业队列/可视化 | 中 | PM 工具同步调用；无队列/进度/STL 面板 | 先 `python-env` + `preview-stl` + `progress-nudge`；后续自研 sim job wrapper |

---

## 8. 集成后能实现什么（端到端例子）

用户说：**“查 PVA 热定型温度对结晶度和取向的影响，解释机理，并给出下一步实验。”**

1. **总工**识别：文献 + 机理 + 表征 + 模拟，四项并行拆给四个专家。
2. **Literature**：`pm_literature_search` / `lit-harvest` 检索；`pm_literature_screen` 分级；OA 用 `pm_literature_download`，非 OA 用 `pm_literature_browser_download`（校园会话）；成功即 `kb_ingest`；精读 `zotero`/`pm_literature_read`。
3. **Characterization**：`pm_waxs_pro` / `pm_hermans_analyze` 算 Xc/f；`pm_evidence_record` 登记条件、单位、极性。
4. **Physicist**：`pm_hypothesis_propose` 列竞争假设（热历史→成核→Xc→双折射；或应力诱导取向→Xc）；`pm_mechanism_query` 查已有边；指出缺失观测。
5. **Modeler**：`pm_sim_crystallization`（Avrami）或 `pm_sim_flory_huggins`；`pm_model_fit` 拟合；`pm_experiment_plan` 给 factorial 矩阵与 n/power。
6. **Reviewer**：`pm_gate_check` + `pm_evidence_verify`；检查竞争假设是否排除、证据极性、单位；必要时 `second-opinion`。
7. **总工**汇总；`pm_analysis_report` 生成 HTML/MD；要投稿再 `sciwork`/Origin。
8. **cognition** 把“这次判别设计有效/无效”蒸馏成准则；KB 留论文与数据；PM 账本留证据链。

**能实现的**：一条可审计的“文献→KB→机理→数据→模拟→门控→报告”闭环；每个专家只带自己的工具/技能/模型；证据 ID 可回溯；模拟结果可进账本。

**不能只靠插件实现的**：无授权付费墙全文、无 LAMMPS/GROMACS/COMSOL 适配、无高分子机理本体、无自动 EDA、无自动投稿。这些是自研/外部软件/人工环节。

---

## 9. 分阶段安装建议

**Phase 0（先做，不装新插件）**
- 跑 `context-budget` 的 4 个工具（如果先装它）；或先用现有日志估算。
- 目标：确认总工具 101、技能 28 的每轮固定成本；决定总工/每个专家的白名单上限。

**Phase 1（核心路由，先装 2 个）**
1. `dsh-agent-skill@0.3.0`
2. `@bushizhanghan/dsh-context-budget@0.1.2`
- 配六个具名专家：scientist/physicist/characterization/modeler/literature/reviewer。
- 每个专家：模型（强/快）、思考强度、工具白名单（8–15）、技能（≤6）、附加指令。
- 写 `polymer-chief-route` 技能：决策表 + brief 四段 + 输出 schema。
- 门：`/chief` 试点；boot smoke；`delegate_agent` 六个专家各跑一次“你是谁/你能做什么”确认工具面。

**Phase 2（文献线，按需 1–2 个）**
- 若 Zotero 是主库：`dsh-zotero-local@0.4.0`（只给 Literature 专家白名单）。
- 若要做系统综述覆盖度：`dsh-lit-harvest@0.1.2`（只给 Literature 专家）。
- `kb-rag` 已装；先修 `KB_RAG_PYTHON` 或用关键词兜底；`pm_kb_note` 已做手动入库。
- **不装 `dsh-lit-fetch`（Sci-Hub）**。

**Phase 3（模拟/数据线，按需）**
- `dsh-python-env@0.1.2`（Modeler 专用）。
- `dsh-preview-stl@0.1.1`（零工具，右栏预览）。
- 外部 LAMMPS（`PM_LAMMPS_HOME`）；`pm_sim_md_run` 才有意义。
- 自研 `polymer-sim` 服务：LAMMPS 输入生成/运行/解析 + 证据登记。
- 要投稿/Origin：`dsh-origin-bridge@0.4.19` + `sciwork` 试点；否则不上。

**Phase 4（质量/运维，按需）**
- `dsh-progress-nudge@0.3.0`（长循环沉默）。
- `dsh-second-opinion@0.1.0`（reviewer 卡住）。
- `dsh-doc-router@0.6.3`（复杂 PDF）。
- `dsh-answer-reviewer@0.7.7`（每轮自动质检；先不上）。

---

## 10. 需要你拍板的一个问题

**总工放在哪一层？**

- **A. 主会话就是总工（推荐 v1）**：Polymer Scientist 主会话直接路由/派活；`agent-skill` 定义六个专家；`delegate_agent` 调用；主会话看到全部工具，但用强模型 + route 技能约束。成本最低、链路最短、最容易审计；风险是主模型可能“自己干”而不是派活。
- **B. 独立 chief 子智能体**：用 `/chief` 启动一个只带 `delegate_agent` + todo/PM 读工具的 chief 子会话；用户只跟 chief 对话，chief 再派六个专家。分工最干净、主会话不碰业务；多一跳、chief 的模型要强、嵌套子代理要确认 `agent-skill` 允许。
- **C. 外部队列编排（mini-superagent）**：任务队列/工作台/并发/报告回流最完整；但没有 per-agent 工具白名单，子会话继承全部工具，和 A 的 `agent-skill` 同层冲突；适合“批量吞吐优先”，不适合“科研可审计优先”。

我的建议：**先 A，跑通六个专家的白名单和 route 技能；如果主模型反复不派活，再升级 B；只有批量任务成为瓶颈时才评估 C。**

你选 A、B 还是 C？选完我再写设计文档和安装计划；本轮不装任何新插件。
