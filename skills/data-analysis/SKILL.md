---
name: data-analysis
description: 实验/模拟数据的探索性分析（EDA）与统计检验规程：缺失、异常、分布、相关、组间差异、效应量、多重比较与证据登记
whenToUse: 拿到 CSV/TSV/Excel 导出的测量或模拟数据，需要先做数据质量检查、描述统计、组间比较、相关分析，或判断某个差异是否值得进入机理/门控讨论时
metadata:
  domain: analysis
  version: 1
---

# 数据分析与统计检验（EDA）

## 0. 先定问题，再看数

1. 明确**观测单位**（一个样品/一次拉伸/一个视场/一条链）和**分组变量**；重复测量不能当独立样本。
2. 明确**响应变量**与**协变量**；先画/算分布，再选检验。
3. 任何 p 值都必须附**效应量**与**样本量**；只报 p 不报效应量视为未完成。
4. 探索性分析产生的“显著”不能直接写成机理结论；要进入 `pm_evidence_record` / `pm_gate_check`。

## 1. 标准流程

```text
读入 → 列类型/缺失 → 异常值（IQR，标记不删除）→ 分布（偏度/峰度）
     → 相关（Pearson + Spearman，成对完整）→ 组间（均值/中位数/效应量）
     → 多重比较校正（BH）→ 结论 + 局限 + 下一步
```

- 缺失：报告每列缺失数与比例；不要默认用 0 填充。
- 异常：IQR 1.5 倍规则**只标记**；删除必须在报告里写明理由与剩余 n。
- 分布：偏度 |skew| > 1 或峰度明显偏离时，优先中位数/中位数绝对偏差，或对数据做明确变换后再检验。
- 相关：同时给 Pearson（线性）与 Spearman（单调）；n < 8 不给强相关结论。
- 组间：两组用 Welch t（不假设等方差）；多组用单因素 ANOVA；同时给 Cohen's d / eta²。
- 多重比较：对同一族比较做 Benjamini–Hochberg 校正，报告原始 p 与校正 p。
- 统计显著 ≠ 科学重要：把效应量与测量不确定度、工艺意义一起写。

## 2. 工具

本技能自带只读脚本 `scripts/eda.py`（纯标准库，Python 3.8+，无第三方依赖、无网络）：

```bash
# 全量描述 + 相关 + 可选分组
python scripts/eda.py data.csv --group stretch_ratio --target crystallinity --json

# 只做描述，不分组
python scripts/eda.py data.csv
```

- 输入：UTF-8/GB18030 的 CSV/TSV；Excel 先另存为 CSV。
- 输出：JSON；字段含 `rows/columns/descriptions/correlations/groups/warnings`。
- 脚本自带 Welch t、单因素 ANOVA、Cohen's d、eta² 与 BH 校正，不依赖 scipy。
- 脚本不会改原文件；需要清洗时另存新文件并在报告里写清洗规则。
- 任意可用的 Python 都能跑（DSH 主运行时、`pyenv_create` 的环境、系统 Python）；不因 numpy/pandas ABI 失败而中断。

## 3. 结果写法

报告至少包含：

| 项 | 要求 |
|---|---|
| n | 每组的有效样本数（删除异常后单列） |
| 中心/离散 | 均值±SD 或 中位数[IQR]，说明选择理由 |
| 效应量 | Cohen's d / eta² / 相关系数 r，带方向 |
| 不确定性 | p 值（若计算）、置信区间或测量重复性 |
| 局限 | 样本量、混杂因素、异常值处理、是否探索性 |
| 下一步 | 需要补的测量/重复/分层分析 |

## 4. 与 PM 证据链对接

- 原始数据文件用 `read`/`grep` 查看；分析脚本与输出落在工作区，不覆盖原数据。
- 结论用 `pm_evidence_record` 登记：`sourceType=file|run`，`claimSupport` 写明“统计描述/组间差异”，`strength` 按证据强度选，附文件路径与脚本参数。
- 机理/假设层面的推断交给 `pm_hypothesis_*` 与 `pm_gate_check`；EDA 只提供观测与统计事实。
- 评审专家复核时检查：n、效应量、异常值规则、多重比较、是否把探索性结果写成确证性结论。

## 5. 禁止

- 不得伪造、补点、平滑掉不利数据；不得只报显著的比较。
- 不得把相关系数写成因果；不得把 p<0.05 写成“机理成立”。
- 不得在没有原始数据时凭记忆填数值；没有数据就写 `gaps`。
