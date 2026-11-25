# 验收：Superagent A 模式（agent-skill + 五专家 + context-budget）

日期：2026-11-25  
版本：PolyMechanism Studio 2.3.0  
设计：[2026-11-25-polymer-superagent-design.md](../../superpowers/specs/2026-11-25-polymer-superagent-design.md)  
计划：[ralplan-2026-11-25-polymer-superagent.md](../../../.omc/plans/ralplan-2026-11-25-polymer-superagent.md)

## 1. 插件

| 插件 | 版本 | 许可 | 形态 | 说明 |
|---|---|---|---|---|
| `dsh-agent-skill` | `0.3.0-pm2` | MIT | vendored tarball | rc.3 嵌套 request、`agentPreset`、保存保留、engines 降级、技能注册表解析 |
| `@bushizhanghan/dsh-context-budget` | `0.1.2-pm1` | MIT | vendored tarball | 修 `output.schema` 非法 JSON Schema，四工具才能注册 |

两个包都作为 `dsh-plugin-desktop` 生产依赖，并进入
`DESKTOP_SHIPPED_PLUGIN_BUNDLES`：

```ts
'dsh-zotero-skill', 'dsh-kb-rag', 'dsh-cognition-engine', 'dsh-lit-library',
'dsh-cite-verify', '@perrylink/dsh-research-core',
'dsh-agent-skill', '@bushizhanghan/dsh-context-budget'
```

### 1.1 兼容性修复（实测驱动）

1. **扁平 `startActivation`**：上游 0.3.0 在 rc.3 上会在 `spec.request.maxDepth`
   抛错；改为 `{provider,label,childId,request:{parent,prompt,...},signal,delivery}`。
2. **无 `agentPreset`**：子会话继承调用者 preset，Reviewer 派 Characterization 会被
   PM 权限矩阵拒绝；现在 agent 定义携带 `agentPreset` 并在 request 里传递。
3. **保存丢字段**：`normalizeAgent` 丢弃未知字段；补丁保留 `agentPreset`。
4. **engines 门槛**：上游 `dsh.engines.dsh >= 0.2.2-rc.1`，rc.3 直接拒绝；降为
   `>=0.2.1-rc.3`。
5. **技能解析**：上游只扫 `$DSH_HOME/skills` 与工作区，bundled `app/skills` 和
   pm-research 程序化技能全都解析不到（面板 ⚠、子 prompt 无技能正文）；pm2 先读
   `ctx.skills.list()/get()`，再回退文件系统。
6. **context-budget `{type:'json'}`**：rc.3 的 JSON Schema 校验拒绝，四个工具全部
   “registration skipped”；改为 `{type:'object', additionalProperties:true}`。

## 2. 种子

路径：`<DSH_HOME>/agent-skill/agents.json`（本机 `~/.pmstudio/agent-skill/agents.json`）。

- 首次启动 **Host boot 之前**写入；`dsh-agent-skill` 在 `apply` 时读取 store，
  boot 后再写会让第一轮 `delegate_agent` 目录为空。
- 幂等：已有非空 store 不动；空/损坏先改名 `.bak-<timestamp>` 再原子写。
- 五条定义（实测 `tools` 数）：

| name | displayName | agentPreset | maxDepth | tools | skills |
|---|---|---|---|---|---|
| physicist | 高分子物理学家 | polymer-physicist | 1 | 20 | 3 |
| characterization | 表征分析专家 | polymer-characterization | 1 | 16 | 5 |
| modeler | 建模与仿真专家 | polymer-modeler | 1 | 16 | 3 |
| literature | 文献情报专家 | polymer-literature | 1 | 20 | 3 |
| reviewer | 独立评审专家 | polymer-reviewer | 1 | 8 | 2 |

> **计划修正**：设计/计划原写 `maxDepth: 0`，rc.3 实测
> `SubagentDepthError: subagent depth 1 exceeds maxDepth 0`。`maxDepth` 是子会话的
> **绝对深度上限**，根会话的子代理深度为 1，所以最小可用值是 1。递归仍被阻断：
> 专家白名单不含 `delegate_agent`，孙代理深度 2 也会超限。

