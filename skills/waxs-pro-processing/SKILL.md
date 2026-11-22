---
name: waxs-pro-processing
description: WAXS 进阶处理流程（实验室 MATLAB 脚本移植）：扣背底 k 系数法、多峰 Gauss 拟合（结晶度/FWHM/Scherrer）、Hermans 取向度，以及分析完成后必做的 MD+HTML 双报告
---

# WAXS 进阶处理（waxs-pro）

本技能是实验室 MATLAB 处理链（AirRemove_WAXS.m / Peak_Fit_WAXS.m / QX_WAXS.m）的移植与增强。适合：一维 WAXS 剖面（2θ-强度 CSV）、方位角扫描剖面、需要定量结晶度/晶粒尺寸/取向度的聚合物薄膜（PVA/PE/PMP 等）。

## 何时使用

- 已有一维积分 CSV（twotheta_deg,intensity），需要比 `pm_waxs_analyze` 更可控的峰形分解（逐峰角色/边界/初值）。
- 需要 Scherrer 晶粒尺寸、逐峰 FWHM 与 d 间距。
- 有方位角（chi）剖面，需要 Hermans 取向因子 f_hkl 与分子链轴 f_c。
- 样品与本底透过率差异大，需要 k 系数法扣背底（AirRemove 逻辑）。

## 工具链

### 1. `pm_waxs_pro`（op=airremove）— 扣空气背底

对样品与空气本底（同一 2θ 轴的两列 CSV 或两个文件）做 k 系数扣减：

- `k = (mean(sample[:N]) − sample[end]) / (mean(air[:N]) − air[end])`，N 默认 10。
- 返回 k、扣减后曲线、负值占比与警告。**k≤0 或背底平坦时必须阅读 warnings**：说明样品对本底的衰减与本底路径不匹配，绝对定量不可靠。
- 参数：`dataPath`（样品）、`airPath`（本底）、`edgePoints`、`window:[low,high]`（如 [4.5, 25.0]）。

### 2. `pm_waxs_pro`（op=peakfit）— 多峰 Gauss 拟合

峰形为面积参数化 Gauss：`A/(w√(π/2))·exp(−2((x−xc)/w)²)`，A 即积分面积（与 MATLAB 脚本一致）：

- `peaks` 每项：`{center, width, role: 'crystalline'|'amorphous', centerBounds?, widthBounds?, areaBounds?}`；**结晶度 = ΣA_crystalline / ΣA_all**。
- 输出逐峰：中心、面积、FWHM（=w×1.17741）、d 间距、Scherrer 尺寸（`L = K·λ·180/(FWHM·π·cosθ)`，K=0.89，λ 默认 1.5418 Å，同步辐射数据必须传实际波长）。
- **纪律**：给出贴近文献/实测的 `centerBounds` 防漂移；拟合结果必须过物理门（峰位落在预期反射窗口、r²≥0.9、参数不贴边界），否则如实报 NO_FIT 并给出诊断，禁止采信数值。
- 惯例先验：PVA 三结晶峰 ~11.5/19.5/22.9° + 非晶晕 ~20.3°（晕宽 3-5°）；PE 双峰 21.56/23.86°。

### 3. `pm_waxs_pro`（op=orientation）— Hermans 取向度

对方位角剖面（选定 2θ 的 chi 扫描）：

- 可选传入 `airPath` 与第一步的 `k` 做本底扣减；`gapMasks` 剔除探测器间隙/挡板阴影方位窗（MATLAB 脚本用 [[120,154],[165,180]]，按实际数据调）；`fitRange` 默认 90–180°。
- Lorentzian 拟合 `(2a/π)(b/(4(φ−c)²+b²))+d` 后计算 `<cos²φ> = ∫I·cos²φ·sinφ dφ / ∫I·sinφ dφ`、`f_hkl = ½(3<cos²φ>−1)·cos²θ_hkl`、链轴 `f_c = ½(3(1−2<cos²φ>)−1)`。
- `twoThetaPeak` 传所取晶面的 2θ。默认使用修正后的模型值积分；`legacyBaselineSquare:true` 才复现 MATLAB 原版 d² 行为（不推荐）。

### 4. `pm_analysis_report` — 分析完成后的必做收尾（MD+HTML 双报告）

**任何表征分析（WAXS/SAXS/FTIR/取向/拟合）结束后都必须调用本工具**，把结果转为人类可读讲解：

- `payload` 结构：`{title, subtitle, kpis:[{label,value,unit,note}], sections:[{heading, narrative, table?, figure?}], conclusions:[…], nextSteps:[…], artifacts:[{name,path}]}`。
- `narrative` 写"人话"过程说明：做了什么处理、为什么、参数是什么、如何判断可靠；`figure.series` 传 `[{name:'样品', points:[[2θ,I]…]},{name:'拟合', points:…, dash:true}]`（数据可直接取 `pm_waxs_pro` 返回的 curve 数组）。
- `outputDir` 写工作区内目录（如 `reports/waxs-pro`），`name` 如 `pva-ganyi-peakfit`。
- 产出 `<name>.html`（自包含单文件：KPI 卡片+内嵌 SVG 图+表格+结论，浏览器直接打开）与 `<name>.md`（同构内容）。
- 向用户汇报时**同时给出两个文件路径**，并简述 HTML 里能看到什么。

## 流程模板

```
1.（可选）op=airremove：样品+空气 → 扣背底 CSV 与 k
2. op=peakfit：扣背底剖面 → 结晶度/FWHM/Scherrer + 拟合曲线
3.（如有 chi 数据）op=orientation：方位角剖面 → f_hkl/f_chain
4. pm_analysis_report：把 1-3 的数值、曲线、诊断组装成 MD+HTML
5. 结论必须引用证据/工具返回值；NO_FIT 如实报告
```

## 边界

- 本技能不做 2D 帧的方位积分（需要外部积分程序先产出一维 CSV/chi）。
- k 系数法对透过率差异大的样品链（湿凝胶→干膜）仍有限：k≤0 警告出现时只做定性结论。
- Scherrer 尺寸未扣仪器展宽，作为相对比较指标使用。
