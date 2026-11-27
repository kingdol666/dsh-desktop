---
name: mechanism-discovery
description: 数据驱动的竞争机理研究：正交实验与检测数据准入、多样化机理假设生成、全数据量化筛选、证伪与判别实验设计、可交付机理报告
whenToUse: 人类给出正交实验条件与检测数据（WAXS/FTIR/SAXS/力学/光学/流变等），需要从多个可能机理中找出能解释全部实验结果的那一个；或现有解释与部分数据冲突、需要重新梳理机理时
metadata:
  domain: methodology
  version: 2
---

# 机理研究（数据驱动的竞争机理筛选）

目标只有一句话：**用全部实测数据，在科学上合理的候选机理空间里做高通量筛选，
证伪到只剩一个能解释所有实验结果的机理，并给出可核对的量化论据。**
没有数据就没有机理；解释不了一部分数据，就不是机理，只是故事。

## 0. 数据准入：先对齐数据，再谈机理

开工前必须向人类确认并整理出下列清单（缺一项就列出、一次问清，不得猜、不得补造）：

| 项 | 要求 |
|---|---|
| 实验矩阵 | 正交/析因设计的**条件列**：拉伸比、温度、时间、速率、浓度、配方等；每行一个实验条件（一个样品） |
| 响应列 | 每种检测给一列：结晶度、取向因子、双折射、模量、断裂伸长、FTIR 指数、SAXS 结构参数……写明单位与计算方法 |
| 重复 | 每条件重复次数；有重复时必须给标准差列（pm_mechanism_screen 的 uncertaintyColumn 用它做加权拟合） |
| 缺失 | 哪些条件没做、哪些检测没测；哪些是仪器限制；哪些是待补实验 |
| 工艺上下文 | 热历史、拉伸路径、退火/热定型、样品厚度；可能改变机理变量的都必须拿到 |

输出一个 `data-inventory`（Markdown 或 JSON）给人类确认；有缺口就直接问：
“为了判别 A/B 机理，我需要在 <条件> 下补测 <响应>，能否提供？”
**人类只提供数据与实验过程，机理推导由你主导。**

## 1. 数据整理与量化汇总（与数据分析专家联动）

- 用 `data-analysis` 技能的脚本做 EDA：缺失、异常（IQR 标记不删）、分布、相关、组间差异、效应量、BH 校正。
- 把宽表整理成 **tidy CSV**：一行一个条件，列 = 条件因子 + 响应（+ 可选 SD 列）。这是
  `pm_mechanism_screen` 的唯一输入格式。
- 对每个响应给出：n、中心值±SD、与主因子的 Spearman ρ、关键组间效应量。
  这些数字是机理筛选的先验依据，也是最终报告的论据。
- 若表征专家（characterization）产出了 WAXS/FTIR/SAXS 结果，先把它折算成每条件的标量响应
  （如结晶度、取向因子、羰基指数），不要让机理筛选直接吃谱图。

## 2. 机理假设空间：生成可判别、有科学依据的候选

- 先查机理图（`pm_mechanism_query`，锚点=现象涉及的量、conditions=当前工况）与库内文献
  （`kb_rag` / `pm_literature_*`，domain 必须显式）；**只从有依据的候选出发**。
- 至少 3 个候选，覆盖不同物理图像（如：应变诱导结晶 vs 取向诱导成核 vs 热历史主导；
  仿射变形 vs 缠结网络滑移；扩散控制 vs 反应控制）。允许并列机制组合（A+B）。
- 每个候选必须写：
  1. `rationale`：科学依据（理论/文献/机理图边），一句话说清因果链；
  2. 对每个关键响应的**定量预测**：函数形式（linear / interaction / quadratic / log /
     power / exp_saturation / exp_decay / arrhenius）、预期系数符号、预期效应方向；
  3. 与其它候选的**判别点**：在哪个条件、哪个响应上两两预测差最大；
  4. 适用边界：温度/拉伸比/速率范围，超出即失效。
- 用 `pm_hypothesis_propose` 登记每个候选（写清判别实验四要素），进入状态机管理。

## 3. 高通量筛选：`pm_mechanism_screen`（核心工具）

对整理好的 CSV 与假设 JSON 调用：

```json
{
  "dataPath": "data/orthogonal.csv",
  "requiredResponses": ["crystallinity", "birefringence", "modulus"],
  "uncertaintyColumn": "crystallinity_sd",
  "hypotheses": "[
    {\"id\":\"H1\",\"name\":\"strain-induced crystallization\",\"rationale\":\"仿射拉伸提高取向与成核密度\",\"terms\":[
      {\"response\":\"crystallinity\",\"form\":\"power\",\"factors\":[\"stretch_ratio\"]},
      {\"response\":\"birefringence\",\"form\":\"linear\",\"factors\":[\"stretch_ratio\"]}],
      \"predictions\":[{\"response\":\"modulus\",\"direction\":\"+\",\"factor\":\"stretch_ratio\"}]},
    {\"id\":\"H2\",\"name\":\"thermal history dominates\",\"rationale\":\"热定型温度决定结晶完善度\",\"terms\":[
      {\"response\":\"crystallinity\",\"form\":\"arrhenius\",\"factors\":[\"temperature_k\"]}]}
  ]"
}
```

