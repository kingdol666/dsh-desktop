# 验收：2.4.0 插件扩展与缺口复核

日期：2026-11-26  
版本：PolyMechanism Studio 2.4.0  
依据：[2026-11-25 插件调查报告](../2026-11-25-polymer-superagent-plugin-survey.md) §五/§七  
上一版：[2026-11-25 Superagent 验收](2026-11-25-superagent-agent-skill.md)

## 1. 结论

- 调查报告 §五 的 13 个可选插件全部做了安装级评估：**7 个安装并集成，6 个明确不装**。
- 安装项均通过真实 Host 启动、工具注册、专家白名单、客户端 bundle 加载与真实调用；
  未发现工具名冲突、重复 loader 条目或客户端注入错误。
- §七 七个缺口：**4 项已解决，3 项部分解决**（GROMACS/COMSOL、任务队列、总工工具面
  仍未做）；本轮新增 EDA 技能与 `KB_RAG_PYTHON`，把“可落地”的部分补齐。

## 2. 缺口复核

| # | 缺口 | 状态 | 证据 / 仍未做的部分 |
|---|---|---|---|
| 1 | 合法非 OA 全文 | 已解决 | `pm_literature_browser_download` 真实 Chromium/CDP，支持 `profileDir`/`chromePath`，状态含 `DOWNLOADED`/`MANUAL_REQUIRED`/`CLOUDFLARE_CHALLENGE`/`BROWSER_UNAVAILABLE`；2.2.5 验收已真实取回 Cloudflare 论文。机构 SSO 仍需人工登录，这是授权边界，不是插件缺口 |
| 2 | 高分子 MD/COMSOL | 部分 | `pm_sim_md_run` 已生成/运行/解析 Kremer-Grest（equilibrate/deform/cool；Rg/应力/Tg），`resolveLammps` 支持 `PM_LAMMPS_BIN`/`PM_LAMMPS_HOME`/PATH，缺失时 `SIM_UNAVAILABLE`；GROMACS/COMSOL 未实现 |
| 3 | 路由+队列+白名单 | 部分 | 路由 + 白名单已由 `dsh-agent-skill@0.3.0-pm2` 落地（六 preset 可协调、五专家、`maxDepth=1`、白名单外工具被拒）；任务队列/并行工作台未采用（C 方案不引入） |
| 4 | 总工仍看到 101 工具 | 未解决（数量上升） | 2.4.0 全局 107、科学家会话 137；专家面 12–33。`ctx_budget_*` 可量化固定开销；未做窄工具总工 preset |
| 5 | 跨专家共享工作记忆 | 已解决（协议层） | `polymer-chief-route` §5：PM 证据账本/假设/机理/KB/Zotero 原文为共享真相；brief 必带 `evidenceIds`/DOI/路径；`cognition_remember` 用 `project:/expert:/topic:` 标签；Reviewer 只 recall。子代理上下文仍不共享，这是设计边界 |
| 6 | 自动 EDA/统计检验 | 已解决 | 新增 `data-analysis` 技能 + `skills/data-analysis/scripts/eda.py`：纯标准库，缺失/IQR 异常/偏度峰度/Pearson+Spearman/Welch t/单因素 ANOVA/Cohen's d/eta²/BH；系统 Python 与打包运行时 Python 都实测通过 |
| 7 | KB 向量在打包 Python 降级 | 已解决（需配置） | vendored `dsh-kb-rag@1.6.8-pm1` 新增 `KB_RAG_PYTHON`；实测 `KB_RAG_PYTHON=D:/anaconda3/python.exe` 时 `kb_search mode=hybrid` 命中 2 docs/64 vectors。打包运行时没有 torch，必须把变量指向带 torch 的 Python，否则仍走关键词 |
| 8 | 论文自动入库只覆盖 PM 下载 | 已解决（现有路径） | PM 下载成功即 `kb_ingest`；Zotero 走 `kb_zotero`；新增 `zotero_fulltext` 直接读附件全文。其它下载器仍不自动，统一走 PM 或 Zotero |
| 9 | 模拟作业队列/可视化 | 部分 | 已装 `dsh-python-env`（5 工具）、`dsh-progress-nudge`（过程汇报）、`dsh-preview-stl`（STL 预览）；仍无作业队列，MD 也不产出 STL |

## 3. 可选插件评估

### 3.1 安装（7）

