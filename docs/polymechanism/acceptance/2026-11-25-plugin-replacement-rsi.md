# 记忆/知识库/文献库替换与 RSI 验收（2026-11-25，v2.2.6）

## 1. 起点：截图里的「记忆」是谁

- 面板归属：**memory-eternal 0.49.11**。它在 `package.json` 的 `dsh.client` 中声明注入
  `@deepseek-ai/dsh-client-ui-settings`，所以「设置 → 记忆」自动出现统计/搜索/图谱页。
- 当时的真实数据（`~/.pmstudio/memory-vault/memory-eternal.db`）：
  - 已确认记忆卡 **0**
  - quarantine **265** 条（自动捕获被安全规则隔离）
  - 账本 8 条
- 结论：面板复杂，但没有可用的已确认记忆；用户感知的「太复杂」成立。

## 2. 现有收录盘点（替换前）

| 数据 | 位置 | 规模 | 可见性 |
| --- | --- | --- | --- |
| kb-rag 论文全文库 | `D:\pm-acceptance\pva-oblique-2026-11-20\.kb\kb.sqlite` | 16 文档 / 841 块 / 743 向量 | 只有 `kb_stats`/SQLite，无浏览页 |
| dsh-library | `~/.pmstudio/storages/dsh_library.json` | 2 分区 / 52 块 | 只有 `/library` 与工具，无 UI |
| PM 知识卡 | `~/.pmstudio/pm/knowledge/{global,project}/cards.json` | 全局 3 / 项目 5 | 机理工作台 |
| memory-eternal | `~/.pmstudio/memory-vault/memory-eternal.db` | 0 卡 / 265 隔离 / 8 账本 | 设置→记忆（截图） |

## 3. 候选调研与取舍

真实下载 tarball / README / 工具清单核验，不是只看市场文案。

| 候选 | 结论 | 理由 |
| --- | --- | --- |
| memory-eternal | **退役** | 0 张确认卡；面板是统计/图谱运维台，不符合「简单」 |
| @a9i5k4/dsh-auto-memory | 拒绝 | 25MB 包、九页导航、记忆 Hub/日历/思维导图，比原插件更重 |
| dsh-engram | 拒绝 | 23 工具、九视图、嵌入模型下载；项目隔离很强但不「简单」 |
| dsh-memory-tiers | 拒绝 | 六层 + 分流模型 + 记忆星图，配置面过重 |
| dsh-kb-panel | 拒绝（记忆） | 无 agent 记忆工具，只有自动注入；无法按需 recall |
| dsh-simple-wiki-memory | 备选 | 极简、Markdown、可读；但没有自动蒸馏/准则本，RSI 不足 |
| **dsh-cognition-engine 0.14.0** | **采用（记忆/RSI）** | 7 工具；双时态；主题；反思三段式 → 准则本；helpful/harmful；有效期；侧栏单面板 |
| dsh-kb-rag | **退役** | 按工作区一个库，无课题分区，无浏览页 |
| dsh-library | **退役** | 有 library 命名空间，但无 UI，和知识库工具重叠 |
| **dsh-knowledge-base 0.1.5** | **采用（知识库）** | 文件夹=分区；`kb_query category=` 硬过滤；会话内「知识库」页可导入/建目录/检索；FTS5 中文 trigram；PDF/DOCX 进程内解析 |
| **dsh-lit-library 0.2.1** | **采用（文献库）** | 一课题一项目区；一篇一行索引；摘录逐字回查；索引是工作区里的 Markdown 总表，人可直接看 |
| dsh-knowledge 0.5.4 | 拒绝 | AGPL-3.0 |
| dsh-research-skills 0.1.2 | 退役 | rc.3 上 skill 调用 `source must be a string`，本就不工作 |

## 4. 最终结构

```
记忆  dsh-cognition-engine  → ~/.dsh/cognition-engine/
知识库 dsh-knowledge-base    → $DSH_HOME/knowledge-base/kb.sqlite（本机 ~/.pmstudio/knowledge-base/）
文献库 dsh-lit-library       → <工作区>/lit-projects/<项目区>/
```

