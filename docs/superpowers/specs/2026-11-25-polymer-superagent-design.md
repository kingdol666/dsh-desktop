# 高分子科研 Superagent 设计文档（A 模式：主会话即总工）

日期：2026-11-25  
状态：**已实现（2.3.0）**  
上位调查：[2026-11-25-polymer-superagent-plugin-survey.md](../../polymechanism/2026-11-25-polymer-superagent-plugin-survey.md)

## 1. 意图与为什么

现有 2.2.6 已有六个高分子专家 preset、36 个 PM 工具、论文 KB、文献索引、记忆/RSI、解析型高分子模拟。缺的不是更多工具，而是**一个可靠的分工层**：

- 主模型看到 101 个工具、28 个技能目录，容易被无关工具/技能淹没；
- 六个 preset 是“换人设”，不是“换工具面/换模型/换技能”，专家之间没有硬边界；
- 论文下载→KB→证据→机理→模拟→报告已有零件，但没有一个总工按任务把零件派给对应专家；
- 上下文成本没有可观测手段，无法判断哪个专家该裁到多少工具。

本设计采用 **A 模式：当前会话就是协调者，Polymer Scientist 是默认总工，但六个专家 preset 都能当协调者**。通过 `dsh-agent-skill` 定义五个具名执行专家；任何 preset 会话都可以用 `delegate_agent` 按 brief 派活；每个执行专家**以对应的高分子 preset 身份运行**（不是继承调用者 preset），因此权限矩阵、工具白名单、模型、技能都正确；结果回到调用会话，由调用者汇总到 PM 证据账本和报告。

> 关键修正：`dsh-agent-skill@0.3.0` 原版在 DSH 0.2.1-rc.3 上有两个问题：① `startActivation` 传的是旧扁平 spec，rc.3 要 `request` 嵌套；② 没有 `agentPreset` 字段，子代理会继承调用者 preset，导致 Reviewer 调 Characterization 时被 PM 权限矩阵拒绝。因此本方案要 **vendored patch** 该插件（见 §5.3），不是直接装 npm 原包。实现时又发现两个问题：③ 上游 `dsh.engines.dsh >= 0.2.2-rc.1` 会被 rc.3 拒绝；④ `collectSkills` 只扫文件系统根，bundled 与 pm-research 程序化技能解析不到。最终 vendored 版本为 `0.3.0-pm2`。

## 2. 目标 / 非目标 / 反目标

### 目标

1. **任意一个专家 preset 会话**都能把一个高分子子任务派给对应专家；Polymer Scientist 是默认总工，但 Reviewer 也能派 Characterization、Literature 也能派 Physicist。
2. 每个执行专家有**硬工具白名单**：例如 Literature 看不到 `pm_sim_*`，Reviewer 看不到写工具；同时执行专家以**自己的 preset 身份**运行，PM 权限矩阵按专家角色而不是调用者角色判定。
3. 每个执行专家有独立模型/思考强度；默认继承当前会话，后续可在面板改。
4. 论文下载成功后仍自动 `kb_ingest`；用户手动“把这段存入知识库”仍走 `pm_kb_note`。
5. 总工和专家共享 PM 证据账本、机理图谱、KB 和 cognition 记忆；不新增第二套真相。
6. 上下文成本可审计：装 `context-budget` 后能看见 system/skills/tools 的每轮开销。
7. 2.3.0 可直接覆盖安装并通过应用内更新拉取。

### 非目标

- 本轮不解决“合法非 OA 全文自动化”：付费墙必须机构/CARSI/浏览器人工登录；不接 Sci-Hub。
- 本轮不打包 LAMMPS/GROMACS/COMSOL；`pm_sim_md_run` 仍要求本机 LAMMPS。
- 本轮不新增第二套记忆、第二套 KB、第二套文献库。
- 本轮不做任务队列/并行工作台；先验证 `delegate_agent` 的串行/并行行为。
- 本轮不改六个 preset 的角色定位；只在每个 persona 末尾追加同一段“委派协议”，让六个 preset 都知道可以调 `delegate_agent`。

### 反目标（即使技术上能跑也算失败）