| 插件 | 版本 | 许可 | 工具/UI | 结论 |
|---|---|---|---|---|
| `dsh-zotero-local` | 0.4.0 | MIT | 18 工具 | 安装。读不需要密钥；写必须 `zotero_authorize` 人工授权；与 `dsh-zotero-skill`（仅技能）和 `kb_zotero`（SQLite）不冲突 |
| `dsh-lit-harvest` | 0.1.2 | Apache-2.0 | 4 工具 | 安装。四索引 + Unpaywall，有超时/限速/重试边界；不抓全文、不绕付费墙 |
| `dsh-python-env` | 0.1.2 | MIT | 5 工具 + 技能 | 安装。工作区内 venv，argv 调用、无 shell、路径逃逸拒绝 |
| `dsh-doc-router` | 0.6.3 | MIT | 2 工具 + 技能 | 安装。先判版面再转换；依赖 PyMuPDF/PyMuPDF4LLM，配置 `pythonPath` |
| `dsh-second-opinion` | 0.1.0 | MIT | 4 工具 | 安装。独立顾问会话；不冒充用户；Reviewer 获 `ask_advisor` |
| `dsh-progress-nudge` | 0.3.0 | MIT | 客户端设置页 | 安装。长工具循环汇报；`includeSubagents=false`，不打扰子代理 |
| `dsh-preview-stl` | 0.1.1 | MIT | 客户端预览 | 安装。认证 `/api/preview/stl`，浏览器端解析，不上传 |

### 3.2 不装（6）

| 插件 | 版本 | 不装理由 |
|---|---|---|
| `dsh-literature-lab` | 0.2.4 | 自带第二套文献库 + 5 页 UI + 采集/筛选/OA 下载，与 `dsh-kb-rag`、`dsh-lit-library`、PM 链路重叠；会制造两个“库” |
| `@a9i5k4/dsh-literature` | 0.3.6 | 自带文献库/阅读器；客户端 inject `@deepseek-ai/dsh-client-runtime`，rc.3 未提供；与 Zotero/PM 重叠 |
| `@58catmiao/dsh-sciwork` | 0.4.10 | 独立 `research` preset + 科研库 + Origin 依赖（74 个 MCP 工具），与 PM 账本/六 preset 重复 |
| `dsh-answer-reviewer` | 0.7.7 | 每轮额外 LLM 打分，与 Reviewer 专家重复，增加预算消耗 |
| `dsh-origin-bridge` | 0.4.21 | 本机未安装 Origin；装了也只会返回 `missing_originpro` |
| `dsh-openfoam-doctor` | — | npm 不存在该包（`npm pack` 无产物），无法评估/安装 |

### 3.3 冲突检查

- **工具名**：新增 33 个工具全部唯一；`zotero_*`、`lit_*`、`pyenv_*`、`doc_route`、
  `pdf_markdown`、`ask_advisor`/`advisor_*` 与现有 75 个工具无重名。
- **Zotero**：`dsh-zotero-local` 与本机 `dsh-zotero-skill` 不共享工具；前者走 23119
  本地 API，后者只提供技能正文；`kb_zotero` 直接读 `zotero.sqlite`，三条路径独立。
  写入必须人工点击授权，未绕过。
- **文献**：`lit_search` 与 PM `pm_literature_search`、`lit-library` 的 `lit_find`
  参数/返回不同，无注册冲突；`lit-harvest` 只做元数据与 OA 链接，不下载全文。
- **PDF**：`doc_route`/`pdf_markdown` 与 `pm_literature_extract`/`kb_ingest` 并存；
  前者补多栏版面，后者仍是入库主路径。
- **Python**：`dsh-python-env` 只改工作区 `.venv`；`KB_RAG_PYTHON`/`DOC_ROUTER_PYTHON`
  是解释器选择，不改全局环境。
- **客户端**：`dsh-preview-stl`、`dsh-progress-nudge` 的 `dsh.client.inject` 模块在
  44.x 内核全部存在；真实 Electron 启动控制台 0 错误。

## 4. 实机验证

### 4.1 Host / 工具

`corepack yarn workspace dsh-plugin-desktop verify:agent-team`，附加探针：

```
KB_RAG_PYTHON=D:/anaconda3/python.exe
VERIFY_NEW_TOOLS=1
VERIFY_ZOTERO_LOCAL=1 VERIFY_ZOTERO_QUERY=polyvinyl
VERIFY_PYENV=1
VERIFY_DOC_PDF=<Hibi 1988 PDF>
VERIFY_KB_ROOT=D:/codes/dsh_workspace/.lit-smoke/kb
VERIFY_KB_QUERY="URSU L" VERIFY_KB_MODE=hybrid
```

实测输出：

