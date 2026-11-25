## PolyMechanism Studio 2.3.0

高分子科研 Superagent A 模式：六个 polymer preset 都能当协调者，五个具名专家各自带着
自己的 preset、工具白名单和技能执行；新增上下文预算审计。

### 新增模块

- **dsh-agent-skill 0.3.0-pm2（vendored，MIT）**
  - rc.3 嵌套 `startActivation.request` 修复；上游扁平 spec 会直接抛错
  - agent 定义新增 `agentPreset`，子会话挂目标专家自己的 polymer preset
  - 面板保存保留 `agentPreset`（上游 `normalizeAgent` 会丢弃未知字段）
  - `dsh.engines.dsh` 改为 `>=0.2.1-rc.3`（上游要求 0.2.2-rc.1，rc.3 会拒绝加载）
  - `collectSkills` 先读组合技能注册表（bundled + pm-research 程序化技能），
    再回退文件系统根；此前面板把所有专家技能标 ⚠、子会话也拿不到技能正文
- **@bushizhanghan/dsh-context-budget 0.1.2-pm1（vendored，MIT）**
  - 上游 `output.schema = {type:'json'}` 不是合法 JSON Schema，rc.3 会跳过全部
    四个工具；改为 `{type:'object', additionalProperties:true}`
  - `ctx_budget` / `ctx_budget_sweep` / `ctx_budget_skills` / `ctx_budget_tools`

### 五专家种子

首次启动在 Host boot **之前**写入 `<DSH_HOME>/agent-skill/agents.json`：

| 名称 | 子会话 preset | 工具数 | 技能 |
|---|---|---|---|
| `physicist` 高分子物理学家 | `polymer-physicist` | 20 | polymer-physics / mechanism-discovery / simulation-workflow |
| `characterization` 表征分析专家 | `polymer-characterization` | 16 | waxs / ftir / saxs / waxs-pro / optics |
| `modeler` 建模与仿真专家 | `polymer-modeler` | 16 | simulation-workflow / polymer-physics / experiment-design |
| `literature` 文献情报专家 | `polymer-literature` | 20 | literature-review / lit-library / kb-grounded-answer |
| `reviewer` 独立评审专家 | `polymer-reviewer` | 8 | scientific-review / mechanism-discovery |

- 种子幂等：已有非空 store 不覆盖；空/损坏文件先 `.bak-<timestamp>` 再重建
- `maxDepth = 1`：rc.3 的 `maxDepth` 是**绝对深度上限**，根会话派生的子会话深度为 1；
  0 会让 `delegate_agent` 直接抛 `SubagentDepthError`。递归由白名单排除
  `delegate_agent` + 深度 2 超限双重阻断
- boot 后审计只读报告：注册表里缺失的白名单工具/技能写入日志，不改用户文件

### 路由与委派协议

- 新增技能 `polymer-chief-route`：决策表、非总工可派对象、brief 四段、
  五专家 JSON 输出契约、冲突升级与禁止项
- 六个 polymer preset 的 persona 末尾都追加同一段
  `Delegation protocol (all polymer experts)`；子会话用目标专家自己的 preset
- Scientist 可派全部；Physicist / Characterization / Modeler / Literature / Reviewer
  各自可派对应外部专家，不能派给自己

### 验证

- `verify:profile` EXIT=0：`delegate_agent` + 4 个 `ctx_budget*` + `polymer-chief-route`
  全部注册
- 新增 `verify:agent-team` EXIT=0：
  - 六组调用者 → 目标专家矩阵全部成功，子会话 header `agentPreset` 等于目标
  - 子代理可见工具：literature 17 / characterization 12 / modeler 13 /
    physicist 17 / reviewer 6（preset ∩ 白名单）
  - 禁止调用实测被拒：literature→`pm_sim_flory_huggins`、
    reviewer→`pm_hypothesis_transition`、literature→`delegate_agent`
  - 真实链路：`pm_kb_note`→`kb_search`→`pm_waxs_pro`→`pm_hypothesis_propose`
    →`pm_gate_check`→`pm_analysis_report` 每步有真实返回
- 实机面板：`Agent & Skill` 显示 **5 个专家**，技能 ⚠ 为 **0**（pm2 修复后）；
  打包版在隔离 `DSH_HOME` 首次启动同样写出 5 条定义
- `ctx_budget` 对真实会话返回 `ok:true`（wasteRatio=0），`ctx_budget_tools` 报告 20 个工具组
- `typecheck` EXIT=0；update-checker/update-download 97 测试通过
- **2.2.6 → 2.3.0 应用内更新实测通过**：检查到 2.3.0 → 下载 366,120,562B
  （SHA-256 与 Release digest 一致）→ 重启安装 → 版本 2.3.0 → 5 专家 / 0 ⚠ /
  `/pm/health` 36 工具
- 真实模型驱动的一轮 UI 测试被 DeepSeek 账户 `budget_exceeded`（HTTP 422）阻断，
  未能取得模型调用 `delegate_agent` 的会话记录；机制、权限、工具链路已用真实
  Host/Agent/工具验证，未用 mock

### 安装包

- `PolyMechanism-Studio-2.3.0-x64-Setup.exe`，366,120,562 字节
- SHA-256 `5214dff1e5aecf2e9e16db1a927927a4ca1dacef90ad87736d240f95fd8dc690`
- 构建日志：`Windows installer verification passed`

### 已知限制

- 总工仍看到约 105 个工具（headless 实测 scientist 会话 105，全局 75）；`ctx_budget_*` 可量化开销，必要时 Phase 2 再缩窄
- 没有任务队列/并行工作台（C 方案未采用）
- 合法非 OA 全文仍需要机构/CARSI/人工登录；不接 Sci-Hub
- 打包环境 kb-rag 向量/精排仍可能因 Python numpy ABI 降级关键词
- `maxDepth=1` 的专家不能再派子代理；这是设计约束
- 模型账户预算耗尽时无法完成模型驱动验收；换有额度的模型后可直接重跑
