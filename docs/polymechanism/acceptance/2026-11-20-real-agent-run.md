# 真实 Agent 验收记录 — 2026-11-20

> 目的：在**新工作目录**里，用真实 Desktop Agent 会话跑「文献阅读 → 数据处理 → CAE → 假设/门控/知识」全链路，边跑边修真实缺陷。
> 结论先行：**业务链路已真实跑通**；发现的 8 个缺陷已修复并有回归测试。实验测得量（Δn）仍未提供，系统按科研纪律拒绝把 CAE 模型估计当成实测。

## 1. 验收环境

| 项 | 值 |
| --- | --- |
| 工作目录 | `D:/pm-acceptance/pva-oblique-2026-11-20`（新建，独立于仓库） |
| 文献 | `papers/ursu-2015-pva-anisotropy.pdf`（Ursu et al., Mater. Plast. 52(1), 2015，开放 PDF）；`papers/nishio-1994-pva-pvp-orientation.pdf`（Nishio et al., Polymer 1994） |
| 数据 | `data/*.csv`：WAXS / FTIR / SAXS / 方位角 / 应力松弛。**物理正演 + 固定噪声的已知真值数据**，不是实验实测；README 与报告均如实标注 |
| CAE | `PM_CAE_ROOT=D:/belendermodels/oblique-biaxial-film-stretching-equipment`，真实引擎 coupon + whole-machine |
| Agent | Desktop `polymer-scientist` preset（会话中经首页专家席位真实切换） |
| 模型 | DeepSeek-V4.1-Flash（应用内配置） |

## 2. 实际结果（全部来自工具返回）

### 2.1 文献

| 项 | 结果 |
| --- | --- |
| `pm_literature_read` | 4 页，13 021 字符，标题/作者提取成功（maxChars=6000 截断） |
| `pm_literature_extract` | 2 条证据：`EV-1-d8b7`（Δn 随拉伸比增大，supports/strong）、`EV-2-238e`（单轴拉伸光轴平行拉伸方向，supports/moderate） |

### 2.2 数据处理（真实 Python numpy/scipy）

| 工具 | 结果 | 真值/质量 | 证据 |
| --- | --- | --- | --- |
| `pm_waxs_analyze` | 结晶度 **0.1173**；非晶晕 19.986°（5.011）；结晶峰 22.503°（0.999） | 注入真值 ≈0.118；r² 0.99952，rmse 0.8649 | `EV-3-6484` |
| `pm_ftir_analyze` | 氢键指数 **336.5336**；羰基指数 **0.0019**；峰 3330.2/2940.3/1444.1/1089.7 cm⁻¹ | r² 0.99959 | `EV-4-361c` |
| `pm_hermans_analyze` | **f = 0.8973**；⟨cos²φ⟩ 0.93155；峰位 0° | 强取向 | `EV-5-5249` |
| `pm_model_fit` (KWW) | **τ = 40.000004 s，β = 0.6**；r² = 1 | 注入真值 τ=40, β=0.6；**精确到触界，说明数据是合成** | `EV-6-9079` |

### 2.3 CAE（真实引擎）

| 调用 | 结果 |
| --- | --- |
| coupon λx=1.2/1.6/2.0, λy=1.0 | 全部 CONVERGED/valid；应变能 **2.021 / 14.490 / 35.083 J**；benchmark passed；`recommended=false`、`eligible=false`、`uncalibrated` |
| whole-machine `pm_cae_run` | CONVERGED/valid；`metrics.birefringence=0.011850`、mean 0.006250；`optics.deltaN=0.011850`、retardation 193.2 nm、`optics.status=UNCALIBRATED`；证据 `EV-2-cb6b` |

### 2.4 假设、门控、知识

| 项 | 结果 |
| --- | --- |
| 种子图谱 | 导入 **23 节点 / 23 条边**（本轮新增 λ→Xc 候选边），skipped=[] |
| 机理查询 | `anchors=[拉伸比,双折射]`、hops=4 → **3 条路径**；首条 `ED-1-b85e + ED-3-7475`（拉伸比→取向→双折射） |
| H1 / H2 | `HY-1-ef26` / `HY-2-fe14`；`proposed → conditional → under_test`（直接 under_test 被状态机拒绝，符合不变量） |
| Gate | 首次 `warn`（未声明被排除竞争项）→ 补声明后 `pass`；optics gate 对 CAE Δn 与 f·Δn₀ 偏差 **70%** 给出 `warn` |
| 知识卡 | `KC-1-d041`，project/fact，**pending**，未自行 approve |

## 3. 验收发现并修复的缺陷