- 记忆分区：`tags` / `subject` / 面板「主题」；作用域字段保留。
- 知识库分区：文件夹（category），工具检索时传 `category` 即硬过滤。
- 文献库分区：`lit-projects/<项目>`，每个项目独立索引、独立编号、独立标签词表。

## 5. 代码与打包变更

- `dsh-plugin-desktop/package.json`：移除 `memory-eternal`、`dsh-kb-rag`、`dsh-library`、
  `dsh-research-skills`；加入 `dsh-knowledge-base@0.1.5`、`dsh-lit-library@0.2.1`、
  cognition-engine（vendored，见下）。
- `DESKTOP_SHIPPED_PLUGIN_BUNDLES`：7 项（zotero / cognition / knowledge-base / lit-library /
  cite-verify / research-core / matlab）。
- **退役清单** `DESKTOP_RETIRED_PLUGIN_BUNDLES`：`dsh-kb-rag`、`memory-eternal`、
  `dsh-library`、`dsh-research-skills`。
  - `desktopBundleList`、`loadRecoveryFilteredProfile`、`syncDesktopManagedProfileBundles`
    三处都会剔除。数据目录不删除。
- 启动断言：`verify-profile-boot` 现在要求
  `cognition_context/remember/recall`、`kb_query/import/list`、`lit_import/find` 等工具
  与 `lit-library` skill 在册。
- 新增 `scripts/verify-research-tools.mjs`：真实调用两分区 KB、两标签记忆、两项目文献库，
  断言不串区。
- 版本 2.2.6。

### 5.1 覆盖安装的第一次失败（已修）

第一次打出的 2.2.6 覆盖 2.2.5 后启动进入 Recovery：
`cannot resolve package "memory-eternal" from the Desktop installation`。

根因：退役剔除只写在 `syncDesktopManagedProfileBundles`，而它在 `prepareDesktopProfile`
**之后**执行；profile 里残留的 `memory-eternal` 在准备阶段解析时就已失败。

修复：把退役剔除前移到 `desktopBundleList`（`ensureDesktopProfile` 调用）和
`loadRecoveryFilteredProfile` 的 bundle 过滤。重装后首次启动即成功，profile 清单实测：

```
@deepseek-ai/dsh-base
@deepseek-ai/dsh-web-app
dsh-zotero-skill
dsh-cite-verify
@perrylink/dsh-research-core
dsh-matlab-workbench
dsh-cognition-engine
dsh-knowledge-base
dsh-lit-library
```

## 6. 上游缺陷与本地补丁（cognition-engine）

1. **准则操作按钮 405**：面板 `playbookAct` 用 GET 调
   `/cognition-engine/playbook/act`，而路由注册为 `{ method: 'POST' }`。实测点击
   「接受」返回 `405 {"error":"method not allowed"}`。
   - 补丁：`vendor/dsh-cognition-engine/` 重新打包 `0.14.0-pm2`，在 client.js 的
     `playbookAct` 调用加 `{ method: 'POST' }`。
2. **CPE 门把新准则永久转 shadow**：`cpeStrictGate` 默认 true，回归集为空时接受即
   `playbook.reject(id, '转 shadow：回归集不足')`。Desktop 没有 S5 回归工作流，个人规则
   永远无法生效。
   - 补丁：vendored `cordis.patch.yml` 设 `cpeStrictGate: false`；人工「接受/拒绝」仍是门。
3. 未修、已记录：
   - `cognition_state` 不返回准则队列，准则数只能看 `cognition_reflect.stats` 或面板。
   - 工具层 `scope: workspace/session` 未绑定 workspaceId/sessionId；分区实际用 tags/subject。
   - 面板「接受」要求先填适用边界（必填），这是设计而非 bug。

## 7. 验证

### 7.1 自动闸门

- `yarn build` EXIT=0
- `verify:profile` EXIT=0（新工具与 lit-library skill 全在册）
- `verify:literature` EXIT=0（四套 bundle 共存；`dsh-knowledge-base` 与
  `dsh-cognition-engine` 两个 client 入口都进入 Web 客户端图）
