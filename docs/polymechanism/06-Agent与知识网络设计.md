# 06 — Agent 与知识网络设计

> 目标：让 Agent **真正能做高分子科研**——不是角色扮演，而是每个专家都有专属工具、专属知识范围、强制证据纪律，且系统能在执行中持续积累知识（RSI）。
> 复用基础（已核实契约）：`dsh-agent-preset`（`{id, plugins[]}`）、`dsh-persona`（`{prefix, suffix, complete, includeRuntimeContext}`）、`dsh-skill-filesystem`（`<root>/<name>/SKILL.md`，不递归）、`dsh-subagent`、`dsh-experimental-agent-team`（`ctx.agentTeams` + `spawn_teammate`）。

---

## 1. Agent 抽象

```
Agent = Runtime（共享 DSH）+ Persona + Tools（白名单）+ Skills（方法论文档）
      + Knowledge（知识子集 + scope）+ Policy（门控与权限）
```

**关键设计**：不为专家写 Agent Loop；六个专家 = 六个 `PresetDefinition`，差异仅在 `plugins[]` 里挂载的 persona / 工具 / skill 配置。

## 2. 六个专家 Preset（精确配置）

> 全部基于官方 Standard Preset 打补丁（`@deepseek-ai/dsh-web-app/presets/standard.patch.yml`），**不从空白写**。以下为差异片段。

### 2.1 `polymer-scientist`（总控 / 首席研究员）

```yaml
- insert:
  - id: preset-pm-scientist
    name: '@deepseek-ai/dsh-agent-preset'
    config:
      id: polymer-scientist
      name: 'Polymer Scientist'
      description: '高分子科研总控：拆解课题、委派专家、汇总证据化结论'
      order: 10
      plugins:
        - name: '@deepseek-ai/dsh-persona'
          config:
            prefix: |
              You are the Principal Investigator of a polymer science lab using
              PolyMechanism Studio. Domain: polymer physics and processing, first
              target PVA optical films under oblique biaxial stretching.

              Non-negotiable research discipline:
              1. Separate OBSERVATION (measured), THEORY (established), and
                 HYPOTHESIS (unverified). Never present a hypothesis as fact.
              2. Every mechanistic claim must cite evidence IDs from the Evidence
                 Ledger. If evidence is missing, say what would be needed.
              3. When several mechanisms could explain a result, enumerate them as
                 competing hypotheses and state what observation would discriminate.
              4. You coordinate specialists; you do not mark your own hypothesis
                 "supported". That requires Scientific Gate + reviewer + human approval.
              5. Prefer existing tools/knowledge over generic reasoning. Query the
                 mechanism graph before inventing a mechanism.
            includeRuntimeContext: true
        - name: '@deepseek-ai/dsh-skill-filesystem'
          config: { customSkillDirs: ['<repo>/skills'] }
        - name: '@deepseek-ai/dsh-tool-skill'
        - name: '@deepseek-ai/dsh-tool-subagent'
        - id: pm-tools-scientist
          name: 'pm-research/tools/scientist'   # 只读全域 + 项目管理 + 委派
```

### 2.2 六个专家总表

| Preset id | 角色 | 工具白名单（关键） | 禁止 | 知识 scope |
| --- | --- | --- | --- | --- |
| `polymer-scientist` | 总控/首席 | `pm_project_*`、`pm_evidence_query`、`pm_mechanism_query`、`pm_hypothesis_*`、`pm_gate_check`、`pm_knowledge_query`、subagent 委派 | 直接改证据、直接升级结论 | global + project |
| `polymer-physicist` | 高分子物理理论 | `pm_mechanism_query/propose`、`pm_model_list/describe`、`pm_evidence_query`、`pm_hypothesis_propose` | 采集实验数据、写实验记录 | global + 理论库 |
| `polymer-characterization` | 表征/数据 | `pm_waxs_*`、`pm_ftir_*`、`pm_saxs_*`、`pm_optics_analyze`、`pm_evidence_record`、`pm_data_import` | 修改模型参数库、改理论边 | 表征方法子集 |
| `polymer-modeler` | 建模/仿真 | `pm_sim_*`（解析物性+MD）、`pm_model_fit`、`pm_evidence_record` | 把拟合结果直接标为 established | 模型/数值子集 |
| `polymer-literature` | 文献 | `kb_search/kb_rag/kb_fetch`、zotero 工具、`pm_literature_extract`、`pm_evidence_record` | 写实验结论、改机理边为 established | 文献库 |
| `polymer-reviewer` | 独立审查 | `pm_evidence_query`（只读）、`pm_gate_check`、`pm_objection_record`、`pm_knowledge_query` | 任何写操作（除 objection/verdict） | 全局只读 |

**权限落地方式**：每个 preset 的 `plugins[]` 只挂载该角色需要的工具插件行（`pm-research/tools/<role>`），**不是靠 prompt 约束**。物理隔离在插件注册层完成。

### 2.3 Reviewer 的独立性保证

