---
name: research-project-management
description: 长周期科研项目状态管理：里程碑、任务与跨会话续跑
whenToUse: 新建项目、拆解任务、或恢复中断的研究工作时
metadata:
  domain: methodology
  version: 1
---

# 科研项目管理

## 项目生命周期
1. `pm_project_create`（title + **question**：一句可判别的机理问题；domain）。
2. 里程碑建议序列：文献背景 → 种子图谱导入 → 判别实验设计 → 数据分析 → 结论审查 → 报告。
3. 每完成一步：相关实体状态更新（假设迁移/证据登记/知识卡），会话可中断——项目状态在文件系统，**续跑先 pm_project_status 读状态再行动，不重读全部历史**。

## 任务拆解
- 每个里程碑拆为 ≤5 个可独立验收的子任务（各自有产出物）
- 证据/假设/图谱是唯一事实源；会话总结不替代它们

## 交接纪律
- 中断前写一张 decision 知识卡（scope=project）：当前阶段、下一步、未决问题
- 恢复时先读该卡与项目计数（pm_knowledge_query status=approved scope=project）

## 自检清单
- [ ] question 是可判别的机理问题
- [ ] 每步产出已入账本/图谱
- [ ] 交接卡已写