- 为了“全功能”把 20 个插件全装，工具数从 101 涨到 130+，小模型再次出现随机词汇。
- 只有 Polymer Scientist 能派活，其他五个 preset 仍然各自为战。
- 子代理继承调用者 preset，导致 Reviewer 派 Characterization 时被权限矩阵拒绝。
- 总工绕过专家自己干，专家白名单形同虚设。
- 种子覆盖用户已编辑的专家定义。
- 论文下载后没进 KB，或进的是第二个库。
- 发布包在 2.2.6 上覆盖安装进 Recovery。

## 3. 约束

- 运行时：DSH **0.2.1-rc.3**、Electron 44、Node 24；不得用 `allow-version` 硬装要求 ≥0.2.2-rc.x 的插件。
- 已有 shipped bundles：`dsh-zotero-skill`、`dsh-kb-rag`、`dsh-cognition-engine`、`dsh-lit-library`、`dsh-cite-verify`、`@perrylink/dsh-research-core`。
- 已退役：`memory-eternal`、`dsh-library`、`dsh-research-skills`、`dsh-knowledge-base`、`dsh-matlab-workbench`。
- `dsh-agent-skill` 的存储是 `<DSH_HOME>/agent-skill/agents.json`；本机 `DSH_HOME=~/.pmstudio`。
- 安全检查：不得把用户输入拼进 SQL/命令；种子只写 JSON；下载只走 http/https 且校验 host（现有 PM 工具已做）。
- 发布只做 Windows x64；安装包未签名；发布前需用户确认。

## 4. 方案选择

### A. 主会话即总工（选中）

主会话 = Polymer Scientist（总工），`dsh-agent-skill` 定义五个执行专家，`delegate_agent` 派活。总工仍看到全部工具，但 route 技能约束它“先派活”；执行专家被硬白名单裁剪。

- 优点：链路最短、成本最低、最容易审计；不需要新 preset/新路由模型；与现有 PM 账本/KB 直接衔接。
- 缺点：总工仍看到 106 个工具；依赖模型遵守 route 技能；没有任务队列。

### B. 独立 chief 子智能体

`/chief` 启动一个只带 `delegate_agent` + todo/PM 读工具的 chief 子会话；用户只跟 chief 对话，chief 再派五个专家。

- 优点：总工工具面最干净，分工最硬。
- 缺点：多一跳；chief 模型要强；嵌套子代理/工具继承需要实测；`agent-skill` 的 `/chief` 是硬触发，用户必须改习惯。

### C. 外部任务队列（mini-superagent）

`dsh-mini-superagent` 提供 `dispatch_*`、队列、工作台、报告回流。

- 优点：批量吞吐/并发/重试最完整。
- 缺点：没有 per-agent 工具白名单，子会话继承全部工具；与 A 的 `delegate_agent` 同层冲突；不适合“科研可审计优先”。

**结论**：先 A。若总工反复不派活，升级 B；只有批量任务成为瓶颈才评估 C。

## 5. 架构

```
用户
  │
  ▼
当前会话（任意专家 preset；Polymer Scientist 是默认总工）
  ├─ skills/polymer-chief-route（决策表 + brief 模板 + 输出契约）
  ├─ PM project / goal / todo / evidence（共享账本）
  ├─ delegate_agent(agent=…, prompt=brief)
  │
  ├─ physicist        → 子会话 preset polymer-physicist
  ├─ characterization → 子会话 preset polymer-characterization
  ├─ modeler          → 子会话 preset polymer-modeler
  ├─ literature       → 子会话 preset polymer-literature
  └─ reviewer         → 子会话 preset polymer-reviewer
  │
  ▼
PM 证据账本 + 机理图谱 + kb-rag + cognition
  │
  ▼
pm_analysis_report（HTML/MD）→ 调用者汇总 → 用户
```

**六个 preset 都能当协调者**：Scientist 派全部；Physicist 可派 Characterization/Modeler/Reviewer；Characterization 可派 Modeler/Physicist；Modeler 可派 Physicist/Characterization；Literature 可派 Physicist/Reviewer；Reviewer 可派 Characterization 补证据。子会话用**专家自己的 preset**，所以 PM 权限矩阵按专家角色判定，不按调用者判定。

### 5.1 角色与工具白名单（种子定义）

