# PolyMechanism Studio — 实施 Brief（ultragoal 源）

依据 `docs/polymechanism/08-实施计划与里程碑.md`。目标：把 PolyMechanism Studio 做成**真正可投入使用的高分子科研专家智能体工作台**。

四项已定决策：
1. 知识网络 = 复用通用记忆插件 + 自研 Polymer Mechanism Graph 与 RSI 晋升回路。
2. 文献 = dsh-kb-rag（检索/RAG）+ dsh-zotero-skill（精读/批注/证据对比）。
3. 科学计算 = 对接用户既有 CAE/光学引擎（D:\belendermodels\oblique-biaxial-film-stretching-equipment）+ WAXS/FTIR/SAXS 表征分析；不做 LAMMPS。
4. 前端 = 一步到位自建 Dockview 科研工作台（不依赖官方 dockkit 内部 API）。

硬约束：
- 不改 `deepseek-harness/` 子模块与 `vendor/`。
- 第三方插件若 inject `client-runtime` 则不可用（0.2.1-rc.3 无此包）。
- `defineTool` schema 不支持 min/max/pattern/anyOf，范围校验必须在 execute 内。
- Skill 目录不递归，必须 `<root>/<name>/SKILL.md`。
- 仅采纳 MIT / Apache-2.0 插件；AGPL 与无 license 一律不引入。
- 遵循仓库根 `AGENT.md`（含前端风格约束）。

验收基线：完成首个真实案例（PVA 斜拉薄膜取向—双折射机理判别），产出证据化报告；Dockview 工作台通过第 07 文档 §10 视觉与交互验收。
