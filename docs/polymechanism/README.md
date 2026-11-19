# PolyMechanism Studio — 文档索引

> 面向高分子科学的 AI 科研工作台。基于 `anywhere-labs/dsh-desktop` fork 改造，复用 DeepSeek Harness（DSH）智能体运行时与 Cordis 插件体系。

## 阅读顺序

| # | 文档 | 内容 | 读者 |
| --- | --- | --- | --- |
| 01 | [架构解读](01-架构解读.md) | dsh-desktop 完整运行逻辑：Electron 壳、Host、Web carrier、Profile、插件组合、更新与打包 | 所有开发者（必读） |
| 02 | [UI 改造指南](02-UI改造指南.md) | 已完成的品牌改版清单 + UI 扩展四级模型 | 前端与产品 |
| 03 | [初版执行计划](03-项目执行计划.md) | 第一阶段构想（**已被 04-09 取代**，仅保留历史决策背景） | 历史参考 |
| **04** | [调研与复用矩阵](04-调研与复用矩阵.md) | 6245 插件目录调研、兼容性红线、采纳/禁入清单、必须自研项 | 决策者（必读） |
| **05** | [系统架构设计](05-系统架构设计.md) | 分层架构、数据模型、存储、后端服务、前后端交互、目录规划 | 后端/架构（必读） |
| **06** | [Agent 与知识网络设计](06-Agent与知识网络设计.md) | 六专家 Preset、Skills、RSI 知识回路、机理图谱、科研宪法 | Agent/算法（必读） |
| **07** | [前端设计与交互规范](07-前端设计与交互规范.md) | 视觉系统、三区布局、九面板交互、状态与验收 | 前端/设计（必读） |
| **08** | [实施计划与里程碑](08-实施计划与里程碑.md) | M0-M4 里程碑、Story 拆解、并行轨道、风险、首个真实案例 | 项目总控（必读） |
| **09** | [API 与工具契约](09-API与工具契约.md) | 工具 schema、服务接口、HTTP 路由、MCP 声明、权限矩阵 | 实现者（必读） |

> **开发约束**：仓库根 `AGENT.md` 是最高规范（含前端风格约束）；`AGENTS.md` 为上游规则；冲突以 `AGENT.md` 为准。

## 一句话定位

**PolyMechanism Studio = DSH 运行时（Agent 引擎）+ 自有桌面壳（已改版）+ 领域层（6 专家 / 证据链 / 机理图谱 / RSI 知识网络）+ 自研 CAE/光学与表征计算引擎 + Dockview 科研工作台。**

## 已确认的四项架构决策（2026-11-19，用户 taste & judge）

1. **知识网络**：混合——复用通用记忆插件 + **自研 Polymer Mechanism Graph** 与 RSI 晋升回路。
2. **文献**：`dsh-kb-rag`（检索/RAG）+ `dsh-zotero-skill`（精读/批注/证据对比）。
3. **科学计算**：**对接你既有 CAE/光学引擎** + WAXS/FTIR/SAXS 表征分析（不做 LAMMPS）。
4. **前端**：**一步到位 Dockview 科研工作台**（自建，不依赖官方 dockkit 内部 API）。

## 当前状态

- ✅ Fork：`kingdol666/dsh-desktop`（上游 MIT）
- ✅ Stable 桌面包品牌改造完成并**实机启动验证**（窗口标题 PolyMechanism Studio、advanced 模式、上游 UI 与既有数据完好）
- ✅ `AGENT.md` 开发规范（含前端风格约束）与读取链
- ✅ 调研完成：345 官方包能力盘点 + 6,245 插件目录筛选 + 逐个 GitHub 核实
- ✅ 计划完成：04-09 六份文档
- ⏳ 待启动：M0（插件采纳冒烟 + 仓库骨架）
- ⏳ 已知待办：Beta 包镜像改版；`dsh-client-ui-dockkit` 缺失导致的 `sidebar-right` 解析隐患；`recovery/App.tsx` 一处上游遗留 typecheck 错误
