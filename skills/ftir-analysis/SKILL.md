---
name: ftir-analysis
description: FTIR 峰分解与氢键/羰基指数：PVA 羟基网络的量化追踪
whenToUse: 需要 O-H 网络变化、水解度残留乙酸根或添加剂引入的羰基证据时
metadata:
  domain: characterization
  version: 1
---

# FTIR 分析

## 关键谱带（PVA）
- 3330 cm⁻¹ O–H 伸缩（氢键网络）｜2940 cm⁻¹ C–H｜1420 cm⁻¹ CH–OH 弯曲｜1090 cm⁻¹ C–O 伸缩（结晶敏感）｜1730 cm⁻¹ C=O（残留乙酸根/氧化）

## 步骤
1. `pm_ftir`（MCP: ftir_peak_fit）：基线+伪 Voigt 分解；报告各峰中心/宽度/高度。
2. 指数定义（写入 payload，保持跨样品一致）：hbondIndex = O–H 区(3000–3600)峰面积；carbonylIndex = C=O 区(1700–1780)峰面积。
3. 登记 evidence：claimSupport 写"指数随<工艺>变化<方向>"，极性按假设方向。

## 陷阱
- KBr 压片法吸水会假性抬高 O–H：ATR 或透射膜法优先
- 峰宽约束放开后与相邻峰纠缠：先固定中心 ±60 cm⁻¹ 窗口

## 自检清单
- [ ] 指数定义与历史数据一致
- [ ] 羰基区无峰时 carbonylIndex≈0 也要登记（作阴性证据）
- [ ] 拟合 r2 ≥ 0.9 才可作 strong

## 报告输出（必做收尾）
分析完成后，必须调用 `pm_analysis_report` 生成 MD+HTML 双报告（谱图与拟合曲线、峰表、指数对比、结论与下一步），并在回复中同时给出两个文件路径。
