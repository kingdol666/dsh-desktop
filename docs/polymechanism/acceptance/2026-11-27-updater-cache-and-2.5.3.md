# 验收：2.5.3 更新器固定缓存与静默清理

日期：2026-11-27  
版本：PolyMechanism Studio 2.5.3  
前置：[2026-11-26-domain-isolation-2.5.2.md](2026-11-26-domain-isolation-2.5.2.md)

## 1. 问题

2.5.2 及更早的更新流程在确认下载后仍弹出原生「保存更新安装包」对话框，
默认落到 Downloads，要求用户手动保存；升级完成后还会再询问「删除/保留安装包」。
安装包由应用自己下载和校验，用户不应管理这个文件。

## 2. 变更

- 删除保存对话框：安装包直接写入应用固定缓存目录
  `<userData>/updates`（Windows `%APPDATA%\PolyMechanism Studio\updates`，
  macOS `~/Library/Application Support/PolyMechanism Studio/updates`）。
- 缓存目录按私有权限（0700）创建；相对 userData 路径、链接根目录、非真实目录
  一律拒绝（新增 `prepareDesktopUpdateCache`）。
- 下载仍先校验发布方 SHA-256，再进入「现在重启并安装？」确认；用户确认后自动
  运行缓存中的安装器并退出当前版本（执行文件即刚校验过的文件）。
- 升级后的新版本启动时，读取 `pending-installer.json`，在版本已达到目标时
  **静默删除**缓存安装包并清除记录；删除失败（如 macOS DMG 仍挂载）保留记录，
  下次启动重试。
- 启动时清扫中断下载遗留的隐藏 `.partial` 文件（`sweepDesktopUpdateCache`）。
- 删除已无用的保存/清理对话框文案（中/英）；`docs/user-guide(.en).md` 同步。

## 3. 验证

### 3.1 单元与回归（dsh-plugin-desktop）

- `tsc -p tsconfig.json --noEmit`：通过；`tsdown` 构建通过。
- 5 个更新/打包测试文件 **300 tests** 通过：
  - `update-download.spec.ts`：新增固定缓存目录创建、相对路径/链接根目录拒绝、
    `.partial` 清扫只删残留不删安装包；既有下载/校验/digest 测试不变。
  - `electron-runtime.spec.ts`：断言下载不再调用 `showSaveDialog`、目标路径为
    `<userData>/updates/<filename>`；升级后自动调用
    `resolveDesktopUpdateArtifact(..., true)` 且不弹「删除安装包」对话框；
    Windows 安装器仍以 `--updated --force-run` 可见启动。
  - `updates.spec.ts`、`update-checker.spec.ts`、`package.spec.ts` 通过。

### 3.2 打包

- `dist:win` 完整门禁（`check:win-package` 13 文件 329 tests + runtime smoke）通过。
- 安装包：`PolyMechanism-Studio-2.5.3-x64-Setup.exe`，
  383,071,587 字节，SHA-256
  `23874d4060e4dee7fa62346534a7cab04a3a7bdb0e06822d419139180df3db6d`。
- `win-unpacked` 内确认包含新逻辑（`prepareDesktopUpdateCache`、
  `sweepDesktopUpdateCache`、`failed to sweep the update cache`）。

### 3.3 Release

- GitHub Release `v2.5.3` 已发布；资产 digest
  `sha256:23874d40…db6d` 与本地一致。

### 3.4 2.5.2 → 2.5.3 应用内更新 E2E

> 说明：本次更新由已安装的 2.5.2 发起，2.5.2 仍使用旧的保存对话框流程；
> 新流程从 2.5.3 起生效。

1. 主 shell 触发 `/api/desktop/updates/check` → 检测到 2.5.3 并弹「下载」确认。
2. 下载至 `~/Downloads/PolyMechanism-Studio-2.5.3-windows.exe`（旧流程路径），
   383,071,587 字节，SHA-256 与 Release 一致。
3. 「重启并安装」→ NSIS 静默运行（本次约 10 分钟，Defender 扫描导致；无可见
   向导窗口）→ 安装目录版本 2.5.3，应用自动重启。
4. **新清理逻辑实测**：2.5.3 首次启动后，Downloads 中的安装包被自动删除，
   `updates/pending-installer.json` 清除（仅剩 `state.json`）——无需任何用户操作。
5. 安装版冒烟（CDP）：shell `dsh-desktop-version=2.5.3`；文献页加载 9 篇论文；
   点击 Ursu 2015 → 右栏预览正确打开
   `papers/ursu-2015-pva-anisotropy.pdf`；窗口在前台时页面 canvas 绘制为
   968×1370（隐藏窗口时 Chromium 暂停渲染属预期）；当日日志 0 console error。

## 4. 已知限制

- 从 2.5.2 及更早版本升级到 2.5.3 的那一次更新仍会出现旧的保存对话框
  （由旧版本代码发起）；从 2.5.3 起的后续更新使用新流程。
- 新流程的端到端下载路径（缓存目录内下载 + 无对话框）将在下一次发布
  （2.5.3 → 下一版本）时真实验证；本轮由单元/集成测试与打包产物检查覆盖。
- 全量 desktop vitest 的既有环境失败与本补丁无关；Mimosa 扫描 ENOBUFS，
  未宣称安全审计通过。
