# 全功能实机验收：重启 → 闭源访问 → 真实 WAXS/机理/实验设计

日期：2026-11-21
环境：PolyMechanism Studio 2.1.0（win-unpacked，重建后）；校园直连 222.195.81.77；Clash 代理 127.0.0.1:7890；Zotero 10.0.8；USTC deepseek-flash-2 max
工作区：`D:\pm-acceptance\pva-oblique-2026-11-20`
新会话：`session-17fd1d29`，项目 `PR-14-0e1f`

## 1. 重启与门

- 生产包重建：`yarn workspace dsh-plugin-desktop package:dir` → EXIT=0；win-unpacked 内含新 `litsearch.py`（CLOUDFLARE_CHALLENGE/代理回退）与 `science/pylibs/yaml`（PyYAML）。
- 重启：`PolyMechanism Studio.exe --remote-debugging-port=9333`，venv PATH + HTTPS_PROXY；页面 `127.0.0.1:43120` advanced 模式正常。
- 门：`pm_science.selftest` **21/21**；`pm-research` vitest（排除 2 个联网 e2e）**13 files / 45 tests passed**；`verify:literature` passed（kb_*×10 + zotero skill + 6 experts + pm surface + web graph）。
- 工作台：PR-14 显示 **7 证据 / 4 假设 / 4 机理边 / 4 知识卡**，证据链 7 条 `prevHash` 校验通过。
- KB：docs=6/chunks=212/vectors=188/missing=0/health.ok；in-app daemon 为 `science\.venv\Scripts\python.EXE`；本轮 kb_search 无“向量检索失败”。

## 2. 闭源期刊：到底能不能下

| 路径 | 实测 | 结论 |
|---|---|---|
| 自动 HTTP（litsearch） | ACS/RSC/Wiley 403 `Cf-Mitigated: challenge`；Springer 000 | 反爬墙，不是校园网问题 |
| 代理 | 校园 222.195.81.77 / 代理 103.151.172.34 都被 Cloudflare 挑战 | 代理救不了 Turnstile |
| OA 仓库 | Europe PMC 代理 2.2MB；J-STAGE 代理 1.15MB；White Rose 1.72MB | 开放/仓库副本可下 |
| **真实 Chrome（无自动化标志）+ 校园 IP** | 通过 Turnstile；RSC 跳转签名 CDN 2,183,184 B；Wiley PDF 18,535,567 B；Springer PDF 2,019,423 B | **机构订阅范围内可下** |
| ACS 2025（10.1021/acsapm.5c00216） | 浏览器跳回 article-abstract，显示 Access through Institution / Sign In | **机构未订阅：无法合法下载** |

- **闭源实证**：`10.1007/s00396-020-04600-z`（Colloid Polym. Sci. 2020，Unpaywall `is_oa=false`）经 Springer 直链获得 **2,019,423 B 完整 PDF**，已落工作区 `literature/2020_springer_pmma-nanoparticles.pdf`。
- **大文件边界**：Wiley 18.5MB PDF 在 Chrome 内 `fetch` 得到完整字节，但当前内存分块导出脚本在大文件上截断为 512KB；产品化浏览器下载应改为 Chrome 原生下载到磁盘（已记录为待修，不影响 Zotero/KB 已入库的 4 篇）。
- 结论：**不能承诺“任何闭源论文都能下”**；能保证的是“机构订阅范围内、用真实浏览器会话可下”，未订阅的仍需 CARSI/登录/购买。工具不会绕过付费墙。

Zotero 现有 8 条记录，其中 4 条带真实 PDF 附件（Hibi 1988、Penfold 2018、Fauziyah 2022、Bulavin 2016），`file-url` 均指向 `C:/Users/87287/Zotero/storage/<key>/*.pdf`。

## 3. 真实场景作业：角蛋白 WAXS → 机理 → 实验设计

输入：`data/waxs_nail_real.csv`（Zenodo 22100448，302 行，子午/赤道双列）。项目 PR-14-0e1f。

### 3.1 数据（5 次工具拟合，原样）

| # | 模型 | 列 | Xc | 峰位 ° | 晕中心/宽 | r² | rmse | 证据 |
|---|---|---|---|---|---|---|---|---|
| 1 | 默认 1 峰 | 未指定 | 0.1614 | 20.815 | 7.163/27.541（贴边界） | 0.88339 | 0.7986 | EV-1-0fea |
| 2 | 2 峰 | 子午 | 0.4060 | 8.979; 19.784 | 26.952/8.177（贴上界） | 0.99213 | 0.2075 | EV-2-0335 |
| 3 | 3 峰 | 子午 | 0.2635 | 9.092; 19.004; 22.048 | 23.166/12.873 | 0.99666 | 0.1351 | EV-3-5ef3 |
| 4 | 2 峰 | 赤道 | 0.3507 | 8.998; 19.977 | 25.684/8.838 | 0.99220 | 0.2090 | EV-4-8379 |
| 5 | 3 峰 | 赤道 | 0.2716 | 9.110; 19.138; 22.305 | 23.083/13.318 | 0.99680 | 0.1339 | EV-5-911c |

