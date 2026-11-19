---
name: experiment-design
description: 判别实验设计四要素与样本量/窗口选择原则
whenToUse: 假设已提出、需要设计能区分竞争机理的实验/仿真时
metadata:
  domain: methodology
  version: 1
---

# 判别实验设计

## 四要素（pm_hypothesis_propose.testDesign 必填）
1. **design**：操作变量、固定变量、测量点
2. **observable**：判别观测量（必须已有测量/仿真手段）
3. **expectedIfTrue / expectedIfFalse**：两个假设下的预期方向或区间

## 设计原则
- **最大信息量**：选使两个 expected 差异最大的工况点（CAE 扫描可先做敏感性定位）
- **一次只动一个变量**；斜拉体系至少固定 (T, rate) 之一
- **窗口覆盖**：扫掠范围跨过两个假设的适用边界（如 T 跨 Tg+15℃）
- **重复与不确定度**：判别用数据 ≥3 次独立测量，报告均值±SD

## 真实实验补充要求
- 样品含水状态统一（干燥规程写进 design）
- 厚度/双折射同步测；方位扫描存原始文件（artifact 哈希）

## 输出约定
设计完成后把四要素写进假设记录；结果按 `pm_evidence_record`（kind=experiment, artifactPath=原始数据文件）登记。

## 自检清单
- [ ] expectedIfTrue/False 互斥
- [ ] 观测量手段已存在
- [ ] 工况窗口写明
