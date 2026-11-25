# Plan: 高分子科研 Superagent A 模式（2.3.0）

状态：**已执行（2.3.0 已打包发布）**  
设计文档：[2026-11-25-polymer-superagent-design.md](../../docs/superpowers/specs/2026-11-25-polymer-superagent-design.md)  
上位调查：[2026-11-25-polymer-superagent-plugin-survey.md](../../docs/polymechanism/2026-11-25-polymer-superagent-plugin-survey.md)  
日期：2026-11-25

## 1. Requirements Summary

把 2.2.6 的“六个人设 preset”升级为 **A 模式 Superagent**：

- **六个 polymer preset 都能当协调者**（Polymer Scientist 是默认总工）；任何 preset 都可 `delegate_agent` 派给其他专家；
- `dsh-agent-skill@0.3.0-pm2`（vendored：rc.3 嵌套 request + `agentPreset` + engines + 技能注册表）定义五个具名执行专家（physicist / characterization / modeler / literature / reviewer）；
- 子会话挂**目标专家自己的 polymer preset**，PM 权限矩阵/工具面按专家角色判定，不按调用者判定；
- 每个专家有硬工具白名单、技能、独立模型/思考强度；
- 新增 `polymer-chief-route` 技能：决策表 + brief 四段 + JSON 输出契约；六个 preset 的 persona 都追加同一段委派协议；
- 新增 `context-budget` 只读审计，量化工具/技能开销；
- 种子幂等写入五专家定义，不覆盖用户编辑；
- 2.3.0 打包 Release，2.2.6 可直接应用内更新。

**本轮只加两个插件**：vendored `dsh-agent-skill`、`@bushizhanghan/dsh-context-budget`。其余调研插件（zotero-local / lit-harvest / python-env / preview-stl / progress-nudge / second-opinion / doc-router / sciwork / origin / openfoam-doctor）作为 Phase 2，按 `context-budget` 实测逐个加，避免同层冲突和工具膨胀。

## 2. Scope

### In scope

- 安装两个新插件（其中 `dsh-agent-skill` 为 vendored pm1）并进入 `DESKTOP_SHIPPED_PLUGIN_BUNDLES`。
- 五专家种子定义 + route 技能 + **六个 preset 的委派协议** + 跨 preset 调用链。
- 上下文审计接入验收。
- 构建、boot smoke、真实会话验证、打包、发布、更新 E2E。
- 验收文档、release notes、记忆更新。

### Out of scope

- 合法非 OA 付费墙自动化（人工机构/CARSI 登录仍是边界）。
- LAMMPS/GROMACS/COMSOL 适配器。
- 任务队列/工作台（`dsh-mini-superagent` 是 C 方案，不装）。
- 第二套记忆/KB/文献库。
- 语义向量修复（`KB_RAG_PYTHON` 留 Phase 2）。
- 可选插件全家桶。

## 3. Current State / File References

| 项 | 位置 |
|---|---|
| 版本 | `dsh-plugin-desktop/package.json:3` = `2.2.6` |
| 依赖块 | `dsh-plugin-desktop/package.json` 的 `dependencies`（`dsh-cognition-engine` 附近） |
| shipped bundles | `dsh-plugin-desktop/src/profile.ts:771` `DESKTOP_SHIPPED_PLUGIN_BUNDLES` |
| retired bundles | `dsh-plugin-desktop/src/profile.ts:788` `DESKTOP_RETIRED_PLUGIN_BUNDLES` |
| 启动/就绪 | `dsh-plugin-desktop/src/main.ts:1719` `createDesktopProfileBoot`；`main.ts:1918` `profileBoot.markReady()` |
| 工具/技能注册断言 | `dsh-plugin-desktop/scripts/verify-profile-boot.mjs:355` `requiredShippedTools`；`:378` `requiredSkills` |
| shipped 测试 | `dsh-plugin-desktop/tests/shipped-plugin-bundles.spec.ts:36` |
| 版本测试 | `dsh-plugin-desktop/tests/package.spec.ts:824` |
| 技能目录 | `dsh-desktop/skills/`（bundled；`polymer-physics` 等） |
| 当前工具数 | 101；PM `registeredTools()` 36 |
| 当前技能数 | 28（`DSH_AGENTS_HOME` 修复后） |

## 4. Implementation Steps

### Step 0 — Preflight / backup

1. 确认工作树干净或记录当前 `git status`；备份：
   - `~/.pmstudio/profiles/desktop/package.json`
   - `~/.pmstudio/agent-skill/agents.json`（若存在）