关键：**Xc 随模型规格 0.1614→0.4060（2.5 倍），随方位只差 0.0081–0.0553**；模型项 > 方位项 2.6–17.6 倍。1 峰/2 峰的晕中心贴扫描边界 → 参数不可辨识；第三分量收敛到 22.05/22.31°，不是种子 20.07°。r² 单调升而 Xc 非单调，**r² 不能证明第三峰真实**。

### 3.2 文献/证据/机理

- KB 内无角蛋白全文（检索命中 PEG WAXS、Nishio PVA、银溶胶 SAXS、PMMA、Ursu PVA）；这是**真实知识缺口**。
- 精读 2022 PEG WAXS（DOI 10.1088/1742-6596/2392/1/012033）：XRD 81.24% vs WAXS 80.93%（差 0.31%），作者归因于非晶晕/背景口径 → EV-6-45e9、EV-7-15cd。
- 证据 7 条 `verified:true, chainLength:7`。
- 4 条 candidate 机理边：ED-1-2729（9.7 Å 螺旋重复→Xc）、ED-2-1284（模型规格→Xc）、ED-3-8ed8（子午/赤道织构→Xc，Δ 小于模型项）、ED-4-1d73（水增塑→氢键网络，**无数据，空证据**）。
- 4 条假设：H1 本征 vs H2 模型/织构主导；H3 三峰真实 vs H4 两相足够。H2/H3 经合法状态机 `proposed→conditional→under_test`；H1/H4 保持 proposed；**无一标 supported**。

### 3.3 门控

- claim（Xc 不可脱模型上报）：**pass**（G-EVID 5 条哈希通过）。
- edge ED-2-1284：**pass**。
- hypothesis H2：**BLOCK**，唯一失败项 `G-COMPETE`：须先排除 H1。
- 需要补的判别量：2D 全 φ 去织构积分 Xc_iso；DSC 熔融焓/固态 NMR 独立有序度；湿度/退火/拉伸扰动序列；独立 reviewer。

### 3.4 实验设计（实测产出）

当前**无结构化 DOE 工具**，agent 明确说明并按文本方案给出：

- 因素：RH {11,43,75,93}% × 退火 {25,90,120,150 °C,30 min} × 拉伸比 {1.00,1.10,1.25}；标本类型 blocking（天然指甲片只做 RH×退火；拉伸只做再生膜）。
- 响应：Xc（1/2/3 峰三规格报区间）、峰位/d/FWHM、Hermans f、双折射、模量/屈服、含水率。
- 样本：A×B 16×3=48；C×B 12×3=36；锚点 6 → **90 试样**；功效公式给 n=3（δ=0.05,σ=0.02）/n=6（σ=0.03）/n=16（δ=0.02）；同一样品内配对比较模型/方位项。
- 随机化/对照：随机测量顺序、按制片批次 blocking；未处理基线、全环积分、空气背景、Si/LaB₆ 标定、重复测 3 次。
- 判定：D1 H1 真（模型 ΔXc≤0.05、工艺 ΔXc≥0.10、Xc_iso vs DSC/NMR r²>0.8）；D2 H2 真（模型≥0.10、工艺≤0.05、晕贴边界、r²<0.3）；D3 不可分辨带 → 用 DSC/NMR 仲裁；D4 ΔBIC≥10 且峰位 SD<0.15° → H3 真。
- 停止条件：RH 平衡漂移>2% 作废；r²<0.9 不进统计、失败率>20% 停机；进入 D3 停止扩样；f<0.02 终止织构分支。

## 4. 评价

**能做到**：真实 WAXS 自动拟合并识别参数不可辨识/种子偏移；把模型依赖量化到 2.5 倍；区分模型项与方位项；用证据链/假设状态机/门控阻止过度结论；给出可执行的 90 样本 DOE（因素、水平、响应、功效、随机化、判定阈值、停止条件）；KB/Zotero/下载链路可用。

**尚不能**：结构化 DOE 规划器/统计功效工具（目前文本）；2D 全 φ 积分与 DSC/NMR 联合判据（数据/工具缺）；角蛋白专属文献库（KB 空）；任何闭源论文的无条件下载（订阅/反爬边界）；Wiley 18.5MB 浏览器导出的磁盘下载模式（当前内存分块截断）。

## 5. 产物

- 场景报告：`reports/keratin-waxs-mechanism-experiment-20261121.md`（13.7 KB）
- 严格 WAXS 处理：`reports/waxs-real-20261121/WAXS-real-processing-report.md` + 4 张图 + JSON
- 项目：`~/.pmstudio/pm/projects/PR-14-0e1f/{project.json,evidence.jsonl,artifacts/}`
- 假设：`~/.pmstudio/pm/hypotheses/PR-14-0e1f.json`
- 知识卡：`~/.pmstudio/pm/knowledge/...`（KC-p-4-f78b 等）
- Zotero：4 条带 PDF（见 §2）