| # | 现象 | 根因 | 修复 |
| --- | --- | --- | --- |
| 1 | `pm_waxs_*` 等只在 persona 文案里，Host 未注册 | G005 只交付了 Python/MCP，未接 Host 工具 | 新增 `science.py` CLI + `science.ts` 桥 + `tools-science.ts` 五个分析工具 |
| 2 | 真实会话所有 pm 工具 `PERMISSION_DENIED: preset standard` | 权限只读 `args.preset` 或过期的 session header；preset 选择事件未反映 | `actingPreset` 改为优先读 **live agentPresets.composedPreset**，header/arg 仅兜底 |
| 3 | `skill` 工具加载失败：`source must be a string` | 编程注册的 Skill 缺少 `source`/`path`/`resourceBase` | `skills.ts` 补 `source:'bundled'`、SKILL.md 路径与目录 base；回归测试断言 source |
| 4 | `pm_cae_coupon` 返回 `invalid output: value is not lossless JSON` | CAE summary 含 `undefined`/非有限值 | 所有工具统一走 `tool-json.ts` 的 JSON 往返净化（NaN→null，缺省字段剔除） |
| 5 | CAE 结果只落 artifact，不进账本 | coupon/run 未登记证据 | `pm_cae_*` 增 `record/claimSupport/polarity/strength`，默认自动登记 `sourceType=run` 证据 |
| 6 | `pm_mechanism_query.paths` 永远 `[]` | `MechanismGraph.query` 硬编码空 paths | 实现锚点两两/`pathTo` BFS 路径枚举并去重排序；回归测试断言 ≥1 条 |
| 7 | H2 的 λ→Xc 环节在图谱中缺失 | 种子图谱缺边 | 新增 `draw-ratio → crystallinity` candidate 边（80–160 ℃，λ 1.5–6），并标注待证据条件化 |
| 8 | 文献工具缺失 | 只有 skill 文案，无 PDF 读取/入账 | 新增 `pm_literature_read`（pypdf）与 `pm_literature_extract`（逐条 DOI/file 证据） |

额外修复：`pm-research` 启动时未把 `caeRoot` 传给 Engine（此前只有环境变量对 E2E 生效），现在 `resolveCaeRoot` 在 `apply()` 中传入；health 报全 22 个工具。

## 4. 尚未解决的边界（如实记录）

1. **没有 Δn 实测数据**：本验收只有 CAE 模型 Δn（`UNCALIBRATED`）与文献定性结论。系统正确拒绝把它当实测证据；要闭合 H1/H2 需真实的椭偏/相位差 + 厚度数据。
2. **数据是物理正演合成**：WAXS/FTIR/SAXS/方位角/松弛带已知真值，用于验证算法回收；不是实验测量。KWW 精确回收（r²=1）本身就是“合成数据”的告警。
3. **CAE coupon 不是整机**：`recommended=false`、`eligible=false`；whole-machine 的 optics 也是未标定模型。
4. **文献检索层未安装**：`pm_literature_read/extract` 能读工作区 PDF 并入账；`dsh-kb-rag` / `dsh-zotero-skill` 仍未安装，跨库检索/批注不在本轮。
5. **前端的 Dockview 工作台未做**：本轮验收走的是现有 upstream 会话 UI + pm-studio 首页；机制图谱/表征面板仍是 G007/G008。
6. **HBond index 定义已补**：`ftir.py` 现在随结果返回 `definitions`（3000–3600 cm⁻¹ 的伪 Voigt 积分面积，absorbance·cm⁻¹；羰基 1700–1780 cm⁻¹），agent 不再需要猜单位。

## 5. 复现

```bash
# 工作目录与数据生成（scripts 在仓库外）
python -I tools/generate_data.py

# 启动 Desktop（带真实 CAE）
PM_CAE_ROOT="D:/belendermodels/oblique-biaxial-film-stretching-equipment" \
  node_modules/electron/dist/electron.exe --remote-debugging-port=9222 lib/main.js \
  "--dsh-desktop-workspace=D:/pm-acceptance/pva-oblique-2026-11-20"

# 会话内：首页「科学家」席位切换 preset（或新会话后选择），随后按 §2 的顺序逐条下达任务；
# 每一步的数值以工具返回为准，会话日志位于 ~/.dsh/sessions/<workspace>/。
```

验收结论：**后端科研编排已具备真实可执行能力**（文献→表征→CAE→假设→门控→知识），且本轮 8 个缺陷均有回归测试；科学结论仍受“无实测 Δn”限制，不能对外宣称实验验证。