2. 记录 2.2.6 基线：版本、101 工具、28 技能、36 PM 工具。
3. 失败回滚点：备份文件 + 当前安装包 `dist/PolyMechanism-Studio-2.2.6-x64-Setup.exe`。

### Step 1 — Vendor-patch `dsh-agent-skill` and add dependencies

**P0 兼容性预检**：`dsh-agent-skill@0.3.0` 原包在 rc.3 上 `startActivation` 形状不匹配，且没有 `agentPreset`；必须先 vendor patch。

1. 下载 `dsh-agent-skill@0.3.0` 到 `vendor/dsh-agent-skill/`，解包后改 `index.js`：
   - `startDelegation` 改用 rc.3 嵌套 `request`：
     ```js
     activation = await subagents.startActivation({
       provider, label, childId,
       request: {
         parent,
         prompt: [{ type: 'text', text: prompt }],
         ...(args.cwd === undefined ? {} : { cwd: String(args.cwd) }),
         ...(agentOptions === undefined ? {} : { agentOptions }),
         ...(definition.agentPreset === undefined ? {} : { agentPreset: definition.agentPreset }),
         ...(resolvedDepth === undefined ? {} : { maxDepth: resolvedDepth }),
       },
       signal: exec.signal,
       delivery: 'parent',
     })
     ```
   - `normalizeAgent` 增加：
     ```js
     agentPreset: String(raw?.agentPreset ?? existing?.agentPreset ?? '').trim() || undefined,
     ```
   - `startActivation` 前探测 `subagents.getProvider(provider)?.capabilities?.agentPreset === true`；false 时抛清晰错误，不静默回退。
2. 重新打包为 `vendor/dsh-agent-skill/dsh-agent-skill-0.3.0-pm1.tgz`；`vendor/dsh-agent-skill/README.md` 记录补丁与回退条件。
3. `dsh-plugin-desktop/package.json` dependencies 增加：
   ```json
   "dsh-agent-skill": "file:../vendor/dsh-agent-skill/dsh-agent-skill-0.3.0-pm1.tgz",
   "@bushizhanghan/dsh-context-budget": "0.1.2"
   ```
4. `DESKTOP_SHIPPED_PLUGIN_BUNDLES` 增加：
   ```ts
   'dsh-agent-skill',
   '@bushizhanghan/dsh-context-budget',
   ```
   位置：`src/profile.ts:771` 数组。
5. 更新 `tests/shipped-plugin-bundles.spec.ts` 期望列表（`:36`）和 fresh-profile contains 断言。
6. `corepack yarn install`，确认 lock 更新、包在 `node_modules`；`node -e` 确认 `agents.json` 补丁代码含 `agentPreset`。

### Step 2 — Seed module

新增 `dsh-plugin-desktop/src/agent-team-seed.ts`：

- 类型：
  ```ts
  interface SeedAgent {
    id: string; name: string; displayName: string; description: string;
    systemPrompt: string; mode: 'spawn'; maxDepth: 1;
    agentPreset: string;
    tools: string[]; skills: string[];
  }
  interface SeedStore { version: 1; agents: SeedAgent[]; rank: string[] }
  ```
- `buildAgentTeam(availableTools: string[], availableSkills: string[]): SeedStore`
  - 五个定义按设计文档 §5.1；
  - `agentPreset` 分别写 `polymer-physicist` / `polymer-characterization` / `polymer-modeler` / `polymer-literature` / `polymer-reviewer`；
  - 工具白名单与 availableTools 求交；缺失项记录；
  - 技能与 availableSkills 求交；
  - 过滤后工具数 <3 的 agent 跳过并记录；
  - `rank` 为 agent id 顺序。
- `seedAgentTeam(homeDir, availableTools, availableSkills, logger)`：
  - 路径 `join(homeDir, 'agent-skill', 'agents.json')`；
  - 若存在且 `agents.length > 0` → `{created:false, skipped:'existing'}`，不改；
  - 若存在但空/损坏 → 先 `rename` 到 `.bak-<timestamp>`；
  - 原子写：`agents.json.tmp` → `rename`；
  - 返回 `{created, path, agents, warnings}`。
- 单测 `tests/agent-team-seed.spec.ts`：
  1. 首次创建 5 个 agent，每个 tools 3–20、maxDepth 1、agentPreset 正确；
  2. 第二次不覆盖（hash 不变）；
  3. 用户手工改 `description` 后重启保留；
  4. 缺失工具被过滤；某 agent 过滤后 <3 时不创建；
  5. 损坏 JSON 被备份并重建。

### Step 3 — Wire seed before Host boot（执行时修正）

`src/main.ts` 在确定 `DSH_HOME`、Host `boot` **之前**调用：

