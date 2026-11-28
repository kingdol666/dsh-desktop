# 验收：2.5.4 科研工作台前端改版 + 应用内更新 E2E

日期：2026-11-28
版本：PolyMechanism Studio 2.5.4
前置：[2026-11-27-updater-cache-and-2.5.3.md](2026-11-27-updater-cache-and-2.5.3.md)

## 1. 变更范围（纯前端，业务与数据通路不变）

- **研究工作台**全局页面（`sidebar.panellist` + keyed `main`）：概览 / 数据与证据 / 假设 / 机理 / 知识 / 工具；假设与状态轨迹可下钻到关联证据（来源、观测字段、记录哈希）；账本完整性与科学门控分开展示。
- **会话内**工作台 dock 弹窗（只填草稿不发送）+ 会话 header「研究证据」右栏 tab（仅对挂载会话生效，Esc 后焦点归还）。
- **文献页**重做：工作区 × 领域组织，PDF 打开仅在右栏挂载会话与目标工作区一致时投递。
- **设置 / 插件管理 / 社区市场**：advanced/extended 下统一 PM 浅/深 token、2px 焦点环、窄宽自适应；compatibility 保持上游原样。
- 修复：暗色「新会话」对比度、关闭右栏不再绘制底色、工作台弹窗显式 `role="dialog"`/`aria-modal`。
- 提交：`89772097c6`（feat(ui)）+ `f1bac30c35`（release: 2.5.4）。Beta 镜像未同步。

## 2. 验证

### 2.1 单测与门禁

- 前端聚焦 105 tests（8 文件）、社区市场 329 tests、package 门禁 49 tests 全部通过；Stable typecheck 通过。
- 平台遗留失败取证：stash 对照基线，8 个 spec 失败清单逐项一致（29 项，`IDENTICAL_FAILURE_SETS`），未新增。
- `dist:win` 完整门禁（13 文件打包测试 + verify:closure + runtime smoke）通过。

### 2.2 打包产物实机 CDP（win-unpacked，真实数据）

- 侧栏「研究工作台 / 文献」入口、六分区导航正常。
- 真实项目「PVA 斜拉膜验收-真实数据」正确显示；**账本断点 EV-2-c679 以「证据链校验失败 · 请勿引用」红色警示呈现**——账本完整性与科学门控分离的设计按预期工作。
- 文献页（深色）：PVA 光学膜领域 9 PDF + 4 报告 + 2 手记，含「扫描未入库 PDF」与只读声明。
- 深浅色切换生效；console error 1 条（首次加载对历史会话 `/api/changes.summary` 的瞬态 404，与改版无关，重载后为 0）。

### 2.3 安装包与 Release

- `PolyMechanism-Studio-2.5.4-x64-Setup.exe`：384,409,852 字节，SHA-256 `72e361fc25ff2e583919e662fa99b7c48b5394e6074f751905b566a050b24bce`。
- GitHub Release `v2.5.4` 已发布，资产 digest 与本地一致。
- 推送：`e0c044ebbf..f1bac30c35 master -> master`。

### 2.4 2.5.3 → 2.5.4 应用内更新 E2E（新流程首次真实验证）

1. 已安装 2.5.3 启动 → 手动触发 `/api/desktop/updates/check` → 「PolyMechanism Studio 2.5.4 已可用。现在下载此更新？」→ 点「下载」。
2. 安装包下载至固定缓存 `%APPDATA%\PolyMechanism Studio\updates`（`.partial` 中转，全程无保存对话框）。
3. 校验通过后弹「现在重启 PolyMechanism Studio 并运行安装程序？」→ 点「重启并安装」→ 2.5.3 退出，NSIS 静默安装，应用自动重启。
4. 升级后确认：安装目录 exe FileVersion **2.5.4**；updates 缓存**静默清理完成**（安装包与 `pending-installer.json` 已删，仅剩 `state.json`）——2.5.3 验收遗留的「新流程端到端待真实验证」项本次实测通过。
5. 安装版 CDP 冒烟：URL 版本标记 `dsh-desktop-version=2.5.4`；`data-pm-studio` 存在；研究台六分区、文献页、深浅色切换全部正常。

## 3. 已知限制

- 跨工作区 PDF 预览切换未验证（打开动作带挂载会话守卫，不一致时拒绝投递并提示）。
- Beta 渠道未同步本次改版（beta mirror pending）。
- 全量 desktop vitest 的 29 项既有环境失败与本改版无关（基线取证见 §2.1）。
- Mimosa 扫描 ENOBUFS，未获得完整审计结论；不宣称安全审计通过。