> 工具名以启动时 `ctx.get('tools').schemas()` 实际存在者为准；种子会过滤缺失项并记录。每个专家 `maxDepth: 1`（rc.3 的绝对深度上限：根会话的子代理深度为 1，0 会直接拒绝创建），不能再派子代理；`mode: spawn`；`agentPreset` 是子会话真正挂载的 preset。

| Agent | 中文名 | 子会话 preset | 工具白名单（核心） | 技能 | 输出契约 |
|---|---|---|---|---|---|
| `physicist` | 高分子物理学家 | `polymer-physicist` | `pm_hypothesis_propose`、`pm_mechanism_query`、`pm_mechanism_propose_edge`、`pm_evidence_query`、`pm_knowledge_query`、`pm_sim_chain_mechanics`、`pm_sim_rubber_elasticity`、`pm_sim_viscoelastic`、`pm_sim_chain_stats`、`pm_sim_flory_huggins`、`pm_sim_tg_blend`、`pm_sim_diffusion`、`pm_model_fit`、`pm_experiment_plan`、`read`、`grep`、`pwsh`、`todo_write`、`cognition_context`、`cognition_recall` | `polymer-physics`、`mechanism-discovery`、`simulation-workflow` | JSON：`findings[]`、`hypotheses[]`、`evidenceIds[]`、`gaps[]`、`nextActions[]` |
| `characterization` | 表征分析专家 | `polymer-characterization` | `pm_waxs_analyze`、`pm_ftir_analyze`、`pm_saxs_analyze`、`pm_hermans_analyze`、`pm_waxs_pro`、`pm_sim_crystallization`、`pm_model_fit`、`pm_evidence_record`、`pm_evidence_query`、`pm_analysis_report`、`pm_knowledge_propose`、`read`、`write`、`grep`、`pwsh`、`todo_write` | `waxs-analysis`、`ftir-analysis`、`saxs-analysis`、`waxs-pro-processing`、`optics-birefringence` | JSON：`measurements[]`、`conditions[]`、`evidenceIds[]`、`fitQuality`、`gaps[]` |
| `modeler` | 建模与仿真专家 | `polymer-modeler` | `pm_sim_chain_mechanics`、`pm_sim_rubber_elasticity`、`pm_sim_viscoelastic`、`pm_sim_chain_stats`、`pm_sim_crystallization`、`pm_sim_flory_huggins`、`pm_sim_tg_blend`、`pm_sim_diffusion`、`pm_sim_md_run`、`pm_model_fit`、`pm_experiment_plan`、`pm_analysis_report`、`read`、`write`、`pwsh`、`todo_write` | `simulation-workflow`、`polymer-physics`、`experiment-design` | JSON：`model`、`parameters`、`goodnessOfFit`、`predictions[]`、`limits[]` |
| `literature` | 文献情报专家 | `polymer-literature` | `pm_literature_read`、`pm_literature_extract`、`pm_literature_search`、`pm_literature_screen`、`pm_literature_download`、`pm_literature_browser_download`、`pm_kb_note`、`kb_ingest`、`kb_search`、`kb_rag`、`kb_stats`、`lit_find`、`lit_import`、`lit_check`、`read`、`write`、`todo_write`、`cognition_context`、`cognition_recall` | `literature-review`、`lit-library`、`kb-grounded-answer` | JSON：`papers[]`（DOI/标题/年份/分区）、`quotes[]`（逐字+页码）、`evidenceIds[]`、`gaps[]` |
| `reviewer` | 独立评审专家 | `polymer-reviewer` | `pm_gate_check`、`pm_evidence_verify`、`pm_evidence_query`、`pm_knowledge_query`、`pm_knowledge_review`、`read`、`grep` | `scientific-review`、`mechanism-discovery` | JSON：`verdict`（pass/revise/reject）、`violations[]`、`missingEvidence[]`、`requiredChanges[]` |

**调用者（任意 preset 会话）**：保留自己 preset 的工具面；用 `delegate_agent` 派活。调用者不直接做其他专家的细节；子会话用专家自己的 preset，权限/工具面由专家角色决定。

### 5.2 路由技能 `polymer-chief-route`

新增 `skills/polymer-chief-route/SKILL.md`，**六个 preset 都能用**。内容：

