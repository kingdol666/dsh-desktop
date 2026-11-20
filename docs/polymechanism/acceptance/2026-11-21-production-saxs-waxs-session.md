# 生产环境验收：缓存清理 → 生产包启动 → SAXS/WAXS 真实 session → Zotero/KB

日期：2026-11-21
运行环境：Windows 10.0.26200 x64；PolyMechanism Studio 2.1.0（win-unpacked，Electron 44.7.0）
模型：USTC 网关 `deepseek-flash-2`（reasoningEffort=max）
会话：`session-46bb2975-7754-4bfb-93ae-4e3887d4d4d0`，项目 `PR-13-b72b`
工作区：`D:\pm-acceptance\pva-oblique-2026-11-20`

## 1. 缓存清理（不触碰用户数据）

| 目标 | 清理前 | 清理后 |
| --- | --- | --- |
| `%APPDATA%\PolyMechanism Studio`（Cache/GPUCache/Code Cache/Crashpad 等） | 196 MB | 1.2 MB |
| `dsh-plugin-desktop/lib`（构建产物） | 7.2 MB | 删除后重建 |
| `dsh-plugin-desktop/dist/win-unpacked`（旧打包） | 1.7 GB | 删除后重建 |
| `~/.pmstudio/cache/attachments/request-images` | 6.6 MB | 0 |

保留：`~/.pmstudio/sessions`、`pm/projects`、`profiles`、`storages`、`workspaces`、Zotero 数据、`dist/Setup.exe`（历史安装包）。

## 2. 生产构建与启动

- 首次 `corepack yarn package:dir` 在 `market:prepare` 失败：`dshmarket@patch ... Cannot apply hunk #2`（本地 Yarn patch 缓存/清单状态），manifest 与 lockfile 已自动恢复；改为直接构建 desktop workspace：
  `corepack yarn workspace dsh-plugin-desktop package:dir` → **EXIT=0**
- 产物：`dist/win-unpacked/PolyMechanism Studio.exe`（246 MB），win-unpacked 1.7 GB；打包内 CPython 3.12.14 / Node 24.21.0 / pnpm 11.28.5 verified。
- 启动：`PolyMechanism Studio.exe --remote-debugging-port=9333`，页面 `http://127.0.0.1:43120/` 正常。
- 窗口图标：`WM_GETICON` 取回 48×48 与 24×24 均为 PolymerMark 新设计（非 React/Electron 图标）。
- 工作台：`/pm/overview` pulse 显示 44 条证据 / 12 个项目 / 仿真引擎就绪；`/pm/projects` 项目列表与六个 tab（概览/证据/假设/机理/知识/工具）渲染正常，含“证据链断裂于 EV-2-c679 — 请勿引用”告警。

## 3. 真实 session：SAXS + WAXS

### 3.1 输入（Zenodo 已发表论文支持数据）

| 数据集 | 文件 | 来源 | 真实身份 |
| --- | --- | --- | --- |
| SAXS | `data/saxs_star_polymer_real.csv` | Zenodo 1066849 | **S40–B174 二嵌段共聚物胶束**（Chem. Sci. 2018, 9, 922–934, DOI 10.1039/c7sc03334f）；175 点，q 0.007793–0.151705 Å⁻¹ |
| WAXS | `data/waxs_nail_real.csv` | Zenodo 22100448 | 人指甲 α-角蛋白，302 行，子午/赤道双列，2θ 7.16–34.7° |

> 更正：旧记录称 SAXS 为“阳离子星形聚合物”，实际源论文为球形二嵌段共聚物胶束；本次已按源论文更正。

### 3.2 工具返回值（原样）

SAXS（修复前，错误实现）：

```json
{"status":"CONVERGED","points":175,"backgroundSubtracted":false,
 "guinier":{"rmse":0.003174,"rg":0.983,"fitRange":[0.007793,0.008344]},
 "porod":{"slope":-2.554,"fitRange":[0.036813,0.151705]}}
```

WAXS（默认参数首跑，未过 r² 门）：