- `verify:research` EXIT=0（KB 分类隔离 / 记忆标签隔离 / 文献项目隔离）
- `shipped-plugin-bundles` 5/5、`package` 49/49（版本 2.2.6）
- 备注：`profile-context.spec` 的 advanced/compatibility 用例在 HEAD 上本就失败，与本次无关。

### 7.2 实机安装（覆盖 2.2.5）

- 修复后的 2.2.6 静默安装成功，启动进入正常主界面（不是 Recovery），URL
  `dsh-desktop-version=2.2.6`。
- 侧栏顶部出现 **认知引擎**；旧「设置→记忆」入口消失。
- 会话视图出现 **知识库** tab：目录树（验收-FTIR / 验收-WAXS 各 1 文件 1 条目）、
  导入、AI 整理、检索、新建目录均可用。
- 最终安装包（第二轮：kb-rag + 移除 MATLAB）：`PolyMechanism-Studio-2.2.6-x64-Setup.exe`，
  366,097,153 字节，SHA-256
  `1fe44c6d5e9940c3a37038f02ce1d338b03e181d3a0416982490af1d40b5929b`。
- 本机 KB HTTP API 实测 `GET /api/kb/list` 无渲染器凭据 → **403 forbidden**（桌面
  Web 服务全局门禁生效，不是裸奔的 localhost 写接口）。

### 7.3 真实会话（session 7bb510f0，Polymer Scientist）

- 知识库：
  - `kb_import` 两文件分别进 `验收-WAXS` / `验收-FTIR`，返回 ids 1/2；
  - `kb_query` 结晶度@WAXS=1、@FTIR=0；反向 `羰基`@WAXS=0、@FTIR=1 → 双向硬隔离；
  - `kb_list` 分区正确。
- 记忆：
  - `cognition_remember` 两条（mem-1/mem-2），`cognition_recall` 按 tags 分别命中对应 id；
  - 智能体如实指出：tags 是硬过滤，无相关命中时会以 similarity=0 兜底同标签条目，
    验收应看 id 而不是 count。
- 文献库：
  - `lit_init project=验收-226` → mode B；
  - `lit_import` 真实 7 页 PDF（Polymers 2025, 17, 3320）→ A001，全文 txt 抽取成功；
  - `lit_find` count=1；
  - 索引绝对路径 `...\lit-projects\验收-226\refs\参考资料总表.md`，表内含 A001。

### 7.4 RSI 全链路

1. 反思引擎默认关闭；`cognition_reflect(playbook)` 原文报错
   `反思引擎未开启：准则蒸馏需要真实模型，请在设置页切到「真实模型」`。
2. 面板「设置→反思引擎→真实模型」切换为 `ustc/deepseek-flash-2` 后：
   - 第一次蒸馏：正确判定两条验收数值是「一次性事实，不是准则」，`candidates: []`；
   - 写入一条可操作规则记忆后：产出候选 `ctxt-00001`
     「核对命中的 id，不要只看 count；同标签无相关命中会以相似度 0 兜底」，pending=1；
   - 再写重复规则：反思识别为「与现有准则完全重合」，不再新增，`marked: 1`（helpful+1）。
3. 面板「重新蒸馏」可用；人工「＋ 手动新增」创建 `ctxt-00003`，立即 active，注入 92 字符。
4. **接受按钮修复后**：新蒸馏出 `ctxt-00004/00005`；填适用边界
   「仅限 2.2.6 插件验收」后点「接受」，`ctxt-00004` 变为 **active**（revision 13）。
5. **注入实证**：`cognition-injection.jsonl` turn 5
   `{"ruleIds":["ctxt-00004"],"chars":294,"verdict":"pending"}` —— 生效准则确实进入下一轮上下文。
6. 清理：测试用 5 条记忆、4 条准则、KB 条目/目录、`lit-projects/验收-226` 均已删除；
   当前 `memory current=0`、`rules=[]`、`kb entries=0`。