1. 决策表（同调查报告 §2），并对“非总工 preset”给出可派对象：
   - Physicist 可派 characterization / modeler / reviewer；
   - Characterization 可派 physicist / modeler / reviewer；
   - Modeler 可派 physicist / characterization / reviewer；
   - Literature 可派 physicist / reviewer；
   - Reviewer 可派 characterization 补证据、派 physicist 复核机理。
2. brief 四段：目标、约束、验收、已知事实；要求 200–800 字，自包含。
3. 输出契约：专家必须返回 JSON，调用者只接受带 `evidenceIds` 的结论。
4. 升级规则：
   - 专家 `blocked` → 调用者补数据/换专家/问用户；
   - 两个专家结论冲突 → 派 reviewer 裁决；
   - 需要新观测 → 派 physicist/modeler 设计判别实验；
   - 文献无命中 → literature 明确“库内无证据”，不得编造。
5. 禁止：调用者不得把专家结果改写成没有证据 ID 的“事实”；专家不得调用 `delegate_agent`（白名单不含）。

**六个 preset 的 persona 末尾追加同一段委派协议：**

```
Delegation protocol (all polymer experts): when a task belongs to another
polymer specialty, call delegate_agent with the matching expert name
(physicist / characterization / modeler / literature / reviewer) and a
self-contained brief; use the polymer-chief-route skill for routing and the
JSON output contract. The child runs under that expert's own polymer preset.
Do not do another expert's specialty work yourself.
```

### 5.3 `dsh-agent-skill@0.3.0` vendored patch（rc.3 必需）

原包在 rc.3 上有两个硬问题，必须 vendor patch（`vendor/dsh-agent-skill/`，MIT）：

1. **`startActivation` 形状不对**：原包传扁平 `{provider,label,childId,parent,prompt,signal,delivery,...}`；rc.3 的 `SubagentActivationSpec` 要求
   `{provider,label,childId,request:{parent,prompt,cwd?,agentOptions?,agentPreset?,maxDepth?},signal,delivery}`。
   原包在 rc.3 会在 `spec.request.maxDepth` 处抛错。补丁改为嵌套 `request`。
2. **没有 `agentPreset`**：子代理继承调用者 preset，Reviewer 派 Characterization 会被 PM 权限矩阵拒绝。补丁在 agent 定义增加可选 `agentPreset`，并在 `startActivation.request` 里传；子会话挂载对应 `polymer-*` preset。
3. `normalizeAgent` 保留 `agentPreset` 字段（原版会丢弃未知字段），面板保存不覆盖种子值。
4. `dsh.engines.dsh` 降为 `>=0.2.1-rc.3`；`collectSkills` 先读 `ctx.skills.list()/get()`，再回退文件系统根。
5. 版本：`dsh-agent-skill@0.3.0` 重新打包为 `dsh-agent-skill-0.3.0-pm2.tgz`；`package.json` 依赖用 `file:../vendor/...`；README 记录补丁与上游回退条件。

rc.3 的 in-process spawn provider 已声明 `capabilities.agentPreset: true`；仍要在启动时探测，不支持则记录并回退“继承调用者 preset”，但该回退不满足跨 preset 权限，需在验收中显式失败。

### 5.4 种子机制

`dsh-agent-skill` 没有“随包分发 agent 定义”的配置，只读 `<DSH_HOME>/agent-skill/agents.json`。因此新增 **幂等种子**：

- 新文件 `dsh-plugin-desktop/src/agent-team-seed.ts`：
  - `buildAgentTeam(availableTools: string[], availableSkills: string[]): AgentTeamSeed`（每个 agent 含 `agentPreset`）
  - `seedAgentTeam(homeDir: string, availableTools: string[], availableSkills: string[], logger?): {created:boolean; path:string; agents:string[]}`
- 在 `main.ts` 的 Host `boot` **之前**调用（`DSH_HOME` 已确定、工具/技能尚未注册）：
  - `dsh-agent-skill` 在 `apply` 时读取 store；boot 后再写会让第一轮 `delegate_agent`
    目录为空，所以种子必须先落盘；
  - 种子携带 blueprint 的完整工具/技能名，boot 后只做只读审计，报告注册表缺失项；
  - 如果 `agents.json` 不存在或 `agents` 为空 → 写种子；
  - 如果存在且非空 → 不动，只记录 `skipped existing`；
  - 写入前对旧文件 `.bak-<timestamp>`（如果存在但为空/损坏）；
  - 原子写：临时文件 + rename；JSON 2 空格缩进。
