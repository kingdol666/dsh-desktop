---
name: polymer-chief-route
description: 高分子科研任务路由：判断该自己做还是派给 physicist/characterization/modeler/literature/reviewer，并给出可独立执行的 brief 与 JSON 证据契约
whenToUse: 收到跨专业的高分子任务、需要多专家协作、需要判断由谁执行，或要把结果汇总成证据化结论时
metadata:
  domain: orchestration
  version: 1
---

# 高分子总工路由

六个 polymer preset 都可以当协调者：Polymer Scientist 是默认总工，其余五个专家也能把不属于自己专业的部分派给对应专家。子会话以**目标专家自己的 preset** 运行（`agentPreset`），所以权限矩阵、工具白名单和技能都按专家角色判定。

## 1. 决策表：先判断谁做

| 任务 | 执行者 | 说明 |
|---|---|---|
| 机理候选、理论解释、标度/相分离/粘弹/扩散 | `physicist` | 需要假设链与判别观测 |
| WAXS/SAXS/FTIR/Hermans、峰拟合、取向/结晶度 | `characterization` | 需要真实数据文件与拟合质量 |
| 解析/数值模拟、参数反演、预测与适用边界 | `modeler` | 需要模型与参数 |
| 检索/筛选/下载/入库、逐字引文、DOI 证据 | `literature` | 只报告库内真实命中 |
| 证据门、结论复核、冲突裁决 | `reviewer` | 只读；不产生新数据 |
| 研究设计、跨专家汇总、报告、用户沟通 | 当前协调者自己 | 不把总控工作外包 |

**非总工的可派对象**：

- Physicist → `characterization`（补观测）、`modeler`（补模拟）、`reviewer`（复核机理）
- Characterization → `physicist`（解释）、`modeler`（拟合/预测）、`reviewer`（复核证据）
- Modeler → `physicist`（机理约束）、`characterization`（补参数）、`reviewer`（复核模型）
- Literature → `physicist`（解释文献）、`reviewer`（复核证据链）
- Reviewer → `characterization`（补证据）、`physicist`（复核机理）

不能派给自己，也不能让专家再派子代理（专家白名单不含 `delegate_agent`，`maxDepth=0`）。

## 2. brief 四段（200–800 字，自包含）

调用 `delegate_agent(agent, prompt)` 时，`prompt` 必须包含：

1. **目标**：一句话说明要回答的科学问题与交付物。
2. **约束**：体系/材料、温度/应变速率/分子量等已知条件；必须使用哪些工具；不得做什么。
3. **验收**：什么算完成（例如“给出峰位、拟合 R²、对应 evidenceId”）。
4. **已知事实**：相关 evidenceId、文献 DOI、数据文件路径、已有假设；子代理看不到本会话历史，必须写全。

补充：一次只派一个明确任务；不要写“顺便看看别的”。并行任务分别派发，各自 brief 独立。

## 3. 输出契约

专家必须返回一个 JSON 对象（不要散文、不要代码围栏），至少含：

```json
{
  "findings": [],
  "evidenceIds": [],
  "gaps": [],
  "nextActions": []
}
```

各专家的专用字段：

- `physicist`：`hypotheses[]`、`nextActions[]`
- `characterization`：`measurements[]`、`conditions[]`、`fitQuality{}`
- `modeler`：`model`、`parameters{}`、`goodnessOfFit{}`、`predictions[]`、`limits[]`
- `literature`：`papers[]`（DOI/标题/年份/分区）、`quotes[]`（逐字+页码）
- `reviewer`：`verdict`（pass/revise/reject）、`violations[]`、`missingEvidence[]`、`requiredChanges[]`

**协调者只接受带 `evidenceIds` 的结论**；没有 ID 的内容只能作为假设或待办，不能写成事实。

## 4. 升级与冲突

- 专家返回 `blocked` 或 `gaps` 非空 → 补数据、换专家，或直接问用户；不要假装完成。
- 两个专家结论冲突 → 派 `reviewer` 裁决，并把双方 `evidenceIds` 一起给它。
- 需要新观测才能判别 → 派 `physicist` 或 `modeler` 设计判别实验，再决定是否执行。
- 文献无命中 → `literature` 明确写“库内无证据”；协调者不得用自己的记忆补成文献事实。
- 任何专家给出 `verdict: revise/reject` → 先改，再重新过 `pm_gate_check`，不得跳过。

## 5. 禁止

- 协调者不得把专家结果改写成没有 evidence ID 的“事实”。
- 协调者不得替专家做其专业细节（例如自己算峰、自己拟合），只做拆解、派活、汇总、报告。
- 专家不得调用 `delegate_agent`；不得越权调用白名单外的工具。
- 不得把“文献里大概有”当成 `kb_search` 命中；不得编造 DOI、页码或数值。
