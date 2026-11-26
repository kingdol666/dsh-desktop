# 验收：2.5.2 领域隔离加固与文献页 PDF 预览生命周期修复

日期：2026-11-26  
版本：PolyMechanism Studio 2.5.2（2.5.1 补丁）  
前置：[2026-11-26-domain-isolation-2.5.1.md](2026-11-26-domain-isolation-2.5.1.md)

## 1. 范围

2.5.2 在 2.5.1 PDF 预览生命周期修复之上，完成了一轮五轴（correctness / readability /
architecture / security / performance）审查，修复了审查发现的领域隔离与授权缺陷，
并保证发布产物与已验证源码一致（vendor pm4 三方一致）。

## 2. 修复

### 2.1 文献页 PDF 预览生命周期（沿用 2.5.1 候选）

- `applyLiterature` 在 scoped `ctx.inject(['layout', 'sidebarRight'], ...)` 内维护待执行预览定时器集合；scope 清理时取消全部定时器。
- 延迟回调执行前校验 `services.sidebarRight` 仍是点击时捕获的实例；shell/right-sidebar 重载后旧回调安全放弃。
- Host Literature 路由返回工作区相对路径，客户端恢复为当前工作区绝对路径后再走 `dsh-resource://file/session/...`。

### 2.2 领域路由与授权边界

- 工作区解析统一走 DSH `WorkspaceRegistry.resolveByPath()`：拒绝相对路径、NUL、未注册目录；不再以 `existsSync()` 作为授权依据。
- 四个 `/api/pm-domain/*` 路由只接受已注册工作区；响应只含 workspace id 与工作区相对路径，不泄露本地绝对路径。
- 文档与孤儿 PDF 路径在响应前做 realpath 包含校验（symlink/junction 指向工作区外即剔除）。
- 领域注册表 `kbRoot/notesRoot` 校验升级：词法 `..` 检查 + SQLite 文件（`kb.sqlite`/`-wal`/`-shm`）的 realpath 包含校验，链接到工作区外的 KB 目录被拒绝并记录 warning。
- `.pm-domain/state.json` 读写同样做包含校验；状态写入失败时 `/active` 返回 `STATE_WRITE_FAILED`。
- 状态临时文件加入 `randomUUID()`，消除同进程并发写冲突；写入使用 `flag: 'wx'`。

### 2.3 知识库查询层

- `docs.domain` 缺失的旧 schema 在领域查询中 fail-closed（`WHERE 0` / `DOMAIN_SCHEMA_REQUIRED` 409），不再静默跨域返回。
- 向量统计改为 `vecs → chunks → docs.domain` 关联计数，不再统计整个 KB root。
- `listDocs` 支持多 kind `IN (...)` 绑定参数查询。
- 文献路由强制 `allowedKinds`（`KIND_NOT_ALLOWED`）；显式 `kind=all` 时按配置生成允许集合。
- 迁移生成的 `allowedKinds: ['pdf']` + `notesRoot` 配置不再导致手记/报告从文献页消失：notes 查询回退为 `md/markdown/txt`。
- 空 kind 允许集返回空结果（`WHERE 0`），不再静默放开为不过滤。

### 2.4 领域记忆隔离（cognition pm4）

- `domain_recall` 的 associative/`expand` 关联扩展原先遍历 `memory.all()` 未复检 scope/subject/tags，同主题跨工作区、跨领域记忆会从 `related` 泄露。
- vendor `dsh-cognition-engine` 升级 `0.14.0-pm4`：关联分支复用 `visibleByScope` + subject + 必含 tags 过滤，时间语义保持 associative 不变。
- 三方一致性已验证：`src/package/lib/tools.js` = `dsh-cognition-engine-0.14.0-pm4.tgz` = desktop `node_modules` 安装包。
- `domain_remember` 响应只投影本次写入凭据（`result.stored.id`），不再外带 store 级 conflicts/stats；写入无凭据时返回 `MEMORY_WRITE_FAILED`。

### 2.5 专家守卫与生命周期

- 原始 cognition 守卫改为优先读取 live `agentPresets.composedPreset(agent.ctx)`（与 pm-research 同一模式），registry 不可用时回退 session header；空白会话换 preset 不再绕过专家限制。
- 守卫注册移出 workspace 注入 scope：无 workspace registry 时专家保护仍然生效。
- tools/connection 注册改挂在对应注入 scope 上，workspace provider 重载时旧 handler 随 scope 注销，不残留旧 registry 引用。

### 2.6 项目绑定

