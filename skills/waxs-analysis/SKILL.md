---
name: waxs-analysis
description: WAXS 一维谱处理：结晶度分解、峰位辨认与数据质量门检
whenToUse: 拿到 WAXS 1D 曲线需要提取结晶度/晶型信息时
metadata:
  domain: characterization
  version: 1
---

# WAXS 一维分析

## 步骤
1. 数据门检：2θ 范围覆盖非晶晕（~20°）与主结晶峰（~22.5° 对 PVA）；计数统计无饱和。
2. 背景扣除（空气/基底）后再拟合；`pm_waxs`（MCP: waxs_crystallinity）以"非晶晕高斯 + N 个结晶高斯"分解。
3. 结晶度 = 结晶峰面积 / 总面积；报告 halo 中心/宽度与各峰 areaFraction。
4. 结果登记：`pm_evidence_record`（kind=characterization, payload={crystallinityIndex, peaks, fit.r2}），claimSupport 注明样品与工况。

## 质量门槛
- 拟合 r² < 0.9 → 不得作为 strong 证据
- 峰位漂移 >0.5° 需检查样品-探测器距离标定

## 常见陷阱
- 未扣背景导致结晶度虚高
- 择优取向使方位平均失真：先做方位校正再谈"结晶度"

## 自检清单
- [ ] r2 与 rmse 已入 payload
- [ ] 峰位与文献 PVA 晶型（单斜/正交）核对
- [ ] 方位信息另存（供 Hermans 因子计算）