- `polymer-reviewer` 的 preset **不挂载** `pm_hypothesis_propose`/`pm_mechanism_propose`；
- 只读证据 + 写 `Objection`/`Verdict` 两个实体；
- 由 `pmGate` 在结论升级时**强制调用**（服务端逻辑），而非依赖主 Agent 自觉；
- 人类保留最终 `approve` 权（UI 审批卡）。

## 3. Skills（方法论资产）

### 3.1 目录与约束（已核实）

```
skills/
├── polymer-physics/SKILL.md
├── pva-oblique-stretching/SKILL.md
├── mechanism-discovery/SKILL.md
├── literature-review/SKILL.md
├── waxs-analysis/SKILL.md
├── ftir-analysis/SKILL.md
├── saxs-analysis/SKILL.md
├── optics-birefringence/SKILL.md
├── cae-workflow/SKILL.md
├── experiment-design/SKILL.md
├── scientific-review/SKILL.md
└── research-project-management/SKILL.md
```

- **必须**是 `<root>/<name>/SKILL.md` 或 `<root>/<name>.md`，**不递归**；
- frontmatter 必填 `name`（kebab-case）、`description`；可选 `whenToUse`、`metadata`、`user-invocable`；
- 发现根优先级：`.dsh/skills`(100) > `.agents/skills`(200) > `customSkillDirs`(300) > `$DSH_HOME/skills`(400)。

### 3.2 SKILL.md 模板

```markdown
---
name: optics-birefringence
description: 由取向因子与两相模型推算双折射与相位差，并检查数量级自洽
whenToUse: 需要把取向/结晶结果转成光学性能，或校验光学结论是否自洽时
metadata: { domain: polymer-optics, version: 1 }
---

# 双折射与相位差分析

## 何时用
## 输入要求（必须显式单位）
## 步骤（含公式 LaTeX）
## 常见陷阱（PVA 特有：水含量、拉伸比定义、真应变 vs 工程应变）
## 输出格式（落入 Evidence 的字段）
## 自检清单（量级/符号/边界）
```

### 3.3 与官方能力的衔接

- Skill 由 `dsh-tool-skill` 暴露给模型（`skill` 工具），内容以 `<skill_content>` 注入会话；
- 需要多步编排的 Skill 内部调用 `workflow` 工具（JS 脚本，`agent()/parallel/pipeline`），**不用 YAML**；
- 每个 Skill 必须给出"输出如何登记为 Evidence"的字段约定，避免产出游离在账本外。

## 4. RSI 知识网络（核心创新）

### 4.1 三层结构

```
L-A 知识卡（KnowledgeCard，Markdown，人可读）
   ↕ 引用
L-B 机理图谱（MechanismNode / MechanismEdge，结构化物理关系）
   ↕ 绑定
L-C 证据账本（Evidence / Observation，不可篡改事实）
```

**为什么三层**：卡片承载"经验与判断"（易写、易审、易 git）；图谱承载"可计算的物理关系"（可查询/可推理）；证据承载"不可辩驳的事实"（哈希锚定）。三者互相引用，任一结论可下钻到原始数据。

### 4.2 RSI 回路（Recursive Self-Improvement）

```
① 任务执行（Agent 用工具做真实科研）
        │ 产生：新观测/新拟合/新文献结论
        ▼
② 沉淀提议 pm_knowledge_propose
   - kind: fact | method | pitfall | decision | edge-candidate
   - links: nodeIds / edgeIds / evidenceIds
   - origin: {taskId, sessionId, agent}
        ▼
③ 状态机（服务端强制）
   pending ──reviewer approve──▶ approved ──superseded──▶ archived
      │
      └──human reject──▶ rejected（保留理由，不删除）
        ▼
④ 晋升后自动可用
   - edge-candidate 通过审查 → 生成 MechanismEdge(applicability='candidate')
   - fact/method → 写入对应 agent scope 的知识卡池
   - 下次同类任务：pm_knowledge_query 命中 → 注入上下文
        ▼
⑤ 质量反馈闭环
   - 被后续证据反驳的卡/边 → 自动标记 disputed + 通知
   - 长期未被引用的卡 → 降权（不删除）
```

**与"普通 RAG"的区别**：知识不是被动检索的文本，而是**经审查、带来源任务、可被反驳、可驱动图谱升级**的资产。

### 4.3 检索算法（`pm_knowledge_query` / `pm_mechanism_query`）

```
输入: { question, projectId, scope?, entityHints? }
1. 实体锚定：从问题中抽符号/材料/工艺/表征名 → 匹配 Node.aliases
2. 图谱扩展：以锚定节点做 2 跳邻域（可配置），收集边 + 相邻节点
3. 条件过滤：按当前工况（温度/拉伸比/应变率）过滤 edge.conditions
4. 证据加权：edge 的 supporting evidence 数与强度 → 排序
5. 卡片补充：scope 内 approved 卡片做关键词匹配（CJK 友好）
6. 输出：{ paths[], edges[], cards[], missingKnowledge[] }
   missingKnowledge 用于告诉 Agent「缺什么数据/文献」
```

