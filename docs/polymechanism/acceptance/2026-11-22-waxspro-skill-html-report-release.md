# WAXS pro 工具链 + HTML 双报告发布验收（2026-11-22，v2.2.4）

## 结论

实验室 WAXS 处理 MATLAB 脚本（AirRemove_WAXS.m / Peak_Fit_WAXS.m / QX_WAXS.m + 使用说明 docx）完整移植为专家智能体工具链，新增"分析完成 → MD+HTML 双报告"标准收尾；发布 v2.2.4 并完成已安装 2.2.3 的实机在线更新。

## 1. 移植内容

| MATLAB 脚本 | 工具 op | 算法要点 | 数值验证 |
| --- | --- | --- | --- |
| AirRemove_WAXS.m | `pm_waxs_pro op=airremove` | k = (样品前 N 点均值 − 末点)/(空气前 N 点均值 − 末点)，扣 `样品 − k·空气` | 合成数据 k 精确恢复 1.5（selftest）|
| Peak_Fit_WAXS.m | `pm_waxs_pro op=peakfit` | 面积参数化 Gauss（`A/(w√(π/2))·exp(−2((x−xc)/w)²)`），逐峰角色/边界；结晶度 = ΣA_cryst/ΣA_all；FWHM = 1.17741w；Scherrer `L=0.89λ·180/(FWHM·π·cosθ)` | 合成四峰 Xc 0.5445 vs 真值 0.5439，峰心恢复 <0.01°，r²>0.99 |
| QX_WAXS.m | `pm_waxs_pro op=orientation` | Lorentzian 方位角拟合 + 间隙掩膜 + ⟨cos²φ⟩/f_hkl/f_chain；修正了原脚本积分用 d² 的问题（默认修正版，`legacyBaselineSquare` 可复现原版） | 合成 Lorentzian r²=0.994，f 有界 |

新增模块：`science/src/pm_science/waxs_pro.py`、`science/src/pm_science/report.py`、CLI 分发 `waxs_pro` / `report`；Node 桥 `tools-waxspro.ts`（工具 `pm_waxs_pro` + `pm_analysis_report`）。

## 2. HTML 双报告

`pm_analysis_report` 接收结构化 payload（title/kpis/sections[narrative+table+figure]/conclusions/nextSteps/artifacts），产出：

- **自包含单文件 HTML**：渐变页头、KPI 卡片、内嵌 SVG 折线图（网格/刻度/图例/虚线拟合曲线）、数据表、过程说明（narrative）、结论编号列表、下一步与产物清单；零外部依赖，可打印。
- **同构 Markdown**。
- 路径经 `_guarded_path`（realpath + commonpath 包含检查）+ 名称白名单；工作区围栏内输出。
- 技能条款：`waxs-pro-processing`（新）与 waxs/saxs/ftir-analysis 增补"报告输出（必做收尾）"。

## 3. 质量门

| 门 | 结果 |
| --- | --- |
| science selftest（新增 4 项真值回收） | **25/25**，exit 0 |
| pm-research vitest（新增 waxspro-tools 3 项 + health 35 工具 + skills 13） | 4 文件 16/16；全量 53/53（1 例网络抖动重跑通过）|
| typecheck（pm-research） | 本次改动 0 错（tools-design 1 处为 master 既有，未属本次范围）|
| verify:profile（2.2.4 构建产物） | EXIT=0（preset 全量工具面 + 挂载校验仍过）|
| 打包内容核验 | Setup 内 `pm-research/lib` 含新工具（9 命中）、技能 1 命中、science CLI 6 命中 |

权限矩阵：`pm_waxs_pro` → scientist/characterization/physicist/modeler；`pm_analysis_report` 另含 literature；reviewer 保持只读（测试覆盖拒绝路径）。

## 4. 发布与实机更新

- Release：`https://github.com/kingdol666/polymechanism-studio/releases/tag/v2.2.4`
- Setup：`PolyMechanism-Studio-2.2.4-x64-Setup.exe`，364,390,799 字节
- SHA-256：`02b3c964ad610bf84b6429fe61d1efe5285b000db850a47ae4863be7afce34d5`（GitHub digest 一致）

已安装 2.2.3 实机链路：检查到 2.2.4 → 应用内下载（364,390,799 字节）→ SHA-256 与 Release 一致 → 重启并安装 → 自动重启为 **2.2.4**；`/pm/health` `total:35, has_waxs_pro:true, has_report:true`；页面 `dsh-desktop-version=2.2.4`。

## 5. 边界

- 报告 SVG 图表为折线类；直方图/等高线等后续按需扩展。
- `pm_waxs_pro` 不做 2D 帧方位积分（输入需一维 CSV/chi 剖面）。
- `orientation` 的拟合窗口/掩膜需按数据调整；MATLAB d² 行为仅在 `legacyBaselineSquare:true` 下复现。
- Windows x64 资产为主；Actions tag 触发仍未运行。
- Mimosa 在 commit 时对 gitignored 构建产物（vendored numpy 测试）报误报（已删 win-unpacked 后提交），按 ENOBUFS 兼容策略不宣称全量安全审计。