```ts
await seedAgentTeamForBoot(homeDir, logger)
```

原因：`dsh-agent-skill` 在 `apply` 时读取 `agents.json`，`markReady()` 之后再写会让第一轮
`delegate_agent` 的工具描述为空。boot 后只做只读审计：

- `scheduleAgentTeamAudit(ctx, homeDir, logger)` 等工具/技能注册后读注册表；
- 报告 `agents` 数量、缺失的白名单工具/技能；不改用户文件；
- 失败只记录，不阻塞启动。

### Step 4 — Route skill + all-preset delegation protocol

新增 `skills/polymer-chief-route/SKILL.md`：

- 决策表（physicist / characterization / modeler / literature / reviewer / 当前协调者）；
- **非总工 preset 的可派对象表**（Physicist→characterization/modeler/reviewer；Characterization→physicist/modeler/reviewer；Modeler→physicist/characterization/reviewer；Literature→physicist/reviewer；Reviewer→characterization/physicist）；
- brief 四段模板（目标、约束、验收、已知事实）；
- 专家输出 JSON 契约；
- 升级/冲突/无证据规则；
- 明确“调用者先派活；专家不得再派子代理；子会话用专家自己的 preset”。

**修改 `dsh-plugin-desktop/cordis.patch.yml` 六个 polymer preset 的 persona prefix**，每段末尾追加同一句：

```
Delegation protocol (all polymer experts): when a task belongs to another
polymer specialty, call delegate_agent with the matching expert name
(physicist / characterization / modeler / literature / reviewer) and a
self-contained brief; use the polymer-chief-route skill. The child runs under
that expert's own polymer preset. Do not do another expert's specialty work
yourself.
```

位置：六个 `- id: polymer-*` 的 `persona.config.prefix`。
测试：`tests/preset-composition.spec.ts` 增加断言，六个 prefix 都含 `delegate_agent` 与 `polymer-chief-route`。

`verify-profile-boot.mjs` `requiredSkills`（`:378`）增加 `polymer-chief-route`。

### Step 5 — Verify assertions

`scripts/verify-profile-boot.mjs` `requiredShippedTools`（`:355`）增加：

```js
'delegate_agent',
'ctx_budget',
'ctx_budget_sweep',
'ctx_budget_skills',
'ctx_budget_tools',
```

`requiredSkills` 增加 `polymer-chief-route`。

### Step 6 — Build + boot smoke

命令：

```bash
corepack yarn workspace dsh-plugin-desktop build
corepack yarn verify:profile
corepack yarn workspace pm-research vitest run tests/health.spec.ts
corepack yarn workspace dsh-plugin-desktop vitest run \
  tests/agent-team-seed.spec.ts \
  tests/shipped-plugin-bundles.spec.ts \
  tests/package.spec.ts
```

通过标准：

- build EXIT=0；
- verify:profile EXIT=0，且日志出现 `delegate_agent`/`ctx_budget*`/`polymer-chief-route` 断言；
- 新单测全过；
- `pm-research` health 仍 36（PM 工具未变）。

### Step 7 — Real-app validation（安装前用 unpacked/临时 profile）

1. 用 `dist/win-unpacked` 或临时 profile 启动，打开 **Agent & Skill**：
   - 5 个专家可见；
   - 每个工具清单与设计表一致（缺失项已过滤）；
   - `maxDepth=0`；`agentPreset` 为对应 `polymer-*`。
2. **跨 preset 委派矩阵**（每个调用者一个目标专家，检查子会话 header）：
   | 调用者 preset | 目标 agent | 期望子会话 `agentPreset` | 验证 |
   |---|---|---|---|
   | polymer-scientist | literature | polymer-literature | `kb_search` 返回 evidence |
   | polymer-physicist | characterization | polymer-characterization | `pm_waxs_pro` 可调用 |
   | polymer-characterization | modeler | polymer-modeler | `pm_sim_flory_huggins` 可调用 |
   | polymer-modeler | physicist | polymer-physicist | `pm_hypothesis_propose` 可调用 |
   | polymer-literature | reviewer | polymer-reviewer | `pm_gate_check` 可调用 |
   | polymer-reviewer | characterization | polymer-characterization | `pm_evidence_query` 可调用 |
3. 每个子会话检查：
   - `session.v4.jsonl` 首行 `agentPreset` 等于目标；
   - 子代理工具面 = 专家 preset ∩ 白名单；
   - literature 不能调用 `pm_sim_*`；reviewer 不能调用 `write`；characterization 能调用 `pm_waxs_pro`/`pm_evidence_record`。