**关键**：输出**必须包含 `missingKnowledge`**——让 Agent 知道边界，避免编造。

### 4.4 与通用记忆插件的分工

| 层 | 负责 | 归属 |
| --- | --- | --- |
| 会话级记忆（"上次我们怎么做的"） | 跨会话经验、偏好、决策 | `dsh-mnemon` / `memory-eternal`（第三方） |
| 领域知识（"PVA 取向与双折射的关系"） | 结构化物理知识 | **自研** `pmKnowledge` + `pmMechanism` |
| 原始事实（"这次仿真的 Δn=0.023"，标记 simulation） | 不可篡改数据 | **自研** `pmEvidence` |

不重复造：通用记忆直接复用插件；领域知识与证据必须自研（无插件覆盖，且需与图谱/门控强耦合）。

## 5. Mechanism Graph 种子内容

`knowledge/mechanism/seed.yaml`（人工整理，标注 `source: textbook` 或 DOI）：

### 5.1 节点（PVA 斜拉场景）

| 节点 | 类型 | 符号/单位 |
| --- | --- | --- |
| 拉伸比 | condition | λ, 无量纲 |
| 拉伸温度 | condition | T, ℃ |
| 应变率 | condition | \(\dot\epsilon\), s⁻¹ |
| 预热/定型时间 | condition | t, s |
| 分子链取向 | structure | f (Hermans), 无量纲 |
| 结晶度 | structure | Xc, % |
| 晶区取向 | structure | fc |
| 片晶长周期 | structure | L, nm |
| 双折射 | property | Δn, 无量纲 |
| 相位差 | property | R = Δn·d, nm |
| 弹性模量 | property | E, MPa |
| 收缩率 | property | S, % |
| 水含量 | condition | w, wt% |
| 增塑剂 | material | — |

### 5.2 边（候选物理关系，均带条件）

| from → to | relation | 条件 | 来源 |
| --- | --- | --- | --- |
| 拉伸比 → 分子链取向 | increases | T∈[80,140], λ<8 | textbook（橡胶弹性/仿射变形） |
| 拉伸温度 → 分子链取向 | decreases | 高温松弛 | textbook |
| 分子链取向 → 双折射 | determines | 两相模型：Δn = Xc·fc·Δn_c + (1−Xc)·f_a·Δn_a | `12-pva-material-and-optics.md` |
| 结晶度 → 双折射 | increases | 晶区本征双折射更高 | 文献 |
| 水含量 → 玻璃化温度 | decreases | 增塑 | textbook |
| 应变率 → 取向 | increases | 低 T 高 rate | 文献（待验证） |
| 定型时间 → 收缩率 | decreases | 松弛完成度 | 文献 |
| 斜拉角 → 双折射主轴 | rotates | 斜向拉伸 | 既有 CAE 工程记录（`KINEMATICS.md`，历史参考） |

> 每条边都必须填 `applicability`（`established` / `candidate`）与 `confidence`；`established` 需 `theorySource` + strong 证据（服务端强制）。

## 6. 专家协作拓扑

```
                 ┌──────────────────────────┐
   用户/课题 ───▶ │ polymer-scientist (Lead) │
                 └────┬─────────┬───────────┘
        subagent 委派  │         │  汇总证据化结论
        ┌─────────────┘         └──────────────┐
        ▼                                      ▼
 physicist  characterization  modeler  literature
        │            │            │          │
        └────────────┴─────┬──────┴──────────┘
                           ▼
              Evidence Ledger ⇄ Mechanism Graph ⇄ Knowledge
                           ▲
                    ┌──────┴────────┐
                    │ polymer-reviewer │ ◀── pmGate 强制触发
                    └────────────────┘
                           ▼
                    人类最终审批（UI）
```

- **P2 阶段**：Lead 用 `dsh-tool-subagent` 显式委派（一次一个专家，可控）。
- **P4 阶段**：切 `dsh-experimental-agent-team`（`spawn_teammate` + 任务板 + 端口通信），实现并行专家协作；届时把 `team_task_*` 与 `pmProjects` 的任务模型对齐。
- **不采用**"多个常驻 Agent 各自聊天"的模式：科研需要可追溯的单一证据链，而不是群聊。

## 7. 提示词纪律（所有专家共享的"科研宪法"）

写入每个 persona 的 `prefix` 末尾（或抽成 `scientific-discipline` skill 常驻）：

1. **观测 / 理论 / 假设三分**，输出时必须标注属于哪一类。
2. **无证据不下结论**；缺证据时输出"需要什么证据"。
3. **竞争假设优先**：至少列 2 个可解释机理，并说明判别观测。
4. **单位与量纲显式**，不得裸数字。
5. **不确定就说不确定**，禁止用流畅文字掩盖缺失。
6. **不修改历史**：证据只追加，假设只迁移状态。
7. **优先查询既有知识**（图谱/知识卡/文献）再推理。