- 种子只写 `agents.json`，不写 `skills.json`/`bindings.json`（技能正文由 `agent-skill` 从注册表或文件系统读取；如果 selected skill 不存在，agent-skill 会跳过）。
- 每个 agent 写 `agentPreset`（`polymer-physicist` / `polymer-characterization` / `polymer-modeler` / `polymer-literature` / `polymer-reviewer`）；vendored patch 的 `normalizeAgent` 保留该字段。
- 工具过滤：白名单中不存在的工具在 boot 后审计并记录；如果某专家过滤后少于 3 个工具，则不创建该专家并记录错误（避免“全工具”回退）。

### 5.5 上下文审计

`@bushizhanghan/dsh-context-budget` 只读，4 个工具。装后在总工会话跑：

- `ctx_budget`：看 system/skills/tools/history 构成；
- `ctx_budget_tools`：确认新增 `delegate_agent` + 4 个审计工具后的 schema 成本；
- `ctx_budget_skills`：确认 28 + `polymer-chief-route` 的技能目录成本；
- 目标：专家白名单 8–15 工具；总工不超过 110 工具；技能目录 ≤ 32 个。

### 5.6 本轮插件范围

**2.3.0 只新增两个插件：**

1. `dsh-agent-skill@0.3.0-pm2`（MIT；vendored：rc.3 嵌套 request + `agentPreset` + 技能注册表；见 §5.3）
2. `@bushizhanghan/dsh-context-budget@0.1.2-pm1`（MIT；Node ≥22；只读；修 output schema）

**不进入 2.3.0 的插件**（避免同层冲突/工具膨胀）：
`dsh-zotero-local`、`dsh-lit-harvest`、`dsh-python-env`、`dsh-preview-stl`、`dsh-progress-nudge`、`dsh-second-opinion`、`dsh-doc-router`、`dsh-sciwork`、`dsh-origin-bridge`、`dsh-openfoam-doctor`。
它们作为 Phase 2，按 `context-budget` 实测结果逐个加；每个都是新 release，不混在 2.3.0。

**明确不装**：`dsh-lit-fetch`（Sci-Hub）、`dsh-mini-superagent`（C 方案）、`dsh-expert`、`dsh-armory`、`dsh-multi-model-orchestrator`、`@creait/dsh-research-mode`、`dsh-vibe-math`、`dsh-memory-tiers`/`sage-mem`/`memtree`/`auto-memory`/`hy-memory`、`dsh-knowledge-base`、`@weibaohui/dsh-kb`、`dsh-molecular-viewer`、`dsh-science-workbench`、`dsh-matlab-runner`、`multisim`。

## 6. 数据流

```
论文下载（PM OA/browser）
  → data.path
  → kb_ingest
  → kb_search / kb_rag
  → literature 专家返回 quotes + DOI + evidenceIds
  → 总工派 characterization/physicist/modeler
  → pm_evidence_record / pm_hypothesis_* / pm_sim_*
  → reviewer pm_gate_check
  → pm_analysis_report
```

手动“把这段存入知识库”：

```
总工或 literature → pm_kb_note(text,title,tags)
  → literature/notes/<time>-<slug>.txt
  → kb_ingest
  → kb_search 复核
```

记忆：

```
cognition_remember（经验/偏好/验收口径）
  → cognition_recall / cognition_context
  → 总工注入；专家可按 tags 召回
```

## 7. 失败模式