## 3. 路由与六 preset

- 新增 `skills/polymer-chief-route/SKILL.md`：决策表、非总工可派对象、brief 四段、
  JSON 契约、升级/冲突规则、禁止项。
- `cordis.patch.yml` 六个 polymer preset 的 persona 末尾都追加同一段
  `Delegation protocol (all polymer experts)`；测试断言六个 prefix 都含
  `delegate_agent` / `polymer-chief-route` / 五个专家名。
- `verify-profile-boot.mjs` 断言全局工具含
  `delegate_agent`、`ctx_budget`、`ctx_budget_sweep`、`ctx_budget_skills`、
  `ctx_budget_tools`，技能含 `polymer-chief-route`。

## 4. 实机 / 真实 Host 验证

### 4.1 真实应用启动与面板

用 dev 版 `electron lib/main.js --remote-debugging-port=9333` 启动，实测：

- 启动日志：`agent team: seeded physicist, characterization, modeler, literature, reviewer`
- `~/.pmstudio/agent-skill/agents.json` 5 条，版本 1，rank 5
- `Agent & Skill` 面板：`子智能体 5 个`；五个专家、工具数、技能全部显示
- pm2 修复后技能 ⚠ 数为 **0**
- **打包版首次启动**（隔离 `DSH_HOME` + `APPDATA`）同样在 boot 前写出 5 条：
  physicist 20 / characterization 16 / modeler 16 / literature 20 / reviewer 8，
  `maxDepth=1`，`agentPreset` 正确
- **面板保存保留 preset**：对 `/api/dsh-agent-skill/agents/save` 提交不带
  `agentPreset` 的完整 agent（模拟面板编辑），返回 200 且写回后
  `agentPreset` 仍为 `polymer-physicist`，description 已更新

### 4.2 六 preset 跨派活矩阵（`yarn verify:agent-team`）

真实 Host 组合 + 真实 live Agent；`delegate_agent` 按模型调用方式执行：

| 调用者 preset | 目标 | 子会话 `agentPreset` | 子代理可见工具数 |
|---|---|---|---|
| polymer-scientist | literature | polymer-literature | 17 |
| polymer-physicist | characterization | polymer-characterization | 12 |
| polymer-characterization | modeler | polymer-modeler | 13 |
| polymer-modeler | physicist | polymer-physicist | 17 |
| polymer-literature | reviewer | polymer-reviewer | 6 |
| polymer-reviewer | characterization | polymer-characterization | 12 |

- 每个子会话 header 的 `agentPreset` 等于目标专家 preset。
- 子代理工具面是 `专家 preset ∩ 白名单`，不是调用者工具面。
- 禁止调用实测返回错误（3/3）：
  - literature → `pm_sim_flory_huggins`
  - reviewer → `pm_hypothesis_transition`
  - literature → `delegate_agent`
- 工具白名单检查：literature 有 `kb_search/kb_rag/pm_kb_note`、无 `pm_sim_*`；
  reviewer 有 `pm_gate_check/pm_evidence_verify`、无 `write/delegate_agent`；
  characterization 有 `pm_waxs_pro/pm_evidence_record`；physicist 有
  `pm_hypothesis_propose`；modeler 有 `pm_sim_flory_huggins/pm_sim_md_run`。

### 4.3 最小真实链路（同一 harness）

`pm_project_create`（Scientist）
→ `pm_kb_note` + `kb_search`（Literature child）
→ `pm_waxs_pro` peakfit（Characterization child，真实 Python 引擎，返回 `EV-*`）
→ `pm_hypothesis_propose`（Physicist child）
→ `pm_gate_check`（Reviewer child）
→ `pm_analysis_report`（Scientist）

每一步都有真实工具返回；WAXS 证据 ID 被后续假设与门控引用。未使用 mock。

### 4.4 模型驱动 UI 测试（未完成，外部阻断）

在真实 UI 新会话（Polymer Scientist）发送“用 delegate_agent 派给 literature”的
指令后，模型调用返回：

```
422 {"message":"Budget has been exceeded! Key=SA… Current cost: 100.25, Max budget: 100.0",
     "type":"budget_exceeded"}
```

