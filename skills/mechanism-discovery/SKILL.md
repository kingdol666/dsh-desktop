---
name: mechanism-discovery
description: 竞争假设方法论：从现象到可判别机理假设的完整编排
whenToUse: 面对未解释的实验现象、需要生成并判别候选机理时
metadata:
  domain: methodology
  version: 1
---

# 机理发现方法论（竞争假设闭环）

## 五步编排
1. **现象形式化**：把观察写成可量化陈述（量、条件、变化方向），登记 Observation。
2. **图谱检索**：`pm_mechanism_query`（锚点=现象涉及的量；conditions=当前工况）——只从返回的候选路径出发，**不凭空发明机理**；返回的 missingKnowledge 是实验设计的输入。
3. **竞争假设成对生成**：至少 2 个可区分机理，每个必须写明判别实验四要素（design/observable/expectedIfTrue/expectedIfFalse），`pm_hypothesis_propose`。
4. **判别执行**：用 CAE 参数扫描（`pm_cae_study`）或真实表征数据产生判别观测量；证据登记后按状态机迁移。
5. **审查沉淀**：`pm_gate_check` → reviewer 审查 → 知识卡沉淀（kind=decision/fact，附条件与证据 id）。

## 纪律
- 一个假设没有判别实验就不许离开 under_test（服务端强制）
- "解释得通"不等于"被支持"：支持=判别观测落在 expectedIfTrue 且有强证据
- 被反驳的假设进 archived 保留陈述，不删除

## 输出约定
判别结论 → pm_hypothesis_transition(supported/refuted) + pm_gate_check(kind=hypothesis)；跨任务经验 → 知识卡。

## 自检清单
- [ ] ≥2 竞争假设且互斥可判别
- [ ] 判别观测量的测量方式已存在（或 CAE 可产出）
- [ ] 证据极性与假设方向一致
