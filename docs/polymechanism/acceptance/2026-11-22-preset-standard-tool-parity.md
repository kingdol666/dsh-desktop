# 高分子专家 Preset 标准工具面对齐验收（2026-11-22，v2.2.3）

## 结论

六个高分子专家 preset 之前只声明了 `persona + tool-skill`，而 DSH 的 preset 是**隔离的组合树**：未在 preset 内声明的插件不会出现在该 Agent 的工具面中。因此文件、Shell、Web、Todo、子代理、计划、压缩等标准工具确实不可用。

v2.2.3 已把每个 polymer preset 补齐为与 0.2.1-rc.3 `standard` preset **完全一致的 32 个插件行**，并通过运行时工具 schema 对比验证：六个 preset 的工具集合均包含 `standard` preset 的全部工具。

## 1. 根因

- DSH `@deepseek-ai/dsh-agent-preset` 的 `config.plugins` 是该 preset 的完整子插件列表。
- 原 `dsh-plugin-desktop/cordis.patch.yml` 中六个 preset 只有：
  - `@deepseek-ai/dsh-persona`
  - `@deepseek-ai/dsh-tool-skill`
- 所以即使根组合里有 `tool-fs` / `tool-pwsh` / `tool-web` 等插件，preset 隔离作用域内也不会自动拥有它们。

## 2. 修复内容

每个 polymer preset 现在包含（与安装的 `@deepseek-ai/dsh-web-app/presets/standard.patch.yml` 0.2.1-rc.3 对齐）：

- `persona`（角色专属 prefix，含 `includeRuntimeContext: true`）
- `agent-instructions`（maxBytes 65536）
- `time-context`
- `tool-bash` / `tool-pwsh`（按 `process.platform` 互斥启用）
- `tool-fs`（read / write / edit / read_image）
- `tool-fs-search`（glob / grep）
- `tool-jobs`、`tool-schedule`
- `skill-filesystem`、`tool-skill`
- `command-goal`、`tool-goal`
- `planning` 组 → `plan-mode`
- `compaction` 组 → `compaction-basic` / `command-compact` / `tool-result-pruner`
- `delegation` 组 → `tool-subagent-control` / `list-agents` / `tool-subagent`(spawn) / `tool-subagent`(fork) / `workflow-ptc` / `tool-workflow`
- `tool-ask-user`、`tool-todo`、`tool-web`、`tool-present`
- `tool-plugin-manager`、`tool-plugin-market`（disabled，与 standard preset 一致）

角色 prefix 同时说明“拥有完整标准 DSH 工具面”，并保留各自的科研纪律与工具使用边界。

## 3. 验证

### 静态组合比对

新增 `dsh-plugin-desktop/tests/preset-composition.spec.ts`：

- 解析 `cordis.patch.yml`，递归展开 group 内插件；
- 与已安装的 `standard.patch.yml` 插件名集合逐一比对；
- 六个 preset 均无缺失、无额外；
- 每个 preset 的 persona prefix 非空且含角色与“standard DSH tool surface”声明。

结果：**14/14 通过**。

### 运行时挂载与工具 schema

`yarn verify:profile`（临时隔离 profile，真实 Loader 启动）新增：

- 六个 polymer preset 必须成功 `acquireScope`（挂载失败即报错）；
- 对每个 preset 取得 `tools.schemas(scope.key)` 的工具名集合；
- 以 `standard` preset 的实际工具集合为基线，任一 polymer preset 缺少标准工具即失败。

结果：**EXIT=0**。六个 preset 均成功挂载，且工具集合覆盖 `standard` 的全部工具。

已安装 2.2.3 的 `resources/app/cordis.patch.yml` 与仓库通过的补丁 SHA-256 完全一致：

`72e48a69275493fdd66ce60e86597c6be7fc8132d672d7527e69601021c926ed`

补丁内 `@deepseek-ai/dsh-agent-preset` 行数 = 6，`@deepseek-ai/dsh-tool-fs` 行数 = 6。

## 4. 发布与实机更新

- 版本：2.2.3
- Release：`https://github.com/kingdol666/polymechanism-studio/releases/tag/v2.2.3`
- Setup：`PolyMechanism-Studio-2.2.3-x64-Setup.exe`
- 大小：`364,341,258` 字节
- SHA-256：`d0d03213fe0f84358e857f6720527e1a9124605199983a174d5f4f1eae1dd5e4`
- GitHub Release `digest` 与本地一致。

实机更新链路（已安装 2.2.2）：

1. 应用内检查：`PolyMechanism Studio 2.2.3 已可用。`
2. 下载完成：`C:\Users\87287\Downloads\PolyMechanism-Studio-2.2.3-windows.exe`，364,341,258 字节，SHA-256 与 Release 一致。
3. `重启并安装` → 安装器运行 → 自动重启。
4. 卸载注册表项 `PolyMechanism Studio 2.2.3`；页面 `dsh-desktop-version=2.2.3`。
5. 安装后再检查：`当前已是最新版本。当前版本：2.2.3`。

## 5. 边界

- Preset 是能力集，不是安全沙箱（与上游设计一致）。审查者 preset 虽拥有完整标准工具面，但 persona 明确要求对研究产物只读，唯一科研写权限仍是 `pm_knowledge_review`。
- `pm_*` 工具仍有独立的科研角色权限矩阵（scientist/physicist/characterization/modeler/literature/reviewer），这是领域设计，不是 DSH preset 缺陷。
- 本轮只构建 Windows x64 资产；未签名；GitHub Actions tag 仍未触发。
- Mimosa 扫描器在提交时返回 `ENOBUFS`，本轮不宣称完成全量安全审计。