因此没有取得“模型自己决定调用 `delegate_agent`”的会话记录。这是账户预算问题，
不是插件/权限问题；换有额度的模型后可直接重跑同一会话。其余机制、权限、
工具链路均已在真实 Host 中验证。

### 4.5 2.2.6 → 2.3.0 应用内更新（真实）

1. 安装版为 2.2.6；先把被 dev 2.3.0 运行污染过的 profile 清单恢复为 2.2.6 基线
   （备份 `.omc/backup-2.3.0/profile-package.json`），确认 2.2.6 可正常启动。
2. 应用内检查更新 → 原生对话框：“PolyMechanism Studio 2.3.0 已可用。现在下载此更新？”
3. 确认下载 → 保存对话框使用默认 `Downloads` → 下载文件
   `PolyMechanism-Studio-2.3.0-windows.exe`，**366,120,562 字节**，
   SHA-256 `5214dff1e5aecf2e9e16db1a927927a4ca1dacef90ad87736d240f95fd8dc690`，
   与 Release asset digest 一致。
4. “重启并安装” → 安装完成，版本变为 **2.3.0**。
5. 启动 2.3.0：URL `dsh-desktop-version=2.3.0`；日志
   `agent team: skipped existing definitions`；`Agent & Skill` 5 个专家、技能 ⚠=0；
   `/pm/health` 36 工具；profile bundles 已含 `dsh-agent-skill` 与
   `@bushizhanghan/dsh-context-budget`；安装目录插件版本
   `0.3.0-pm2` / `0.1.2-pm1`。

> 网络备注：本机到 GitHub 的大文件上传极慢（gh 约 24 KB/s；直连 curl 约 10 KB/s）。
> 最终用 `curl -x http://127.0.0.1:7890` 以约 280 KB/s 完成 366 MB 上传；
> GitHub Actions 在该仓库被禁用，无法用 hosted runner 代传。

## 5. 回归

- `verify:profile` EXIT=0
- `verify:agent-team` EXIT=0（全局 75 工具；scientist 会话 105 工具）
- `ctx_budget` 对真实会话日志实测返回 `ok:true`（wasteRatio=0）；`ctx_budget_tools`
  返回 20 个工具组
- `corepack yarn typecheck` EXIT=0
- `update-checker` 45 + `update-download` 52 测试全过
- `vitest`：`package` 49、`preset-composition` 20、`shipped-plugin-bundles` 6、
  `agent-team-seed` 10，全过
- `pm-research` health 4 项全过，仍 36 个 PM 工具（`pm_model_fit` 增加
  characterization 授权，工具数不变）
- 旧数据：KB 16 篇 / 841 块、cognition 记忆、lit-projects 未迁移、未删除

## 6. 发布产物

| 项 | 值 |
|---|---|
| 安装包 | `PolyMechanism-Studio-2.3.0-x64-Setup.exe` |
| 大小 | 366,120,562 字节 |
| SHA-256 | `5214dff1e5aecf2e9e16db1a927927a4ca1dacef90ad87736d240f95fd8dc690` |
| 构建 | `Windows installer verification passed`；x64 primary runtime verified |
| 源 | tag `v2.3.0`（master） |
| 打包内依赖 | `dsh-agent-skill@0.3.0-pm2`、`@bushizhanghan/dsh-context-budget@0.1.2-pm1`、`app/skills/polymer-chief-route/SKILL.md` |

## 7. 已知限制

- 总工仍看到约 105 个工具（headless 实测 scientist 会话 105、全局 75；完整桌面另有 AA/市场行，可能略高）；`ctx_budget_*` 可量化，Phase 2 再决定是否缩窄。
- 没有任务队列/并行工作台；`delegate_agent` 串行返回 child id，结果由父会话通知。
- 合法非 OA 全文仍需机构/CARSI/人工登录；不接 Sci-Hub。
- 打包环境 kb-rag 向量/精排可能因 Python numpy ABI 降级为关键词。
- `maxDepth=1` + 白名单无 `delegate_agent`：专家不能再派子代理。
- 模型预算耗尽时无法完成模型驱动验收。