- `domain_route/domain_scope/domain_remember/domain_recall` 与 `/api/pm-domain/active` 全部强制项目存在且 `project.domain === 领域 id`（`PROJECT_DOMAIN_MISMATCH`）。
- 无 active project 的 `domain_recall` 返回 `PROJECT_REQUIRED`。
- 未注册 session workspace 的 domain 工具直接报错，不再回退 `process.cwd()`。

## 3. 验证

### 3.1 单元与回归（plugins/domain-router，Node 24）

- `tsc -p tsconfig.json --noEmit`：通过。
- `vitest run`：7 文件 20 passed，覆盖：
  - 注册表合并、路径逃逸拒绝、symlink KB 目录拒绝（junction 指向工作区外）；
  - 状态原子读写、workspaceId 稳定；
  - 工具层：路由/scope/记忆标签、跨域确认、`PROJECT_REQUIRED`、`PROJECT_DOMAIN_MISMATCH`、未注册 workspace 拒绝、记忆响应只含 `stored.id`；
  - routes（SQLite fixture）：未注册工作区拒绝、响应无绝对路径、`PROJECT_DOMAIN_MISMATCH` 404、`KIND_NOT_ALLOWED`、旧 schema 409、迁移 PDF-only 配置下 notes 仍可见；
  - KB（SQLite fixture）：domain/kind 过滤、分页、向量按域计数、旧 schema fail-closed；
  - cognition pm4 安装包直连测试：associative `related` 不再带出其他 workspace/domain 的同主题记忆；
  - 守卫：live composed preset 优先、非专家放行、无 agent ctx 回退 header。

### 3.2 桌面客户端与发布门禁（dsh-plugin-desktop）

- `tsc -p tsconfig.client.json --noEmit`：通过。
- `vite build --config vite.client.config.ts`：通过。
- `tsdown`（desktop + domain-router）：通过。
- `tests/client-literature.spec.ts`：4 passed（插槽注册、cwd 去重、PDF 打开、reload 取消延迟回调）。
- release 相关 13 个测试文件全部通过（`check:win-package` 内含）：package、package-win、desktop-installer-quit、installer-nsh、update-checker、update-download、verify-win-installer、verify-win-portable、verify-packaged-runtime、windows-pwsh-sandbox、windows-volume-diagnostics、window-options、safe-mode。
- `verify:profile`（真实 Host 启动 + kb-rag 10 工具 + 双 Profile HMR）：通过。
- `verify-agent-team`（`VERIFY_COGNITION=1`，真实 Host + 真实 WorkspaceRegistry）：
  - 全局工具 112；strict `DOMAIN_REQUIRED` 拒绝 OK；
  - cognition remember/recall/forget 往返 OK；跨工作区隔离 OK；
  - `domain_scope → domain_remember → domain_recall` 往返 OK（注册工作区路径下）；
  - 六 preset 委派矩阵、专家工具隔离、禁用工具拒绝（3）全部通过。

### 3.3 产物一致性

- `dsh-cognition-engine 0.14.0-pm4`：src = tgz = 安装包，`cmp` 一致。
- 打包后 `dist/win-unpacked/resources/app/node_modules` 中确认 pm4 过滤代码与 domain-router 最终 bundle 标记存在。
- pm3→pm4 变更已同步 `dsh-plugin-desktop/package.json` 与 `yarn.lock`（lockfile diff 已审阅）。

## 4. 已知限制

- 文献页最多加载 200 条文档，无分页 UI；超出的按 offset 查询。
- `kb_search/kb_rag` 的 `allowedKinds` 强制、related/citation kind 过滤、Zotero/fetch ingest 的 domain 标注仍未统一到引擎边界（2.5.x 后续）。
- vectors=0 时引擎仍可能关键词回退；文献页显示 vectors 数量供判断。
- 未入库 PDF 不自动补、低置信度不自动建域；Mimosa 扫描 ENOBUFS，本轮不宣称安全审计通过。
- 全量 desktop vitest 的既有环境失败（Linux artifact 权限、module-resolution、client-environment 等）与本补丁无关；发布门禁按 `check:win-package` 单独执行并记录。

## 5. 安装包

| 项 | 值 |
|---|---|
| 文件 | dist/PolyMechanism-Studio-2.5.2-x64-Setup.exe |
| 大小 | 见 release 资产 |
| SHA-256 | 见 release 资产 |
| 构建 | Node 24.21.0 + electron-builder 26.15.7，x64 NSIS，未签名（Authenticode 独立发布步骤） |
