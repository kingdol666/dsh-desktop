---
name: scientific-review
description: 独立审查规程：证据-结论链审计与异议登记
whenToUse: 结论升级前、报告发布前、或对他人登记的证据存疑时
metadata:
  domain: methodology
  version: 1
---

# 独立审查规程

## 审计清单（逐条过，每条给 verdict）
1. **引用完整性**：claim 的 evidenceIds 是否存在且哈希校验通过（pm_evidence_verify）。
2. **极性一致**：supports 证据是否真支持陈述方向；refutes 是否真反驳。
3. **强度匹配**：strong 只给"文献一手数据/收敛仿真/重复实验"；模型拟合单值不算 strong。
4. **条件一致**：证据的测量工况是否落在机理边 conditions 窗口内。
5. **竞争假设**：supported 结论必须排除过竞争（pm_gate_check G-COMPETE）。
6. **光学自洽**：Δn=f·Δn₀ 偏差 >25% 且无解释 → 异议。

## 异议登记
发现问题时登记知识卡（kind=pitfall，scope=project，正文引用证据 id 与具体矛盾点）→ 人类/reviewer 决定是否阻断结论。

## 纪律
- 审查者不修改证据；只产出 verdict/objection
- 拒绝必须给可操作理由（缺什么数据/哪条不匹配）

## 自检清单
- [ ] 六条逐项有结论
- [ ] 异议引用了具体证据 id
- [ ] 未越权改写他人记录