```json
{"status":"CONVERGED","crystallinityIndex":0.1614,
 "halo":{"center2Theta":7.163,"width":27.541},
 "peaks":[{"center2Theta":20.815,"width":1.912,"areaFraction":1}],
 "fit":{"rmse":0.7986,"r2":0.88339}}
```

WAXS（数据驱动定峰后，子午向 / 赤道向）：

```json
{"status":"CONVERGED","crystallinityIndex":0.2635,
 "halo":{"center2Theta":23.165,"width":12.873},
 "peaks":[{"center2Theta":9.092,"width":1.21,"areaFraction":1},
          {"center2Theta":19.004,"width":1.43,"areaFraction":0.5277},
          {"center2Theta":22.049,"width":2.142,"areaFraction":0.4358}],
 "fit":{"rmse":0.1351,"r2":0.99666}}
```

```json
{"status":"CONVERGED","crystallinityIndex":0.2716,
 "halo":{"center2Theta":23.083,"width":13.319},
 "peaks":[{"center2Theta":9.11,"width":1.169,"areaFraction":1},
          {"center2Theta":19.138,"width":1.496,"areaFraction":0.5333},
          {"center2Theta":22.305,"width":2.189,"areaFraction":0.4052}],
 "fit":{"rmse":0.1339,"r2":0.9968}}
```

子午/赤道结晶度差 0.0081（相对 3.1%）：表观结晶度对方向不敏感，但 19–22° 复合带的分峰非唯一，Xc 仍是“表观值”。

### 3.3 证据、假设、机理、知识（全部落库）

- 证据链 9 条，`pm_evidence_verify` → `verified:true, chainLength:9`：
  EV-1-f36c（SAXS）、EV-2-c9c2（WAXS 首跑）、EV-3-3863（WAXS 子午）、EV-4-f5d7（WAXS 赤道）、EV-5-3d5c…EV-9-faaf（2016 SAXS 论文摘录：qRg 窗口 0.79–1.30、Cu Kα λ=1.54 Å、Q 0.007–0.2 Å⁻¹、星形接枝 Rg=670 Å、纳米粒 70–166 Å、大颗粒在 q 窗口外“不可见”、缓冲背景扣除流程）。
- 假设 4 条（全部 `proposed`，未标 supported）：HY-1-9822、HY-2-3dac、HY-3-6ffa、HY-4-63a8。
- 机理边 4 条（全部 `candidate`）：ED-1-6170（链拓扑→Rg/形因子）、ED-2-4e12（结晶相分数→WAXS 峰面积分数）、ED-3-252b（水增塑/氢键→角蛋白结晶度，条件不可判）、ED-4-2f4e（q 下界→Rg 可识别性）。
- 知识卡 2 张（`pending`）：KC-g-1-6168（窄 q 窗口 Guinier 退化判据）、KC-g-2-ac2a（半结晶 WAXS 两步定峰法）。
- `pm_gate_check(kind=hypothesis)` → **verdict=block**，失败项 `G-COMPETE`：结论前必须排除至少一个竞争假设。门控正确拦截了“Rg 可报告”的过早结论。

### 3.4 关键发现：SAXS Guinier 实现缺陷（已修复）

旧 `saxs.py` 用 **ln I ~ ln q** 回归，把幂律指数当 −Rg²/3：

- 返回 `Rg=0.983`（低于 C–C 键长 1.54 Å），窗口仅 5 点，qRg≈0.0077，物理上不成立。
- 会话中的 PI 正确识别为退化伪值，并用独立 log-log 斜率 −3.81、可识别上限 Rg≲167 Å 交叉验证，拒绝把它写成结论。
- 修复 commit `e2fbb718e1`：回归变量改为 q²；qRg≤1.3 自洽迭代扩窗；新增 Rg≤1.5 Å / qRg<0.5 / rmse>0.08 的 NO_FIT 保护；selftest 新增合成 Guinier Rg=120 Å 回收检查（21/21 通过）。

修复后同一数据：

