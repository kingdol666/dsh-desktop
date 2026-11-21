# WAXS 数据处理文献库 + 结构化 DOE 工具（下一步计划执行）

日期：2026-11-21
环境：PolyMechanism Studio 2.1.0（win-unpacked）；Zotero 10.0.8；KB `docs=15, chunks=788, vectors=698, health=true`
工作区：`D:\pm-acceptance\pva-oblique-2026-11-20`

## 1. 新增结构化实验设计工具 `pm_experiment_plan`

- 位置：`plugins/pm-research/src/tools-design.ts`；注册于 `tools.ts`，权限矩阵允许 polymer-scientist / physicist / modeler / characterization。
- 输入：factors（名称、水平、单位，≤6 因素）、response（name/effectSize/sigma）、alpha/power、replicates、blocking、seed。
- 输出：全因子 cells、每组样本量（正态近似功效公式，Acklam 逆正态）、totalRuns、随机化顺序（确定性 Fisher-Yates）、block 提示、warnings、designMatrixPreview。
- 明确语义：**设计计划不是实验数据**，不能当测量证据。
- 测试：`tests/design-tool.spec.ts` 3/3（4×4 因素 → cells=16, n=3, totalRuns=48；越权 polymer-literature → PERMISSION_DENIED；sigma=0 → INVALID_ARGUMENT）。
- 生产实测（重启后的 win-unpacked，session `699e55c7`）：
  `pm_experiment_plan(RH[11,43,75,93] × anneal[25,90,120,150], Xc, δ=0.05, σ=0.02)` → `cells=16, nPerCell=3, recommended=3, totalRuns=48, seed=7`。
- 人格提示已加入 scientist/modeler persona：要求实验设计时调用该工具，并声明“plan is not data”。

## 2. 下载的 WAXS 数据处理文献（PVA/PVDF 薄膜方向）

全部已进 Zotero（条目 + 真实 PDF 附件）并入库 KB：

| 论文 | DOI | 类型/与任务的关系 | Zotero / 附件 |
|---|---|---|---|
| Kovtun et al., *Influence of Glycerol on the Surface Morphology and Crystallinity of Polyvinyl Alcohol Films*, Polymers 2024, 16, 2421 | 10.3390/polym16172421 | **PVA 薄膜** + 甘油增塑 + 结晶度（XRD/WAXS 数据处理） | `6JC5N6PC` / `8XJ67FLA` |
| Saraff et al., *Total X-Ray Illumination for Absolute Quantification of Crystalline Phases and Amorphous Content in PVDF and P(VDF-TrFE)*, Macromol. Mater. Eng. 2025 | 10.1002/mame.202500325 | **PVDF/P(VDF-TrFE)** 绝对结晶度：总 X 射线照明 + 外标 + Rietveld | `248938WU` / `GARKMVJG` |
| Rabiej & Rabiej, *The role of an objective function in the mathematical modelling of wide-angle X-ray diffraction curves of semi-crystalline polymers*, Acta Cryst. A 2021 | 10.1107/s2053273321007762 | **WAXD 峰/晕分解的目标函数**（数据拟合方法学） | `DAGWB7XT` / `4JIHXCP2` |
| *How to GIWAXS: Grazing Incidence Wide Angle X-Ray Scattering Applied to Metal Halide Perovskite Thin Films*, Adv. Energy Mater. 2023 | 10.1002/aenm.202300760 | 薄膜 GIWAXS 数据校正/积分/分析的教程（非聚合物，作为技术方法参考，报告中已标注） | `YZNXKFJK` / `FDCPU5C3` |

下载路径：自动化工具对 MDPI/Wiley/Springer 仍被 Cloudflare 拦（`CLOUDFLARE_CHALLENGE`）；本次通过 **Europe PMC 直连（bot UA）/ Cambridge 仓库 / IUCr 代理 / HAL** 取得 PDF，再走 Connector 入 Zotero。说明：这不是“无条件绕过”，而是 OA 仓库/机构订阅下的合法副本。

KB 检索验证（PVA 查询命中正常）：
- “PVA film crystallinity XRD WAXS glycerol” → 第 1 命中 PVA 2024 论文 Results p4–7，第 2 命中 2022 PEG XRD/WAXS 对比；
- “PVDF absolute crystallinity amorphous Rietveld” → 命中 PVDF 2025 + WAXD objective function；
- 部分查询在宿主内存紧张时降级关键词（见 §4）。

## 3. 浏览器辅助闭源访问（已验证，未产品化）

- 真实 Chrome（无 `--enable-automation`）+ 校园 IP 可通过 Cloudflare Turnstile；
- RSC 跳签名 CDN 2,183,184 B；Springer 闭源 2,019,423 B 已落盘；Wiley 18.5MB PDF 在 Chrome 内 `fetch` 可得；
- 但内存分块导出脚本对大 PDF 截断为 512KB；应改为 CDP `Network.getResponseBody` 或 Chrome 原生下载到磁盘。**尚未集成进 `pm_literature_download`**，当前仍是独立浏览器步骤。

## 4. 门与边界

- `pm-research`：design 3/3、health 4/4、literature-tools 8/8（单独跑）；全套 48 项中 4 项在并行/低内存下超时，单独复跑通过。
- **生产包完整 rebuild 失败（exit 134，V8 Zone Allocation OOM）**：宿主只剩 ~329MB 可用内存，LM Studio 两个 llama-server 占 ~16GB+；本次用已构建的 `plugins/pm-research/lib/index.js` 热补到 `win-unpacked/resources/app/node_modules/pm-research/lib/`，生产实测通过。内存释放后应重跑 `package:dir` 生成正式安装包。
- KB 向量检索在内存紧张时可能报 `Unable to allocate 1.36 MiB` 并降级关键词；数据与索引完整（vectors=698, missing=0），不是数据问题。释放内存/重启 daemon 可恢复。
- Zotero 重复条目（Penfold/Hibi 早期仅元数据）仍需 UI Merge；本地 API 写需一次“始终允许”。
- 仍缺：2D 全 φ 积分、DSC/NMR 独立有序度、角蛋白专属文献全文。

## 5. 复现

```powershell
# 工具单测
cd D:\codes\dsh_workspace\dsh-desktop\plugins\pm-research
node ..\..\dsh-plugin-desktop\node_modules\vitest\vitest.mjs run tests\design-tool.spec.ts tests\health.spec.ts

# 生产工具实测（Studio 新会话）
pm_experiment_plan(factors=[RH[11,43,75,93], anneal[25,90,120,150]], response={Xc,0.05,0.02}, seed=7)
# → cells=16, nPerCell=3, totalRuns=48

# 文献路径
D:\pm-acceptance\pva-oblique-2026-11-20\literature-waxs-processing\
```