### 7.5 旧数据

- 原 `.kb/kb.sqlite`（16 篇）、`dsh_library.json`（2 分区）、memory-eternal vault **原样保留**，
  未删除、未迁移。新知识库/文献库是空库，用户可自行导入或指定分区方案后迁移。

## 8. 已知边界

- 准则蒸馏依赖真实模型；未开启时只会报错，不会假装产出。
- `cpeStrictGate` 已关闭（个人桌面无回归集）；代价是新准则没有回归证据，只有人工确认。
- 旧 16 篇论文不会自动出现在新知识库；PDF 原件仍在。
- 记忆数据落在 `~/.dsh/cognition-engine/`（插件默认，不跟 `DSH_HOME` 走）；
  知识库落在 `~/.pmstudio/knowledge-base/kb.sqlite`。
- 只发布 Windows x64；安装包未签名。
- 本轮未发布到 GitHub Releases；发布前需用户确认。

## 9. 回滚

- 重装 2.2.5 Setup 即可回到旧插件组合；旧数据目录未删，回滚后仍可读。
- 或在 profile 的 `dsh.profile.bundles` 中手动恢复旧 bundle 名（不推荐，2.2.6 的
  install anchor 已不含旧包）。

## 10. 发布状态

- 2.2.6 Setup 已构建并**本机覆盖安装验证**，未上传 GitHub Releases（发布前需用户确认）。
- 仓库改动未提交；提交时需包含 `vendor/dsh-cognition-engine/`（pm2 tarball + README）
  与本文档。

## 11. 追加：Polymer Scientist 答非所问 / 随机词汇的根因（2026-11-25 下午）

### 复现

会话 `75a24e4c`（Polymer Scientist，16:12，ustc/deepseek-flash-2，reasoning max）问
「你能够有机理研究的功能吗，是否可以根据我给你的实验场景和数据研究对应数据发生机理」，
回复为破碎中英混排（`I'load了机制发现（mechanism discoveryim）...`）。

### 排查

- 用户消息本身是**正确 UTF-8**（终端里看到的 `浣犺兘...` 是显示编码假象；
  `s.encode('gbk','ignore').decode('utf-8')` 可还原原句）。
- 系统提示 8,811 字符，正常；模型 262K 上下文，未溢出。
- **真正的污染：skill-catalog 用户消息 69,208 字符 / 242 个技能**。
  来源：`~/.agents/skills`（226 个，ZCode/Claude 等共享技能库）+ `~/.zcode/skills`（204，重叠）
  + `~/.pmstudio/skills`（4）+ 应用自带 polymer 技能。
  69KB 无关技能目录 + ~80 个工具 schema 一起灌入，deepseek-flash-2 的注意力被淹没。
- 知识库/记忆不是原因：当时 KB 0 条、memory 0 条、准则 0 条；
  cognition 的「立场」里残留 5 条测试项（含「禁止引入外部数据库依赖」），已删除。
- 另发现 profile `dependencies` 里残留 `dsh-kb-rag`（不在 bundles，未加载），已从
  `~/.pmstudio/profiles/desktop/package.json` 与 `node_modules` 删除。

### 修复

`src/main.ts` 的 `withDesktopDshHome` 与启动环境同时固定：

```
DSH_AGENTS_HOME = <DSH_HOME>/agents
```

即只扫描 `$DSH_HOME/agents/skills`（默认不存在）而不是共享的 `~/.agents/skills`；
应用自带 skills、`$DSH_HOME/skills`、项目 `.dsh/skills`、插件注册技能仍保留。

### 实测对照

| 条件 | skill-catalog | 同一问题的回答 |
| --- | --- | --- |
| 修复前 | 69,208 字符 / 242 个技能 | 破碎中英混排 |
| `DSH_AGENTS_HOME=$DSH_HOME/agents` 启动 | **5,082 字符 / 28 个技能** | 「能，我可以做机理研究：查机理图谱，提出可判别、可被证据否证的竞争假设，用仪器数据和仿真支点检验，再经科学门控与独立审查给出结论。」 |