```json
{"status":"CONVERGED","points":175,
 "guinier":{"status":"CONVERGED","rg":123.524,"rmse":0.008359,
            "fitRange":[0.007793,0.010416],
            "qRgRange":[0.9626,1.2866],"points":18},
 "porod":{"slope":-2.554}}
```

**外部真值对照**：源论文 Table 1 报告 S40–B174 的 SAXS 核直径 dV=27 nm（cV 0.12）、nagg=243、DLS dV=45 nm。均匀球近似 Rg=sqrt(3/5)·R → 10.5 nm（105 Å）；核壳胶束 Rg 可更大。修正后的 Rg=12.35 nm 与 27 nm 核直径同量级且自洽；伪值 0.983 Å 相差两个数量级，排除。

结论：HY-2-3dac（“窗口内无可识别 Guinier 曲率”）被修正后的自洽窗口否定；HY-1-9822 的方向（旧值为伪值）成立，真值收窄到 ~105–135 Å。模型竞争（均匀球/核壳/多分散）仍需完整 form factor 拟合，`G-COMPETE` 仍应 block。

### 3.5 文献与机理

- OpenAlex 多次 429，Crossref 兜底成功；`pm_literature_download` 6 个 DOI 产生 4 类真实状态：`OA_LINK_ONLY`（host 不在允许清单）、`CAMPUS_REQUIRED`（403）、`MANUAL_REQUIRED`（无 OA/IdP 拦截）；1 篇通过 `kb_fetch` 落盘并入库（30 块）。
- 精读 2016 Nanoscale Res. Lett.（DOI 10.1186/s11671-016-1230-2）：报告 Guinier qRg 窗口 0.79–1.30，直接给出本次判定依据；2018 Chem. Sci. 源论文给出 27 nm 核直径真值。
- 机理链：观测（SAXS 幂律衰减 + WAXS 三峰）→ 结构参数（Rg、Xc、峰位）→ 候选机理（核-臂/核壳胶束、α-螺旋/β-片有序相、水增塑）→ 判别实验（q 下延 + 浓度序列；全 φ 方位积分；RH 梯度）。
- 局限：WAXS 为单一子午/赤道 1-D 切向积分，缺全 φ 平均；SAXS 无背景列/浓度序列；角蛋白 Xc 无库内直接数值对照，分峰非唯一。

## 4. 知识库（kb-rag）

| 项目 | 结果 |
| --- | --- |
| 会话内 `kb_search` | 工作（但首次触发 kb_scope 三问向导：范围/深度/网络；未答时 agent 阻塞等待。本次选择“封闭知识库 + 深度检索 + 校园网”） |
| 向量检索（生产 exe 直接启动） | **降级为关键词**：`numpy.core.multiarray failed to import`（宿主 PATH 的首个 python 为 anaconda base，numpy ABI 不匹配） |
| 向量检索（science venv / 启动器 PATH） | **正常**：重建 26 个缺失向量后 `vectors=99, vectors_missing=0`；hybrid 查询 “Guinier Rg q range validity SAXS” 命中 2016 论文 Results 节（page 3–7），scan.need_vec=true |
| 入库统计 | docs=3, chunks=99, vectors=99, chars=84,833；模型 BAAI/bge-small-zh-v1.5 与 bge-reranker-base 均已安装 |

结论：kb 的 ingest/search/vector 链路本身可用；**生产 exe 直接双击时缺少可用 Python，会退化为纯关键词**。仓库的 `scripts/start-polymechanism.cmd` 已把 `science/.venv` 置于 PATH 首位，可恢复向量检索；发布包若要做到开箱即用，需要内置可重定位的 ML Python 运行时（~1.1 GB）或首次运行自动安装。

## 5. Zotero 论文管理

| 能力 | 结果 |
| --- | --- |
| 本地 API | 运行中，Zotero 10.0.8，`connector/ping` 200，`/api/users/0/items` 200 |
| 读/清点 | `inventory` 8 条；`search vinyl/orientation/birefringence` 命中 Hibi 1988 |
| 写 | `authorize` 已触发 Zotero 弹窗（“Always Allow / 始终允许”，等待 900 s），**尚未点击**，因此 `import-bibtex --yes` 未执行；未绕过授权 |
| 与 kb 的桥 | `kb_zotero` 未在本次会话执行（写授权是前置；读侧可用） |

