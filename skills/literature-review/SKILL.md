---
name: literature-review
description: 文献检索、高分子领域两阶段筛选、精读与结构化证据抽取的流程与引用纪律
whenToUse: 需要为机理假设补充文献证据、在线检索新文献或建立领域背景时
metadata:
  domain: methodology
  version: 2
---

# 文献工作流

## 流程
1. **在线检索**：`pm_literature_search`（OpenAlex/Crossref + 高分子预筛，结果自带 rubric 分与理由）；本地库检索用 `kb_search`/`kb_rag`（dsh-kb-rag 未装时明确声明不可用）。
2. **两阶段筛选**：
   - 第一级（工具）：`pm_literature_search`/`pm_literature_screen` 的 rubric 分（core≥70 / important≥45 / reference）只做**预筛排序**，不等于采纳。
   - 第二级（你）：对 core/important 候选逐条读摘要做**终审**，输出 `accept / review / reject` + 一句理由。判断依据：
     - 是否高分子机理研究（有材料-工艺-结构-性能链条），而非仅材料报告；
     - 是否落在当前课题的体系（如 PVA/双轴拉伸/取向-双折射）或可直接类比；
     - 论文测量了什么（可作证据）vs 解释了什么（只可作背景）。
   - reject 的候选也要给出理由；core 分但终审 reject 的候选记入"工具-终审分歧"，是校准线索。
3. **下载**：`pm_literature_download`（机构网络内出版商直连/OA 链；`MANUAL_REQUIRED` 时把 DOI 直链交给用户浏览器下载，下载后放入 literature/ 目录再 `pm_literature_read`）。
4. **精读分层**：先读摘要与图表结论 → 方法节（样品制备/测量条件）→ 结果数值。用 dsh-zotero-skill（若安装）做原文定位问答与双语批注。
5. **结构化抽取**：材料（分子量/水解度）、工艺（T/λ/θ/rate）、结构量（Xc/f/L）、性能（Δn/R/E）四组数值，每条带条件与单位。
6. **证据登记**：`pm_evidence_record`（sourceType=doi，sourceRef=DOI），claimSupport 写成"在<条件>下测得<量>=<值>±<不确定度>"；极性按它对当前假设的支持/反驳判定。知识卡走 `pm_knowledge_propose`（reviewer approve 后才晋升）。

## 引用纪律
- DOI 必须来自原文或工具返回，不许凭记忆构造；无法核验时标 strength=weak。
- 区分"论文测量的"与"论文解释的"——只有前者可直接作 evidence。
- 下载工具不绕过付费墙；`CAMPUS_REQUIRED`/`MANUAL_REQUIRED` 时不要反复重试同一 DOI。

## 自检清单
- [ ] 每条文献证据有 DOI 与测量条件
- [ ] 未核验 DOI 标记为 weak
- [ ] 综述结论不直接当一手数据引用
- [ ] 终审三分法（accept/review/reject）覆盖了所有 core/important 候选，reject 有理由
- [ ] 工具预筛分与终审结论的分歧已记录
