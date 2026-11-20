# 文献下载/代理/Zotero/KB 实测与真实 WAXS 处理

日期：2026-11-21
环境：Windows 10.0.26200；PolyMechanism Studio 2.1.0（win-unpacked，重建于本次）；Zotero 10.0.8；Clash 代理 `127.0.0.1:7890`；校园网直连出口 `222.195.81.77`（CERNET AS4538）
工作区：`D:\pm-acceptance\pva-oblique-2026-11-20`

## 1. 为什么之前下载不了文献（根因）

| 现象 | 根因 | 证据 |
|---|---|---|
| ACS/RSC/Wiley PDF 返回 403 | **Cloudflare Turnstile 挑战**，不是付费墙 | 响应头 `Cf-Mitigated: challenge`；HTML 标题 `Just a moment...`；真实 Chrome 也停在 Turnstile |
| 走代理仍然 403 | Cloudflare 对校园 IP 与代理出口都发挑战；代理不解决 Turnstile | 直连 222.195.81.77、代理 103.151.172.34 都是 403 + challenge |
| Springer 连接 000 | 该主机直连/代理均超时，出版商边缘不可达 | curl 直连与代理均 `000` |
| J-STAGE 500/登录跳转 | 旧 URL 格式错误（`/article/koron/45/609/...`）；正确为 `/article/koron1974/45/8/45_8_609/_pdf` | Unpaywall 返回正确 URL；代理下载 1.15MB 全文，直连仅 132KB 预览 |
| Europe PMC 直连 403 | Cloudflare；**代理可用** | 直连 403，代理 200 / 2.2MB PDF |
| ACS 2025 / Elsevier 2015 无 PDF | Unpaywall `is_oa=false`，本来就无开放版本 | 两个 DOI 的 Unpaywall 无任何 OA location |
| 代理是否影响校园授权 | 代理出口不是校园 IP，会**丢掉机构授权**；因此出版商路由必须优先直连 | 直连出口 222.195.81.77；代理出口 103.151.172.34 |

**一句话**：之前的失败主要是“出版商反爬（Cloudflare）”+“部分论文本来闭源”+“J-STAGE URL 过期”，不是校园网没连上；代理能救 Europe PMC/J-STAGE，但救不了 Cloudflare 和付费墙。

## 2. 修复（commit `486ef597ef`、`d3f0f7cc68`）

1. **OA 候选全集**：Unpaywall 全部 `oa_locations` + OpenAlex 全部 `locations`（不再只用 best）+ Europe PMC DOI 检索；PMC landing 自动转 `europepmc.org/articles/{PMCID}?pdf=render`。新增允许主机 europepmc/ebi/pmc/whiterose/zenodo。
2. **传输自适应**：API/OA 默认代理、失败回退直连；出版商模板/落地页优先直连（保留校园 IP）、失败再代理；同一候选两种传输都成功时保留**字节数更大**的 PDF。
3. **Cloudflare 分类**：新增 `CLOUDFLARE_CHALLENGE` 状态（`Cf-Mitigated: challenge`），与 `CAMPUS_REQUIRED`（401/403/登录）和 `MANUAL_REQUIRED`（无 OA）区分；attempts 记录 `source/transport/status/bytes/challenge`。
4. **URL 清洗**：仓库 URL 中的字面空格 percent-encode（White Rose `...(1).pdf` 之前直接抛异常）。
5. **Zotero 落盘**：`scripts/literature-to-zotero.mjs` 走 Zotero Connector `POST /connector/saveItems` + `/connector/saveAttachment`，**不需要本地 API key**；Crossref 元数据 + PDF 字节一次完成。
6. **启动器代理感知**：`start-polymechanism.cmd` / `start-polymechanism-prod.cmd` 支持 `PM_PROXY`，否则检测监听中的 `127.0.0.1:7890`；litsearch 仍逐请求回退直连。

## 3. 实测：真实下载 + Zotero 落盘

| DOI | 论文 | 下载 | 字节 | Zotero item / PDF |
|---|---|---|---|---|
| 10.1295/koron.45.609 | Hibi 1988, PVA 双轴取向双折射 | Unpaywall → J-STAGE（代理） | 1,153,771 | `VY7P8N4G` / `HRRDAEDD` |
| 10.1039/c7sc03334f | Penfold 2018, 阳离子胶束（Chem. Sci.） | OA 仓库（White Rose，代理） | 1,716,312 | `2FA8PY3F` / `DNFXMRQB` |
| 10.1088/1742-6596/2392/1/012033 | Fauziyah 2022, PEG 复合材料 XRD/WAXS | OA（代理） | 613,969 | `WGMXFZL7` / `Q7NP3TCF` |
| 10.1186/s11671-016-1230-2 | Bulavin 2016, SAXS/QELS 银溶胶 | kb_fetch（前一轮） | 1,314,730 | `LIA9G8KW` / `UVJ9CP89` |

Zotero `file-url` 实测四条均指向 `C:/Users/87287/Zotero/storage/<key>/*.pdf`（真实附件，不是仅元数据）。