28 个技能 = 4 个 `~/.pmstudio/skills` + polymer/文献/办公/插件技能；全部与科研相关。

### 当前外部插件清单（profile bundles）

`dsh-zotero-skill`、`dsh-cognition-engine`、`dsh-knowledge-base`、`dsh-lit-library`、
`dsh-cite-verify`、`@perrylink/dsh-research-core`、`dsh-matlab-workbench`
（另 `@deepseek-ai/dsh-base` / `dsh-web-app` 为宿主）。
不再加载：`memory-eternal`、`dsh-kb-rag`、`dsh-library`、`dsh-research-skills`。

## 12. 第二轮：移除 MATLAB，论文知识库改为 kb-rag（2026-11-25 傍晚）

### 12.1 MATLAB 清理

`dsh-matlab-workbench` 需要本机 MATLAB 授权 + 官方 MATLAB MCP Server，本机并不满足；已：
- 从 `dsh-plugin-desktop/package.json` 删除依赖；
- 从 `DESKTOP_SHIPPED_PLUGIN_BUNDLES` 移除；
- 加入 `DESKTOP_RETIRED_PLUGIN_BUNDLES`，升级时自动从 profile 清单剔除；
- `verify:profile` 的 `dsh_matlab_prepare` 硬断言删除；
- 旧包若残留在 profile，下次启动被退役清单摘掉。

### 12.2 为什么把知识库从 dsh-knowledge-base 换成 dsh-kb-rag

用户本轮需求是「**论文下载后自动入库 + 手动存一段 + 随时用库增强回答**」。两者的实测对比：

| 能力 | dsh-knowledge-base 0.1.5 | dsh-kb-rag 1.6.8 |
| --- | --- | --- |
| 论文 PDF 全文索引 | 有（pdfjs，FTS5） | 有（章节/页/DOI/作者/年份） |
| 下载后自动入库 | 无（需自写集成） | `kb_fetch(ingest=true)` 或 `kb_ingest` |
| 综合回答 | 只返回 chunk（模型自己拼） | `kb_rag` 证据 + 引用 + HTML 答案 |
| 分区/浏览 UI | 有（文件夹） | 无（按工作区一个库） |
| 旧 16 篇 | 不在（不同库） | **在原 `.kb`，立即可用** |
| 运行依赖 | Node `node:sqlite`，无 Python | Python + numpy/torch（向量） |

最终选 **kb-rag**：论文场景的入库、检索、引用和 RAG 是它的主路径；旧 16 篇/841 块直接沿用。
代价：打包版 Python 的 numpy ABI 不兼容（`numpy.core.multiarray failed to import`）且未带
torch，向量索引会降级为 BM25 关键词检索（`kb_search` 返回 `mode_used:"keyword"` 并明确提示），
但入库、关键词检索、`kb_rag` 证据链和引用都能用。若要全语义，需要另配 torch/faiss 的 Python 环境
（约 1GB），本轮没有擅自打包。

### 12.3 自动入库与手动存段落（本轮新增）

- `pm_literature_download` / `pm_literature_browser_download` 成功后：
  - 读取结果里的 `data.path`；
  - 调用 `kb_ingest`（dsh-kb-rag）把 PDF 建索引；
  - 在返回里追加 `data.kbIngest`：`{ok:true,result:...}`；KB 未装时 `{ok:false,skipped:'dsh-kb-rag is not installed'}`，下载本身仍成功。
- 新增 `pm_kb_note`：
  - 参数 `text`（必填）、`title`、`tags`；
  - 写入 `workspace/literature/notes/<时间>-<标题>.txt`（kb-rag 的 Markdown 切块对纯标题+正文返回 0 块，TXT 稳定 1 块）；
  - 自动 `kb_ingest`，返回 `path` + `kbIngest`；
  - 权限六位专家均可调用（reviewer 也能存评审笔记）。
