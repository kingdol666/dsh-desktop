# 验收：2.5.1 文献页 PDF 预览修复

日期：2026-11-26  
版本：PolyMechanism Studio 2.5.1（2.5.0 补丁）  
前置：[2026-11-26-domain-isolation-2.5.0.md](2026-11-26-domain-isolation-2.5.0.md)

## 1. 问题

2.5.0 文献页点击论文「打开」时页面显示：

```text
cannot get property "sidebarRight" without inject
```

`src/client/literature/index.tsx` 的 `openPdf` 直接读取 `ctx.layout` 与
`ctx.sidebarRight`，但桌面客户端插件的模块级 `inject` 只声明了 `slots`、
`locale`、`connection` 等，未声明这两个由 shell/右栏插件提供的服务；Cordis 在
未注入时拒绝属性访问。结果右栏 PDF 预览完全不可用。

## 2. 修复

- `applyLiterature` 用 scoped `ctx.inject(['layout', 'sidebarRight'], ...)` 解析两个
  服务，存入 `PreviewServices`；页面注册仍立即执行，不依赖服务先就绪。
- `openPdf` 读取该服务表，缺失时仍返回可读错误；打开顺序保持
  `layout.selectPanel(null)` → 80ms → `sidebarRight.openResource(dsh-resource://...)`。
- 新增回归测试：注入 fake layout/sidebarRight，断言 `selectPanel(null)` 被调用、
  右栏收到 `dsh-resource://file/session/a/...` 地址。
- 版本 2.5.1；`tests/package.spec.ts` 同步。

## 3. 验证

- `tsc -p tsconfig.client.json --noEmit` EXIT=0；`vite build --config
  vite.client.config.ts` EXIT=0。
- `tests/client-literature.spec.ts`：3 passed（含新增 PDF 打开回归）。
- release 相关测试 9 文件 202 passed：package、package-win、update-checker、
  update-download、shipped-plugin-bundles、agent-team-seed、client-literature、
  presets-integration、preset-composition。
- dev app（默认 `~/.dsh` + `desktop` profile，真实工作区
  `D:\pm-acceptance\pva-oblique-2026-11-20`）：
  - 文献页 4 行论文，0 `.pm-lit-error`。
  - 点击第 1 篇：右栏出现 `2024_PVA-glycerol-film-crystallinity_MDPI.pdf`，
    22 个 PDF 页 canvas，正文可读（`Citation: Kovtun...`）。
- 再点第 2 篇 `ursu-2015-pva-anisotropy.pdf`：两个 PDF tab，
  4 个 canvas，0 console error / 0 log error / 0 exception。
- packaged 2.5.1（`dist/win-unpacked`，真实 profile/工作区）：
  URL `dsh-desktop-version=2.5.1`；文献页 4 篇论文；点击 URSU 后右栏显示
  4 个 canvas 且可读正文（`MATERIALE PLASTICE ... No. 1 ...`），0 console error。
- 全量 desktop vitest 仍有 9 个与本次改动无关的环境失败（Linux artifact、
  module-resolution、client-environment 等），见 2.5.0 验收的说明；本次 release
  相关测试全过。

### 3.1 2.5.0 → 2.5.1 应用内更新 E2E

- 2.5.0 应用内检查到 2.5.1，弹出「现在下载此更新？」；确认保存路径后下载
  `PolyMechanism-Studio-2.5.1-windows.exe`，383,020,632 字节，SHA-256
  `f3151d4c...f79efe` 与 Release asset 一致。
- 弹出「重启并运行安装程序？」→ 重启并安装 → 安装向导完成 → 安装目录
  `resources/app/package.json` 为 2.5.1。
- 更新后弹「删除更新安装包？」选择「保留安装包」；安装版启动 URL
  `dsh-desktop-version=2.5.1`。
- 安装版真实工作区文献页 4 篇论文；点击 URSU 后右栏 4 个 canvas、正文可读，
  0 console error。
- 环境说明：更新检查/资产下载统一走本机 `127.0.0.1:7890` 代理时，该出口的
  GitHub 匿名 API 配额一度耗尽返回 403；等待配额重置后本次 E2E 正常完成。
  API 直连可用但 GitHub 资产直连在本网络会 `ERR_TIMED_OUT`，因此代理是必要的。

## 4. 已知限制

- 右栏 PDF 预览依赖当前会话的 cwd 与文献页所选 workspace 一致；没有该工作区会话时
  提示先打开会话。
- 2.5.1 只修 PDF 打开，不改领域隔离/KB/记忆行为；2.5.0 的已知限制继续有效。

## 6. 安装包

| 项 | 值 |
|---|---|
| 文件 | `PolyMechanism-Studio-2.5.1-x64-Setup.exe` |
| 大小 | 383,020,632 字节 |
| SHA-256 | `f3151d4c2d1ee37dc9f84ef3b14f699cd20e6cdcf187fdbe718579d7a7f79efe` |
| 构建 | `Windows installer verification passed` |
