---
name: polymer-physics
description: 高分子物理核心框架：取向/结晶/松弛/热力学四大主线与各自适用边界
whenToUse: 需要为实验现象选择理论框架、或判断某机理候选是否在适用范围内时
metadata:
  domain: polymer-physics
  version: 1
---

# 高分子物理理论框架

## 四条主线与适用边界

1. **链取向（Hermans 因子 f）**：仿射变形预期 f 随 λ 上升；高于 Tg 的热松弛使其回落。适用：非晶/两相体系非晶区；λ < 8 之前线性近似可用。
2. **结晶动力学（Avrami）**：n 指数反映成核/生长维度；PVA 热定型典型 n≈2-3。**只在等温且成核方式不变时使用**；斜拉动态过程禁用。
3. **黏弹性松弛（Maxwell/KWW + WLF）**：时间-温度叠加在 Tg+30℃ 以上可用；KWW β<1 表征分布性。位移因子 log aT 用 WLF 常数 C1≈17.4、C2≈51.6K（通用值，PVA 需标定）。
4. **两相光学模型**：Δn = Xc·fc·Δn_c + (1−Xc)·f_a·Δn_a。PVA 本征双折射量级 Δn_c≈0.05、Δn_a≈0.04（需文献确认后固定为模型参数）。

## 何时断言"established"
只有当教科书级理论 + 明确适用条件 + 至少 1 条强支持证据三者齐备，才允许 established（服务端强制）。

## 输出约定
理论判断→写入机理图谱边（pm_mechanism_propose_edge）；经验判断→知识卡（pm_knowledge_propose, kind=pitfall/fact）。

## 自检清单
- [ ] 每个数值带单位与温度点
- [ ] 每条理论引用注明适用窗口
- [ ] 明确区分热力学（平衡态）与动力学（速率）论证
