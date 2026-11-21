# 仓库更名 + GitHub 在线更新实机验收（2026-11-22）

## 结论

仓库已由 `kingdol666/dsh-desktop` 更名为 `kingdol666/polymechanism-studio`，并完成两轮真实更新：

1. 已安装 **2.2.0** → 在应用内检查到 **2.2.1** → 从 GitHub 下载 364,309,383 字节安装包 → SHA-256 与 Release 资产一致 → 安装并重启为 **2.2.1**。
2. 仓库改名后，已安装 **2.2.1** 通过旧 API 路径的 **301 重定向**检查到 **2.2.2** → 下载 364,313,447 字节 → SHA-256 与 Release 资产一致 → 安装并重启为 **2.2.2**。
3. 安装后的 2.2.2 直接请求新仓库端点，检查结果为“当前已是最新版本 2.2.2”。

## 1. 仓库更名

| 项目 | 值 |
| --- | --- |
| 旧仓库 | `https://github.com/kingdol666/dsh-desktop` |
| 新仓库 | `https://github.com/kingdol666/polymechanism-studio` |
| 仓库描述 | PolyMechanism Studio：高分子科研 AI 桌面（SAXS/WAXS/FTIR、文献与知识库、机理证据链） |
| 本地 origin | `https://github.com/kingdol666/polymechanism-studio.git` |
| 旧 API 301 | `Location: https://api.github.com/repositories/1464220214/releases?per_page=15` |

改名后既有 Release 保留：`v2.2.1`、`v2.2.2`（以及更早的 `v2.2.0`）。

## 2. 更新器改动

- **跟随改名重定向**：`checkForDesktopUpdate` 与 `resolveDesktopInstallerUrl` 由 `redirect: 'error'` 改为 `'follow'`。
- **锁定最终主机**：版本响应最终 URL 必须是 `https://api.github.com/...`；安装包资源必须来自 `github.com` 或 `*.githubusercontent.com`。
- **公共主机校验**：拒绝 localhost、回环/私有/保留 IPv4、IPv6 唯一本地/链路本地、内网 DNS 后缀、内嵌凭据、非 443 端口，并处理尾随点形式（`localhost.`）。
- **Electron 传输层逐跳校验**：`requestDesktopArtifact` 在发出请求前及每次重定向前校验目标为公共 HTTPS；拒绝时安全 abort，避免重定向处理器同步抛错导致主进程崩溃。
- **2.2.2 端点切换**：`DESKTOP_GITHUB_REPO = 'polymechanism-studio'`。

## 3. 测试与构建

| 项目 | 结果 |
| --- | --- |
| 更新器单测（checker/download） | 45 + 52 = 97 通过 |
| 运行时/生命周期/打包/运行时组件 | 119 + 33 + 49 = 201 通过 |
| 合计目标测试 | 298 通过 |
| TypeScript typecheck | native-ui / tests / main 三套均通过 |

### 2.2.1（桥接版）

- 安装包：`PolyMechanism-Studio-2.2.1-x64-Setup.exe`
- 大小：`364,309,383` 字节
- SHA-256：`0a7cf7863d9c96ee0121ece72ba0bd2a26694aee0fdde268a799c30ee107d7cb`
- GitHub API `digest`：`sha256:0a7cf786…d7cb`（一致）
- Release：`https://github.com/kingdol666/polymechanism-studio/releases/tag/v2.2.1`

### 2.2.2（新仓库端点）

- 安装包：`PolyMechanism-Studio-2.2.2-x64-Setup.exe`
- 大小：`364,313,447` 字节
- SHA-256：`f4125ff7b50fa81648a7751c1934d4d14fb29b35c6da8ca4ec1d61cecb37d44c`
- GitHub API `digest`：`sha256:f4125ff7…d44c`（一致）
- Release：`https://github.com/kingdol666/polymechanism-studio/releases/tag/v2.2.2`

安装包均为未签名构建（既有策略），SmartScreen 可能提示。

## 4. 实机更新链路（证据）

### 轮次 1：2.2.0 → 2.2.1

1. 已安装版本读取：`resources/app/package.json` → `"version": "2.2.0"`。
2. 应用内检查更新，原生对话框：`PolyMechanism Studio 2.2.1 已可用。现在下载此更新？`（按钮：下载 / 稍后）。
3. 确认下载后出现系统保存对话框“保存更新安装包”；下载期间生成 `.partial` 文件，完成后为：
   - `C:\Users\87287\Downloads\PolyMechanism-Studio-2.2.1-windows.exe`
   - 大小 `364,309,383`
   - SHA-256 `0a7cf7863d9c96ee0121ece72ba0bd2a26694aee0fdde268a799c30ee107d7cb`（与 Release 资产一致）
   - ProductVersion `2.2.1`
4. 对话框：`PolyMechanism Studio 2.2.1 已可安装。现在重启 PolyMechanism Studio 并运行安装程序？`
5. 点击“重启并安装”：应用退出，安装器进程 `PolyMechanism-Studio-2.2.1-windows` 运行；安装约 3 分钟；卸载注册表项变为 `PolyMechanism Studio 2.2.1`；应用自动重启，页面查询参数 `dsh-desktop-version=2.2.1`。

### 改名后的桥接验证

- 已安装 2.2.1 仍请求旧端点 `api.github.com/repos/kingdol666/dsh-desktop/releases`。
- GitHub 返回 301 到 `/repositories/1464220214/releases`。
- 应用检查结果为：`当前已是最新版本。当前版本：2.2.1`，证明 301 跟随与主机锁定生效。

### 轮次 2：2.2.1 → 2.2.2

1. 应用内检查更新：`PolyMechanism Studio 2.2.2 已可用。`（同样经旧端点 301 到新仓库）。
2. 下载完成：
   - `C:\Users\87287\Downloads\PolyMechanism-Studio-2.2.2-windows.exe`
   - 大小 `364,313,447`
   - SHA-256 `f4125ff7b50fa81648a7751c1934d4d14fb29b35c6da8ca4ec1d61cecb37d44c`（与 Release 资产一致）
   - ProductVersion `2.2.2`
3. 点击“重启并安装”后安装器运行，卸载注册表项变为 `PolyMechanism Studio 2.2.2`，应用自动重启，页面 `dsh-desktop-version=2.2.2`。
4. 安装后的 2.2.2 bundle 常量：
   - `DESKTOP_GITHUB_REPO = polymechanism-studio`
   - `DESKTOP_VERSION_ENDPOINT = https://api.github.com/repos/kingdol666/polymechanism-studio/releases?per_page=15`
5. 直接端点检查结果：`当前已是最新版本。当前版本：2.2.2`。

## 5. 边界与未覆盖项

- 仅构建并发布了 **Windows x64** 资产；Linux AppImage/deb 与 macOS dmg 未在本轮产出。`.github/workflows/release.yml` 存在，但 tag 推送未触发运行，因此未依赖 Actions。
- 安装包未签名；未做 SmartScreen/代码签名验收。
- 更新下载速度很快（疑似代理/CDN 缓存），但文件大小与 SHA-256 均与 GitHub Release `digest` 一致。
- GitHub REST API 未认证调用受 60 次/小时限流；高频检查可能返回失败。
- Mimosa 扫描器在提交/推送时返回 `ENOBUFS`，本轮不宣称完成全量安全审计；已实现的更新器主机校验有单元测试覆盖。