- 新增技能 `kb-grounded-answer`：
  - 回答前 `kb_stats` → `kb_search`（英文术语串；quick/deep）；
  - 综合多篇用 `kb_rag`，正文按 `[标题, 年份](DOI)` 引用；
  - 无命中明确说「根据现有资料无法回答」；
  - 论文事实进 KB，经验/偏好进 cognition，不混用。

### 12.4 高分子机理模拟：不装 MATLAB 用什么

插件市场**没有**现成的高分子 MD/COMSOL 插件（`dsh-molecular-viewer` 是蛋白结构且要求 DSH ≥0.2.2-rc.5；
`@bushizhanghan/dsh-openfoam-doctor` 只体检 OpenFOAM 算例，需本机 OpenFOAM；`multisim` 是电路）。
**本应用已内置 9 个 `pm_sim_*` 高分子模拟工具**，比 MATLAB 桥更贴合本场景：

- 无需外部软件：`pm_sim_chain_stats`、`pm_sim_chain_mechanics`、`pm_sim_rubber_elasticity`、
  `pm_sim_viscoelastic`（Rouse/WLF/VFT）、`pm_sim_crystallization`（Avrami）、
  `pm_sim_flory_huggins`、`pm_sim_tg_blend`（Gordon–Taylor）、`pm_sim_diffusion`（Arrhenius/Vrentas–Duda）。
- 需要 LAMMPS：`pm_sim_md_run`（Kremer–Grest equilibrate/deform/cool）；未装 LAMMPS 时明确
  `SIM_UNAVAILABLE`，其余 8 个解析工具照常可用。
- 结果进入 Evidence Ledger，可接 `pm_model_fit`、`pm_analysis_report` 和机理图谱。

### 12.5 本轮验证

- `verify:profile` EXIT=0（kb-rag 10 工具 + `pm_kb_note` 在全局注册表；`kb-grounded-answer` 技能在册）。
- `verify:literature` EXIT=0（zotero + kb-rag + lit-library + cognition 共存，客户端图含
  `dsh-kb-rag` / `dsh-cognition-engine`）。
- `verify:research` EXIT=0：
  - `kb_ingest` 两篇 TXT → **chunks 2**；
  - `kb_search WAXSONLY` → 命中 WAXS 文档、没有 FTIRONLY 泄漏；
  - `pm_kb_note` → 写 TXT + 自动 `kb_ingest` → `kb_search NOTEONLY` 命中；
  - `kb_rag` → 返回 evidence；
  - 记忆 tags 隔离、文献项目区隔离仍通过。
- `verify:research` 加 `VERIFY_RESEARCH_NETWORK=1` 时，真实 DOI 下载在本轮网络下
  `read operation timed out`，**下载→自动入库的端到端未在本次网络下跑通**；自动入库代码与
  `pm_kb_note` 共用同一个 `kb_ingest` 桥，手记入库已实测通过，下载路径待网络稳定后复测。
- `pm-research` health 36 工具。
- 打包版 kb-rag 的向量索引因 numpy ABI 降级关键词；`kb_search` 明确返回 `mode_used:"keyword"`。
- **高分子模拟实跑**（`VERIFY_SIM=1`，临时项目）：
  `pm_sim_flory_huggins(n1=1000, n2=200, chiA=0.02, chiB=0.5, T=420 K)` →
  `chi=0.5000`、`spinodalChi=0.0060`、`chiCritical=0.00524`、`phiCritical=0.309`、
  `verdict=UNSTABLE_PHASE_SEPARATE`（χ 超旋节线，热力学要求分相），并登记仿真证据。
  这证明不装 MATLAB/LAMMPS 也能跑解析型高分子机理模拟；`pm_sim_md_run` 仍需 LAMMPS。

### 12.6 当前 shipped bundles（第二轮）

`dsh-zotero-skill`、`dsh-kb-rag`、`dsh-cognition-engine`、`dsh-lit-library`、
`dsh-cite-verify`、`@perrylink/dsh-research-core`。
退役：`dsh-knowledge-base`、`dsh-matlab-workbench`、`memory-eternal`、`dsh-library`、
`dsh-research-skills`。
