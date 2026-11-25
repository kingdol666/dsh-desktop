## PolyMechanism Studio 2.4.0

科研作业台扩展：在 2.3.0 五专家委派的基础上，接入 Zotero 本地库、四源文献采集、
可复现 Python 环境、版面感知 PDF、第二意见、过程汇报与 STL 预览；补齐 EDA 技能、
KB 向量解释器覆盖和专家白名单迁移。

### 新增可选插件（均已集成并实测）

| 插件 | 版本 | 作用 | 冲突检查 |
|---|---|---|---|
| `dsh-zotero-local` | 0.4.0 | 18 个 `zotero_*` 工具：检索、条目、全文、批注、笔记、导出；写操作必须 `zotero_authorize` | 与 `dsh-zotero-skill`（仅技能）无工具重名；`kb_zotero` 仍走 SQLite，互不影响 |
| `dsh-lit-harvest` | 0.1.2 | 4 个 `lit_*` 工具：OpenAlex/Crossref/arXiv/EuropePMC + Unpaywall + 覆盖度 | 与 PM 文献工具、`lit-library` 工具名不重名；不接 Sci-Hub |
| `dsh-python-env` | 0.1.2 | 5 个 `pyenv_*` 工具：工作区内 venv 创建/安装/删除 | 路径限制在工作区；不改全局 Python |
| `dsh-doc-router` | 0.6.3 | `doc_route` + `pdf_markdown`：先判版面，再多栏 PDF→Markdown | 与 `pm_literature_extract`/`kb_ingest` 工具名不重名；补版面感知路径 |
| `dsh-second-opinion` | 0.1.0 | `ask_advisor` 等 4 工具：独立顾问会话 | 与 `delegate_agent` 机制不同；不占用专家名 |
| `dsh-progress-nudge` | 0.3.0 | 长工具循环插入过程汇报（设置页可调） | 纯客户端；`includeSubagents=false` |
| `dsh-preview-stl` | 0.1.1 | 右栏 STL 预览：尺寸/体积/表面积/水密 | 纯客户端；沿用现有 document preview |

### 明确不装（评估结论）

- `dsh-literature-lab`、`@a9i5k4/dsh-literature`：各自建第二套文献库/阅读器，与
  `dsh-kb-rag`、`dsh-lit-library`、PM 下载链路重叠；后者还依赖 rc.3 缺失的
  `@deepseek-ai/dsh-client-runtime`。
- `@58catmiao/dsh-sciwork`：独立 `research` preset + 科研库 + Origin 依赖，和 PM
  账本/专家体系重复。
- `dsh-answer-reviewer`：每轮额外 LLM 打分，与 Reviewer 专家重复且增加 token 成本。
- `dsh-origin-bridge`：本机未安装 Origin；`dsh-openfoam-doctor` 在 npm 不存在。
- `dsh-lit-fetch`：Sci-Hub 优先，合规风险，继续不接。

### 缺口落实（对应 2026-11-25 调查报告 §七）

| 缺口 | 2.4.0 状态 |
|---|---|
| 合法非 OA 全文 | 已具备 `pm_literature_browser_download`（真实 Chromium/CDP，支持 `profileDir`/`chromePath`）；机构登录仍需人工 |
| 高分子 MD/COMSOL | LAMMPS 路径已通（`pm_sim_md_run`：equilibrate/deform/cool，Rg/应力/Tg，缺 LAMMPS 时 `SIM_UNAVAILABLE`）；GROMACS/COMSOL 仍未实现 |
| 路由+队列+白名单 | 路由与白名单已在 2.3.0 完成；任务队列仍未采用（C 方案不引入） |
| 总工工具过多 | 未缩窄；新增插件后全局 107、科学家会话 137。`ctx_budget_*` 可量化，专家面仍为 12–33 |
| 跨专家共享记忆 | 协议落地：PM 账本/KB/Zotero 原文为共享真相；brief 必带 evidenceIds；`cognition_remember` 按 `project:/expert:/topic:` 标签写经验；Reviewer 只 recall |
| 自动 EDA | 新增 `data-analysis` 技能 + 纯标准库 `eda.py`（缺失/异常/分布/相关/Welch t/ANOVA/Cohen's d/eta²/BH），不依赖 pandas/scipy |
| KB 向量降级 | vendored `dsh-kb-rag@1.6.8-pm1` 支持 `KB_RAG_PYTHON`；实测 hybrid 命中 2 docs/64 vectors。打包运行时仍无 torch，需把 `KB_RAG_PYTHON` 指向带 torch 的 Python |
| 论文自动入库 | PM 下载成功即 `kb_ingest`；Zotero 走 `kb_zotero`；新增 `zotero_fulltext` 直接读原文 |
| 模拟队列/可视化 | 已装 `python-env` + `progress-nudge` + `preview-stl`；仍无作业队列，MD 也不产出 STL |

### 专家白名单迁移

`agent-team-seed` 新增幂等迁移：已有 2.3.0 五专家 store 且未被用户改过时，自动补入
2.4.0 白名单（Zotero/文献采集/PDF/Python/记忆/第二意见）；用户加过自定义工具或技能
的 store 保持原样并记录日志，不覆盖。

### 验证

- `typecheck` EXIT=0
- `verify:profile` EXIT=0：新插件工具与 `data-analysis` / `python-env` / `doc-routing`
  技能全部注册
- `verify:agent-team` EXIT=0：
  - 全局 107 工具；科学家会话 137
  - 六组委派矩阵通过；子代理工具面 33 / 18 / 21 / 18 / 12 / 18
  - 禁止调用 3/3 被拒
  - 真实调用：`lit_search` 3 篇；`doc_route` 7 页 2 栏；`pdf_markdown` 1737 字符；
    `zotero_search` 命中 1 条 + `zotero_fulltext` 80000 字符；`pyenv_discover`
    scanned=1；`kb_search` hybrid 命中
- `vitest`：package 49、preset-composition 20、presets-integration 4、
  shipped-plugin-bundles 6、agent-team-seed 12，全过
- 真实 Electron 启动：客户端 bundle 含 `dsh-preview-stl` / `dsh-progress-nudge`，
  控制台 0 错误；界面仍为 6 位专家（科学家 + 五专家）

### 安装包

- `PolyMechanism-Studio-2.4.0-x64-Setup.exe`
- 383,011,459 字节
- SHA-256 `690b85512006e9ed4c30038b7c8733610989fae951d72e80d364458fca6c82b1`
- 构建日志：`Windows installer verification passed`

### 已知限制

- 打包运行时没有 torch/PyMuPDF4LLM；需要 `KB_RAG_PYTHON`/`DOC_ROUTER_PYTHON`
  指向带依赖的 Python。本机已把 `pymupdf4llm` 安装到 Anaconda，doc-router 用
  `pythonPath: python` 可直接工作。
- Zotero 本地 API 需要 Zotero 运行且开启“允许本机其他应用通信”；写操作还需人工
  点击授权。
- `lit_harvest` 的 Unpaywall DOI 解析需要 `LIT_HARVEST_MAILTO`；未设置时搜索仍可用。
- 第二意见会创建独立会话并调用模型，按需使用，不自动触发。
- 仍无总工窄工具 preset、无任务队列、无 GROMACS/COMSOL 适配。