| 失败 | 处理 |
|---|---|
| `agent-skill` 在 rc.3 不兼容 | 先在 pilot profile 装包 boot；失败则不进入 release，回退到“仅 route 技能 + preset”方案 |
| 种子写坏/覆盖用户定义 | 只在不存在或空时写；旧文件备份；单测覆盖幂等与不覆盖 |
| 白名单工具名不存在 | 启动时过滤 + 日志；过滤后 <3 个则不建该专家 |
| 总工仍自己干 | route 技能 + 明确“先派活”；在验收里用会话记录检查是否调用 `delegate_agent` |
| 专家返回散文 | systemPrompt 强制 JSON 输出契约；总工只接受带 `evidenceIds` 的结论 |
| 专家递归派活 | 白名单不含 `delegate_agent`；`maxDepth: 1`（子代理再派会到深度 2，超限） |
| 工具数膨胀 | 2.3.0 只加 5 个工具（1 delegate + 4 budget）；context-budget 验收 |
| KB 向量降级 | 已知限制；不阻塞 2.3.0；Phase 2 加 `KB_RAG_PYTHON` |
| 发布网络受限 | 后台重试；本地同字节 Setup 兜底；记录真实情况 |

## 8. 验收标准（可测试）

1. `yarn build` EXIT=0；`verify:profile` EXIT=0。
2. 全局工具注册表含 `delegate_agent`、`ctx_budget`、`ctx_budget_sweep`、`ctx_budget_skills`、`ctx_budget_tools`。
3. 技能注册表含 `polymer-chief-route`；`polymer-chief-route` 文件存在且包含五个 agent 名称。
4. 首次启动后 `~/.pmstudio/agent-skill/agents.json` 存在，含 5 个 agent（physicist/characterization/modeler/literature/reviewer），每个 `tools` 是数组且长度 3–20；`maxDepth=1`；`agentPreset` 分别为 `polymer-*` 五个专家 preset。
5. 第二次启动不覆盖：记录文件 mtime/hash 不变；手工改一个字段后重启仍保留。
6. `Agent & Skill` 面板显示 5 个专家；每个专家的工具清单与设计表一致（缺失项已过滤并记录）；面板保存后 `agentPreset` 不丢。
7. **跨 preset 委派矩阵**（每个调用者都能派一个外部专家，子会话 header `agentPreset` 等于目标专家 preset）：
   - `polymer-scientist` → literature（target `polymer-literature`）
   - `polymer-physicist` → characterization（target `polymer-characterization`）
   - `polymer-characterization` → modeler（target `polymer-modeler`）
   - `polymer-modeler` → physicist（target `polymer-physicist`）
   - `polymer-literature` → reviewer（target `polymer-reviewer`）
   - `polymer-reviewer` → characterization（target `polymer-characterization`）
8. 子代理工具/权限隔离：literature 不能调用 `pm_sim_*`；reviewer 不能调用 `write`/`pm_hypothesis_transition`；characterization 能调用 `pm_waxs_pro`/`pm_evidence_record`。
9. `ctx_budget_tools` 报告总工具数 101 + 5 = 106；专家工具数 ≤20。
10. 真实最小链路：literature `kb_search` → characterization `pm_waxs_pro`（样本 CSV）→ physicist `pm_hypothesis_propose` → reviewer `pm_gate_check` → 调用者 `pm_analysis_report`；每一步有工具返回，不模拟。
11. 安装包 2.3.0：覆盖 2.2.6 首次启动正常；应用内检查到 2.3.0；下载/安装后版本 2.3.0；`/pm/health` 工具数 36（PM 不变），全局 106。

## 9. 待定/风险

- **`agent-skill@0.3.0` 原包与 rc.3 不兼容**：扁平 `startActivation` 会在 `spec.request.maxDepth` 抛错；必须用 vendored `0.3.0-pm2`。这是 P0 预检，不通过不进入 release。
- **`agentPreset` 能力**：rc.3 in-process spawn 声明 `agentPreset: true`；启动时探测，若 false 则跨 preset 委派失败，不能静默回退。
- `delegate_agent` 是否并行：未实测；若串行，v1 接受，Phase 2 评估 mini-superagent。
- 调用者 106 工具是否仍超模型舒适区：用 `context-budget` + 真实会话评估；必要时 B 模式（独立 chief）或缩窄主 preset。
- 子代理是否继承主 preset 后又被 `restrict`：现在 vendored 补丁让子会话挂专家 preset，仍需实测确认工具面是“专家 preset ∩ 白名单”。
- 种子技能名可能不存在（如 `optics-birefringence`）：agent-skill 会跳过缺失技能；验收记录。
- 发布网络：可能再次受限；保留本地安装兜底并如实记录。