```
global tools 107
kb_stats docs=2 chunks=69 vectors=64
kb_search q=URSU L mode=hybrid hits=1
lit_search ok=true papers=3 errors=[]
doc_route format=pdf pages=7 columns=2
pdf_markdown chars=1737 pagesUsed=pages 1
zotero_search count=1 key=6JC5N6PC title="Influence of Glycerol ... Polyvinyl Alcohol Films" fulltextChars=80000 mode=text
polymer-scientist -> literature preset=polymer-literature tools=33
polymer-physicist -> characterization preset=polymer-characterization tools=18
polymer-characterization -> modeler preset=polymer-modeler tools=21
polymer-modeler -> physicist preset=polymer-physicist tools=18
polymer-literature -> reviewer preset=polymer-reviewer tools=12
polymer-reviewer -> characterization preset=polymer-characterization tools=18
forbidden calls denied (3)
scientist session tools 137
pyenv_discover scanned=1 venvs=0
six-preset delegation matrix, expert tool isolation and real chain passed
```

说明：
- Zotero 本地 API 需 Zotero 运行；测试时已启动 Zotero，读完 `zotero_fulltext` 后
  保持运行，用户可自行关闭。
- `ask_advisor` 只验证注册；真实调用会创建独立会话并消耗模型预算，本轮未自动触发。
- `kb-rag scope question failed` 是 headless 环境下没有“活调用者”可问，属预期。

### 4.2 客户端 / Electron

dev 版 `electron lib/main.js --remote-debugging-port=9333`，隔离 `DSH_HOME`/`APPDATA`：

- 启动日志：`agent team: seeded physicist, characterization, modeler, literature, reviewer`
- 客户端资源列表含 `dsh-preview-stl/client.js`、`dsh-progress-nudge/client.js`
- 控制台 exception / error / log error：**0**
- 首页仍显示 6 位专家（科学家 + 五专家）与“仿真引擎就绪”

### 4.3 回归

- `typecheck` EXIT=0
- `verify:profile` EXIT=0（Creator、plugin manager、两代 Profile HMR）
- `vitest`：package 49 + preset-composition 20 + presets-integration 4 +
  shipped-plugin-bundles 6 + agent-team-seed 12 = **91 passed**
- `agent-team-seed` 新增迁移测试：纯 2.3.0 store 自动补 2.4.0 白名单；用户自定义
  whitelist 不被覆盖

## 5. 本轮代码/数据变更

| 项 | 变更 |
|---|---|
| `dsh-plugin-desktop/package.json` | 7 个新依赖；`dsh-kb-rag` 改为 vendored `1.6.8-pm1`；版本 2.4.0 |
| `dsh-plugin-desktop/src/profile.ts` | `DESKTOP_SHIPPED_PLUGIN_BUNDLES` 15 项 |
| `dsh-plugin-desktop/src/agent-team-seed.ts` | 专家白名单扩展 + 幂等迁移 |
| `dsh-plugin-desktop/cordis.patch.yml` | `doc-router` 的 `pythonPath`/`noteLanguage`、`lit-harvest` 的 `mailto` 环境变量 |
| `skills/data-analysis/` | 新技能 + 纯标准库 `eda.py` |
| `skills/polymer-chief-route/` | `maxDepth` 修正；新增共享真相/经验记忆章节 |
| `vendor/dsh-kb-rag/` | `KB_RAG_PYTHON` 补丁 + `1.6.8-pm1` tarball |
| `scripts/verify-agent-team.mjs` | 新工具/Zotero/PDF/Python/KB hybrid 可选探针 |
| `scripts/verify-profile-boot.mjs` | 新插件工具与三个新技能断言 |

## 6. 环境变更

- `D:/anaconda3/python.exe` 安装 `pymupdf4llm 2.1` / `pymupdf_layout 2.1` /
  `pymupdf 2.1`（原 1.28.2 被升级）。`doc-router` 的 `pythonPath: python`
  因此可用；KB hybrid 用同一解释器（torch 2.14.0 已有）。
- 测试期间启动过 Zotero（本地 API 23119）；未修改 Zotero 库。

## 7. 安装包

| 项 | 值 |
|---|---|
| 文件 | `PolyMechanism-Studio-2.4.0-x64-Setup.exe` |
| 大小 | 383,011,459 字节 |
| SHA-256 | `690b85512006e9ed4c30038b7c8733610989fae951d72e80d364458fca6c82b1` |
| 构建 | `Windows installer verification passed` |
| 打包内插件 | 7 个新插件全部在 `resources/app/node_modules`；`app/skills/data-analysis` 与 `app/skills/polymer-chief-route` 已包含 |

## 8. 仍待办（不在 2.4.0）

- 总工窄工具 preset / 工具面缩窄。
- 任务队列与并行工作台（C 方案）。
- GROMACS/COMSOL 适配；MD 产出 STL/作业进度。
- 打包运行时内置 torch/PyMuPDF4LLM（目前靠 `KB_RAG_PYTHON`/`DOC_ROUTER_PYTHON`）。