引擎会逐机理、逐响应做加权最小二乘拟合并输出：

- `terms[]`：每个响应的 R²、调整 R²、RMSE、MAE、AICc、留一交叉验证 RMSE、拟合参数；
- `predictions[]`：方向性检验（Spearman ρ 与预测方向是否一致）；
- `explainsAll`：**该机理是否在所有 requiredResponses 上都达标且无方向矛盾**；
- `ranking` / `survivors` / `eliminated`（淘汰原因逐条列出）；
- `coverage`：哪些响应被哪些机理解释；
- `discriminators`：两两机理在观测点上的最大预测差；
- `nextExperiments`：最值得补做的条件（差异最大的观测点/因子值）；
- `gaps`：样本量不足、过拟合风险（LOO > 1.5×RMSE）、未达标响应。

**判据纪律（默认阈值，改动必须在报告里说明理由）**：
- 单响应 R² ≥ 0.8 且调整 R² ≥ 0.6；
- 方向预测 |ρ| ≥ 0.25 且符号一致；
- 每个机理必须覆盖全部 `requiredResponses`（缺一个响应即判未解释）；
- 参数符号约束（coefficient_signs）违反即淘汰；
- 留一 RMSE 不得明显大于拟合 RMSE（否则视为过拟合，补数据或简化模型）。

## 4. 证伪与判别实验：把机理差距变成实验清单

1. 读 `eliminated` 的逐条原因：是拟合差、方向反、还是没覆盖响应。**不要用文字软化淘汰结论。**
2. 对存活的 2+ 个机理，看 `discriminators` / `nextExperiments`：
   - 在同一条件上预测差最大的响应 → 优先安排该条件的高精度重复；
   - 在因子范围内预测差随因子放大的位置 → 安排该因子的新水平（正交补点）。
3. 把需要人类做的实验写成一条清晰的请求：条件、次数、检测项、预期判别逻辑
   （“若测得 X 高于 Y → A 成立；若低于 → B 成立”）。
4. 数据回来后再跑一次 `pm_mechanism_screen`，直到只剩一个 `explainsAll=true` 的机理。
5. 若所有候选都被淘汰：说明假设空间不完整——回到第 2 步补机理（查文献/机理图/新物理图像），
   禁止强行选“最不差”的机理交差。

## 5. 机理输出：可核对、可复现、可审计

最终交付一份 `pm_analysis_report`（HTML+MD），必须包含：

| 章节 | 内容 |
|---|---|
| 数据与设计 | 正交矩阵、每条件重复数、检测方法与不确定度来源 |
| 候选机理 | 每个机理的依据、定量预测、适用边界、被淘汰原因 |
| 筛选结果 | 排名表：机理 × 响应 × R²/adjR²/AICc/LOO，方向检验 ρ |
| 最终机理 | 存活机理的因果链（条件→结构→性能），参数值±不确定度，适用窗口 |
| 判别力 | 关键判别实验与两两预测差，为什么其他机理被排除 |
| 局限与缺口 | 未覆盖响应、样本不足、需补实验清单、外推边界 |

同时必须：
- 用 `pm_evidence_record` 把筛选结果登记为证据（附 CSV 路径与拟合指标）；
- 用 `pm_hypothesis_transition` 把存活机理迁移到 supported（附判别证据），淘汰的迁移 refuted/archived；
- 用 `pm_gate_check(kind=hypothesis)` 过科研门控；
- 机理结论必须带 evidenceIds，禁止无证据断言；模拟输出只能作为预测，不能替代测量证据。

## 6. 与其它专家的分工（联动契约）

- **数据分析（data-analysis 技能 / characterization 专家）**：负责 EDA、异常标记、效应量与
  标准差列；向机理研究交付 tidy CSV + 数据字典 + 缺口清单。
- **表征专家（characterization）**：把谱图折算成每条件标量响应；负责补测实验的执行与证据登记。
- **建模专家（modeler）**：为候选机理提供正向模型（pm_sim_*）或参数初值；
  其预测用于设计判别实验，不当作测量证据。
- **文献专家（literature）**：提供机理依据与同类体系先例（带 DOI/页码），不提供数据。
- **审查专家（reviewer）**：只审“数据是否支持该机理”，不替你改机理。
- **总工（chief）**：负责编排与裁决；机理判决权在物理学家（physicist），证据登记权在
  表征/建模/文献，门控在 reviewer。

## 7. 自检清单（提交前逐条核对）

- [ ] 数据准入清单齐全，缺口已向人类提出并得到回应
- [ ] 每个候选机理都有 scientific rationale 与量化预测（形式+符号+方向）
- [ ] 所有关键响应都在 requiredResponses 中，且被存活机理覆盖
- [ ] 淘汰的机理有明确量化原因（R²/方向/覆盖），没有“解释得通”式放行
- [ ] 存活机理通过 R²/adjR²/方向/参数符号/LOO 全部判据
- [ ] 判别实验建议具体到条件、检测项与判别逻辑
- [ ] 报告含完整证据表与 evidenceIds，并通过 pm_gate_check
- [ ] 模拟预测与实测证据明确区分；外推边界写明
