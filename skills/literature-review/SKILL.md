---
name: literature-review
description: 文献检索、精读与结构化证据抽取的流程与引用纪律
whenToUse: 需要为机理假设补充文献证据或建立领域背景时
metadata:
  domain: methodology
  version: 1
---

# 文献工作流

## 流程
1. **检索**：安装 dsh-kb-rag 后用 `kb_search`/`kb_rag`；未安装时明确声明检索不可用，仅凭用户提供文献工作。
2. **精读分层**：先读摘要与图表结论 → 方法节（样品制备/测量条件）→ 结果数值。用 dsh-zotero-skill（若安装）做原文定位问答与双语批注。
3. **结构化抽取**：材料（分子量/水解度）、工艺（T/λ/θ/rate）、结构量（Xc/f/L）、性能（Δn/R/E）四组数值，每条带条件与单位。
4. **证据登记**：`pm_evidence_record`（sourceType=doi，sourceRef=DOI），claimSupport 写成"在<条件>下测得<量>=<值>±<不确定度>"；极性按它对当前假设的支持/反驳判定。

## 引用纪律
- DOI 必须来自原文，不许凭记忆构造；无法核验时标 strength=weak。
- 区分"论文测量的"与"论文解释的"——只有前者可直接作 evidence。

## 自检清单
- [ ] 每条文献证据有 DOI 与测量条件
- [ ] 未核验 DOI 标记为 weak
- [ ] 综述结论不直接当一手数据引用
