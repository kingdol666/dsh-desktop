---
name: optics-birefringence
description: 取向→双折射→相位差换算链与两相模型自洽检查
whenToUse: 把取向/结晶结果换算成光学性能，或校验光学结论自洽性时
metadata:
  domain: polymer-optics
  version: 1
---

# 双折射换算链

## 关系式（全部无量纲核对）
- 相位差 R = Δn·d（d 为膜厚，nm；R 单位 nm）
- 单相近似 Δn ≈ f·Δn₀；两相模型 Δn = Xc·fc·Δn_c + (1−Xc)·f_a·Δn_a
- PVA Δn₀ 量级 0.03–0.05（用前须以文献值固定并登记知识卡）

## 分析步骤
1. 由 WAXS 方位扫描算 f（`pm_hermans`，MCP: hermans_factor）。
2. 由膜厚与 R 测量反推 Δn；与 f·Δn₀ 对照。
3. 偏差 >25% → 触发 G-OPTICS 告警：检查两相贡献、水含量增塑、或 fc/f_a 分配。
4. 结论走 `pm_gate_check(kind=optics, opticsDeltaN=..., opticsOrientationFactor=..., opticsIntrinsicBirefringence=...)` 后再登记证据。

## 陷阱
- R 与 d 单位不一致（nm vs μm）造成 Δn 千倍错误——最常见事故
- 拉伸后厚度不均匀：用局部厚度测量

## 自检清单
- [ ] Δn 数量级在 (0, 0.1)
- [ ] f 与 fc/f_a 来源分开记录
- [ ] G-OPTICS 通过后才写结论