4. 最小链路：literature `kb_search` → characterization `pm_waxs_pro` → physicist `pm_hypothesis_propose` → reviewer `pm_gate_check` → 调用者 `pm_analysis_report`。
5. `ctx_budget_tools` 报告总工具 106，专家 ≤20。
6. 记录会话 ID、每步工具返回、DENIED/失败。

### Step 8 — Package 2.3.0

1. `package.json` 版本 `2.3.0`；`tests/package.spec.ts:824` 改 `2.3.0`。
2. 写 `.omc/release-notes-2.3.0.md`。
3. `corepack yarn dist:win`；确认 `Windows installer verification passed`。
4. 计算 Setup 大小 + SHA-256，写验收文档。
5. `gh release create v2.3.0 ... --latest`，上传 Setup + latest.yml/blockmap；核对 GitHub digest 与本地 SHA。
6. 2.2.6 实机检查更新 → 下载 → SHA 匹配 → 安装 → 2.3.0 启动；验证 106 工具、5 专家、`polymer-chief-route` 技能。
7. 网络受限时：后台重试 + 本地同字节 Setup 兜底，如实记录。

### Step 9 — Docs / memory

- 新增 `docs/polymechanism/acceptance/2026-11-25-superagent-agent-skill.md`：
  - 插件版本/许可/engines；
  - 种子 schema、五专家白名单；
  - boot/真实会话/更新 E2E 结果；
  - 已知限制（总工 106 工具、无队列、KB 向量降级、非 OA 人工边界）。
- 更新 `.omc/release-notes-2.3.0.md`。
- 更新项目记忆（session XVIII/IX）。
- `docs/superpowers/specs/2026-11-25-polymer-superagent-design.md` 标记已实现。

## 5. Acceptance Criteria（可测试）

| # | 标准 | 验证 |
|---|---|---|
| 1 | 2.3.0 构建/包通过 | build/dist log EXIT=0 + `Windows installer verification passed` |
| 2 | 两个新 bundle 在 shipped 列表 | `tests/shipped-plugin-bundles.spec.ts` 通过 |
| 3 | `delegate_agent` + 4 个 `ctx_budget*` 注册 | `verify:profile` 断言 + 全局工具表 |
| 4 | `polymer-chief-route` 在技能注册表 | `verify:profile` 断言 |
| 5 | 首次启动写 5 个 agent | `agents.json` 5 条；每个 tools 3–20、maxDepth 0、agentPreset 正确 |
| 6 | 二次启动不覆盖 | 文件 hash 不变；手工改字段保留 |
| 7 | 专家工具隔离 | literature 无 `pm_sim_*`；reviewer 无 `write`；characterization 有 `pm_waxs_pro` |
| 8 | **六 preset 都能派活** | 六组调用者→目标矩阵全部成功，子会话 header `agentPreset` 等于目标专家 preset |
| 9 | 最小真实链路 | literature→characterization→physicist→reviewer→report 每步有工具返回 |
| 10 | 上下文可审计 | `ctx_budget_tools` 总工具 106；专家 ≤20 |
| 11 | 2.2.6→2.3.0 更新 | 应用内检查/下载/安装/重启；版本 2.3.0 |
| 12 | 旧数据不丢 | KB 16 篇/841 块、cognition 记忆、lit-projects 不变 |

## 6. Risks and Mitigations

| 风险 | 概率/影响 | 缓解 |
|---|---|---|
| **`agent-skill@0.3.0` 原包与 rc.3 不兼容**（扁平 `startActivation` 在 `spec.request.maxDepth` 抛错；无 `agentPreset`） | 高/高 | 必须用 vendored `0.3.0-pm1`（嵌套 request + agentPreset）；先在临时 profile 装包 boot；失败不进入 release |
| spawn provider 不支持 `agentPreset` | 低/高 | 启动探测 `capabilities.agentPreset`；false 时明确失败，不静默回退 |
| 种子覆盖用户 agents | 低/高 | 只在不存在/空时写；旧文件 `.bak`；单测 |
| 工具白名单含不存在名称 | 中/中 | 启动时与 `tools.schemas()` 求交；缺失日志；<3 跳过 |
| 总工仍 106 工具，模型仍过载 | 中/高 | `context-budget` 实测；强模型；必要时 B 模式/缩窄主 preset |
| 专家返回散文/无证据 | 中/中 | systemPrompt JSON 契约；总工只接受 `evidenceIds` |
| 子代理递归派活 | 低/高 | 白名单不含 `delegate_agent`；maxDepth 0 |
| 发布网络受限 | 高/中 | 后台重试；本地 Setup 兜底；如实记录 |
| KB 向量降级 | 已知/中 | 不阻塞 2.3.0；Phase 2 加 `KB_RAG_PYTHON` |
| 非 OA 付费墙 | 已知/高 | 只走机构/CARSI/浏览器/Zotero；拒绝 Sci-Hub |

