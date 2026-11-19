---
name: saxs-analysis
description: SAXS 归约与结构参数：Guinier Rg、Porod 斜率与长周期估算
whenToUse: 需要纳米尺度结构（片晶周期/相关长度）证据时
metadata:
  domain: characterization
  version: 1
---

# SAXS 一维归约

## 步骤
1. `pm_saxs`（MCP: saxs_reduce）：背景扣除 → Guinier 窗口扫描（q·Rg≤1.3 约束）→ Porod 高 q 斜率。
2. 解读：Porod 斜率 ≈ −4（清晰界面两相）；−3 左右（弥散界面/取向体系需各向异性处理）；偏离 −4 提示界面层存在。
3. 长周期 L = 2π/q*（q* 为相关峰位置，若有）；登记进 payload。
4. `pm_evidence_record`（kind=characterization）。

## 陷阱
- 未除背景的 Guinier Rg 系统性偏大
- 取向样品需分扇区平均，否则 Rg 是混合量

## 自检清单
- [ ] q 轴单位（Å⁻¹/nm⁻¹）与 Rg 单位一致
- [ ] Guinier 拟合窗口与 q·Rg 上限已报告
- [ ] 各向异性样品标注扇区