结论：Zotero **读检索已可用**；写库只差用户一次性点击授权。授权后即可导入/归集/打标签，并由 `kb_zotero` 批量入库。

## 6. 评价：这个智能体现在能做什么

**已经达到“可用科研助手”的部分**

1. 能独立完成真实数据的定量分析、拟合质量判断与证据登记；对工具异常值会主动质疑，而不是照抄。
2. 能按“观测/理论/假设”分层，提出竞争假设与判别实验，并遵守科学门控（G-COMPETE block 时不硬下结论）。
3. 能把文献检索、下载、精读、结构化抽取串成闭环，并把文献结论与实测结果逐条对照（含失败状态）。
4. 能把结果写入证据账本、机理图、知识卡，并在工作台可视化；证据链哈希可验证。
5. 本次实测暴露并修复了一个会让所有 SAXS 结论失真的核心算法 bug，修正后与源论文 27 nm 核直径自洽。

**仍是边界/待补**

1. 预设工具面没有 shell/文件写入：agent 无法自己落盘报告或写脚本算峰位，只能靠 `pm_literature_read` 读 CSV 后人工扫描；需给 characterization/scientist 加只读执行与受限写入工具。
2. kb 首次使用会弹三问向导，阻塞 agent；应在 profile/config 预置默认值（封闭知识库/深度检索/校园网），或改为非阻塞默认。
3. 生产 exe 直接启动时 kb 向量检索不可用（宿主 Python 选择问题）；需要可重定位 ML 运行时或启动器统一 PATH。
4. `pm_literature_screen` 曾在生产包报 `No module named yaml`；已把 PyYAML 加入打包 payload（commit `e2fbb718e1`），需重新打包后生效（本次已热补丁到 win-unpacked）。
5. `pm_mechanism_query` 在提议边后仍返回空 nodes/edges（索引回填不一致）；机理图 UI 能看到边，但查询端点未联通。
6. WAXS 默认 halo/峰位仍是 PVA 先验；非 PVA 谱需两步定峰（知识卡已记录）。
7. Zotero 写授权需用户点击；OpenAlex 429 与出版商 allowlist 仍会造成检索/下载失败（均已如实分类）。

## 7. 复现命令

```powershell
# 生产构建（跳过会失败的 market:prepare）
corepack yarn workspace dsh-plugin-desktop package:dir

# 启动生产包（建议先置 science venv 到 PATH，kb 向量检索可用）
$env:PATH = "D:\codes\dsh_workspace\dsh-desktop\science\.venv\Scripts;" + $env:PATH
& "D:\codes\dsh_workspace\dsh-desktop\dsh-plugin-desktop\dist\win-unpacked\PolyMechanism Studio.exe"

# 修正后的 SAXS 复现
$env:PYTHONPATH = "D:\codes\dsh_workspace\dsh-desktop\science\src"
D:\codes\dsh_workspace\dsh-desktop\science\.venv\Scripts\python.exe -s -m pm_science.selftest
```

产出文件：

- 会话报告：`D:\pm-acceptance\pva-oblique-2026-11-20\reports\saxs-waxs-real-20261120.md`
- 修正与真值对照：`...\reports\saxs-waxs-real-20261120-correction.md`
- 自包含 HTML（修复前 SAXS 部分）：`...\reports\2026-11-21_SAXS-WAXS-真实数据机理验证-20261120（PR-13-b72b）-114db594.html`
- 项目证据：`~/.pmstudio/pm/projects/PR-13-b72b/{project.json,evidence.jsonl,artifacts/}`
- 假设：`~/.pmstudio/pm/hypotheses/PR-13-b72b.json`
- 知识卡：`~/.pmstudio/pm/knowledge/global/cards.json`