## 7. Verification Steps

1. `corepack yarn workspace dsh-plugin-desktop build` → 0
2. `corepack yarn verify:profile` → 0，日志含 5 个新工具 + `polymer-chief-route`
3. `corepack yarn workspace dsh-plugin-desktop vitest run tests/agent-team-seed.spec.ts tests/shipped-plugin-bundles.spec.ts tests/package.spec.ts` → 全过
4. `corepack yarn workspace pm-research vitest run tests/health.spec.ts` → 36 工具
5. 真实 app：
   - 5 专家面板；
   - `delegate_agent` 五专家各一次；
   - 工具白名单拒绝测试（literature 调 `pm_sim_*` 应不可见/拒绝）；
   - `ctx_budget_tools` 106；
   - 最小链路 + `pm_analysis_report`。
6. 打包/发布/更新 E2E；SHA 匹配；版本 2.3.0。

## 8. Rollback

- 代码：`git revert` 2.3.0 提交；恢复 `package.json`/`profile.ts`/`verify`/tests。
- 用户数据：`~/.pmstudio/agent-skill/agents.json.bak-*` 恢复；种子不删除用户文件。
- 应用：重装 2.2.6 Setup；旧 KB/记忆/文献不动。
- Release：删除 v2.3.0 Release（仅发布失败时）；保留 2.2.6。

## 9. ADR（Decision Record）

- **Decision**：A 模式，**任意 polymer preset 会话都可当协调者**（Polymer Scientist 默认总工）；用 vendored `dsh-agent-skill@0.3.0-pm2`（rc.3 嵌套 request + `agentPreset` + 技能注册表）定义五执行专家；每个子会话挂目标专家的 polymer preset；只加 `context-budget` 作为审计；Phase 2 再加可选插件。
- **Drivers**：科研可审计优先；六个 preset 都要能互相派活；工具/技能上下文成本已实证会破坏小模型；同层插件冲突多；发布质量优先于“全家桶”。
- **Alternatives**：B 独立 chief（多一跳，暂不选）；C mini-superagent（无 per-agent 白名单，冲突）；只让 Polymer Scientist 派活（不满足“其他 preset 也能派”）；全装 20 插件（工具膨胀，反目标）。
- **Why chosen**：最短链路 + 硬工具白名单 + 子会话专家 preset 权限正确 + 与现有 PM 账本/KB 直接衔接。
- **Consequences**：需要维护 `dsh-agent-skill` vendored patch；调用者仍看到自己 preset 的工具面；无任务队列；Phase 2 才能加 zotero-local 等。
- **Follow-ups**：若总工不派活 → B；若批量吞吐瓶颈 → C；若 KB 语义必须 → `KB_RAG_PYTHON`/打包科学 Python；若模拟需 LAMMPS → 外部安装 + 自研 adapter。

## 10. Approval

用户已批准执行。实现结果见
[2026-11-25-superagent-agent-skill.md](../../docs/polymechanism/acceptance/2026-11-25-superagent-agent-skill.md)。

### 执行中的修正（已写入代码与验收文档）

1. **`maxDepth: 0` 不可用**：rc.3 把它当子会话的绝对深度上限，根会话派生的子代理深度为 1，
   实测 `SubagentDepthError: subagent depth 1 exceeds maxDepth 0`。改为 `maxDepth: 1`，
   递归仍由白名单（无 `delegate_agent`）+ 深度 2 超限阻断。
2. **种子必须在 Host boot 之前写入**：`dsh-agent-skill` 在 `apply` 时读取 store；原计划的
   `markReady()` 之后写会让第一轮 `delegate_agent` 目录为空。改为 boot 前写，boot 后只审计。
3. **`context-budget` 也要 vendor patch**：上游 `output.schema = {type:'json'}` 被 rc.3
   的 JSON Schema 校验拒绝，四个工具全部注册失败；改为对象 schema。
4. **`agent-skill` 升到 pm2**：额外修 `dsh.engines.dsh` 与 `collectSkills`（注册表优先），
   否则面板全部专家技能 ⚠、子会话拿不到技能正文。
5. **模型驱动 UI 验收被账户预算阻断**：DeepSeek 返回 422 `budget_exceeded`；机制、权限、
   工具链路已用真实 Host/Agent 验证，未用 mock。换有额度的模型可直接重跑。
