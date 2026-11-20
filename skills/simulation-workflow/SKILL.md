---
name: simulation-workflow
description: 通用高分子仿真引擎的调用规程：解析物性层（Layer A）与 LAMMPS MD 层（Layer B）的选择与结果解读
whenToUse: 需要仿真预测支撑机理判别、工艺窗口设计或"预测 vs 实测"一致性检查时
metadata:
  domain: simulation
  version: 2
---

# 通用高分子仿真工作流

## 两层引擎（docs/polymechanism/10 §3）
- **Layer A 解析物性（常驻）**：`pm_sim_chain_mechanics`（FJC/WLC 单链）、`pm_sim_rubber_elasticity`（8-chain 应力/应变能）、`pm_sim_viscoelastic`（Rouse 谱 + WLF/VFT 位移）、`pm_sim_chain_stats`（Rg + 仿射取向 f）、`pm_sim_crystallization`（Avrami 拟合）、`pm_sim_flory_huggins`（相容性 χ/旋节线）、`pm_sim_tg_blend`（Fox-Flory/Gordon-Taylor）、`pm_sim_diffusion`（Arrhenius/Vrentas-Duda）。毫秒级、确定性、真值自测。
- **Layer B MD（需 LAMMPS）**：`pm_sim_md_run`（Kremer-Grest 珠簧：equilibrate/deform/cool）——链级模拟；不可用时工具返回 SIM_UNAVAILABLE，不要改用解析层冒充 MD 结论。

## 选型规则
1. 判别实验的能量/应力预测 → `pm_sim_rubber_elasticity`（单轴 vs 双轴两路，比较变形功 W）
2. 取向预测 → `pm_sim_chain_stats`（仿射 f 是**上界**；实测 Hermans f 应 ≤ 它）
3. 链级细节（缠结、Rg 分布、降温 Tg）→ `pm_sim_md_run`（缺失时如实说明，不得用 Layer A 顶替）
4. 共混相容性/Tg（PVA/PVP 类）→ `pm_sim_flory_huggins` + `pm_sim_tg_blend`
5. 结晶度时序 → `pm_sim_crystallization`（对接 WAXS 结晶度数据）

## 结果纪律
- 每次调用自动归档 artifact + 登记证据（payload 标记 simulation=true）；`record=false` 仅用于快速试算
- 仿真预测 ≠ 实测：claimSupport 必须写明"预测"字样与模型参数（μ、N、χ、T₀ 等）
- 预测 vs 实测的一致性交给 `pm_gate_check` 的 sim-vs-measurement 检查，不得口头宣称"验证了"
- MD 输出的时间尺度是 τ（LJ 单位），不得换算成秒级松弛结论

## 判别用法（接替旧 coupon 扫描）
H1（仿射取向主导）vs H2（取向饱和/无关）：`pm_sim_chain_stats` 给两假设的 f(λ) 预测 → 表征数据（`pm_hermans_analyze`）判别 → 一方 refuted。能量判别用 `pm_sim_rubber_elasticity` 的 W(λx) vs W(λy)。

## 自检清单
- [ ] 模型参数（μ/N/χ/k/Tg…）有出处（文献证据或拟合结果），不是凭空数
- [ ] 结果 status=OK 且 fit.r2 合理才可入账
- [ ] 预测与实测的比较经 gate，不在正文里直接下结论