**闭源/反爬（如实）**：
- 10.1021/acsapm.5c00216（ACS 2025）→ `CLOUDFLARE_CHALLENGE`，Unpaywall 无 OA；
- 10.1016/j.polymer.2015.02.045（Elsevier 2015）→ `CAMPUS_REQUIRED`，无 OA；
- 10.1002/pen.25489（Wiley 2020）→ `CLOUDFLARE_CHALLENGE`；
- 10.3390/cryst9050271（MDPI gold）→ `CAMPUS_REQUIRED`（MDPI 403，无仓库副本）。
这些需要真实浏览器在校园网/CARSI 下过一次 Turnstile 或机构登录，工具不会绕过付费墙。

**生产包内实测**（session `afd31e22`，polymer-scientist）：
`pm_literature_download(10.1039/c7sc03334f)` → `DOWNLOADED`，9 条 attempts 中 4 条 Cloudflare 403（proxy/direct），最终 `oa-repository` proxy 1,716,312 bytes 成功；`kb_search("WAXS crystallinity")` → 混合检索 8056ms，**无“向量检索失败”**。

## 4. 知识库（kb-rag）最终状态

- 引擎：`docs=6, chunks=212, vectors=188, vectors_missing=0, health.ok=true`（含 2016 SAXS、2018 胶束、1988 PVA、2022 PEG、Nishio 1994、Ursu 2015）。
- 模型：`BAAI/bge-small-zh-v1.5` + `bge-reranker-base` 已安装；CPU torch 2.15.0。
- 应用内：kb 引擎 daemon 的进程命令行确认为
  `science\.venv\Scripts\python.EXE ...\dsh-kb-rag\kb_engine.py serve`；
  in-app `kb_search` 返回“混合检索 · 8056ms”，无降级告警。
- 启动：`scripts/start-polymechanism-prod.cmd` 会把 science venv 放到 PATH 首位，并自动探测 7890 代理。

## 5. 真实 WAXS 数据处理（人指甲 α-角蛋白）

数据：`data/waxs_nail_real.csv`（Zenodo 22100448，302 行，子午/赤道双列）。
方法：线性背景 + 非晶晕 Gaussian + N 个结晶峰 Gaussian；有界 `curve_fit`；Xc 68% 区间用 120 次残差 bootstrap；Cu Kα λ=1.5418 Å。

| 模型/通道 | Xc | 68% CI | r² | rmse | 峰位 (°) / d (Å) |
|---|---|---|---|---|---|
| 3 峰 · 子午 | **0.420** | 0.406–0.441 | 0.99877 | 0.0819 | 9.257/9.553; 17.828/4.975; 20.068/4.424 |
| 3 峰 · 赤道 | **0.425** | 0.411–0.442 | 0.99873 | 0.0844 | 9.241/9.569; 17.809/4.980; 20.088/4.420 |
| 2 峰 · 子午 | 0.304 | 0.299–0.336 | 0.99549 | 0.1571 | 8.393/10.535; 19.672/4.513 |
| 2 峰 · 赤道 | 0.291 | 0.288–0.324 | 0.99565 | 0.1560 | 8.473/10.435; 19.807/4.482 |

- 峰位稳健：子午/赤道差 ≤0.03°；9.55 Å 是 α-螺旋卷曲螺旋轴向重复，4.98 Å 与 4.42 Å 对应螺旋链间/β-片层链间距。
- **Xc 是模型依赖量**：工具约束峰位给 0.2635，自由三峰给 0.420，两峰给 0.304；范围 0.26–0.43。必须连模型/峰表一起报，不能跨方法比绝对值。
- 子午/赤道 Xc 差 0.5 pp → 本样品择优取向对总结晶度贡献有限；但 9.55 Å 峰面积分数 0.419（子午）vs 0.454（赤道），仍需全 φ 方位积分确认织构。
- Scherrer 尺寸（未扣仪器展宽，下限）：22/40/17 Å。
- 报告：`reports/waxs-real-20261121/WAXS-real-processing-report.md`；图：`waxs_{meridional,equatorial}_{3,2}peak.png`；数值：`waxs_results.json`。

## 6. 验证门

- `science selftest`：21/21（含 SAXS Guinier 合成 Rg=120 Å 回收）。
- `vitest literature-tools`：8/8。
- `verify:literature`：kb_*×10 + zotero skill + 6 experts + pm surface + web graph passed（warning：client primitives 非 rc3 graph entry，Host 工具不受影响）。
- 生产包重建 `package:dir` EXIT=0；打包内 `litsearch.py` 含 `CLOUDFLARE_CHALLENGE`、`pylibs/yaml` 存在。
- 生产实例 CDP 启动、`/pm/overview` 与工作台正常；in-app 下载+Kb 双测通过。

## 7. 剩余边界

- Cloudflare/闭源论文：工具不会绕过；需真实浏览器 Turnstile 或 CARSI/机构登录，或改走 OA 仓库副本。
- Zotero 中 Penfold 2018 与 Hibi 1988 各有一条早期“仅元数据”条目，本次新增带 PDF 条目；可在 Zotero 里右键 Merge Items 合并（需一次人工操作）。
- 本地 API 写（tag/collect/classify）仍需 Zotero「始终允许」一次；Connector 导入/附件不需要 key。
- WAXS 只有子午/赤道 1-D 切线，无 2-D cake 积分；波长未在数据文件给出，按 Cu Kα 处理。
- 生产 exe 直接双击仍会缺 venv PATH；请用 `scripts/start-polymechanism-prod.cmd`（或桌面快捷方式指向它）。
