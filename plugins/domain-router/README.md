# dsh-domain-router

PolyMechanism Studio 的领域隔离管理层（Host-only）。

- `domains/<id>/domain.json`：工作区 + `$DSH_HOME/domains` 回退的领域注册表。
- `.pm-domain/state.json`：active domain / projectId。
- Tools：`domain_list`、`domain_route`、`domain_scope`、`domain_remember`、`domain_recall`。
- Routes：`/api/pm-domain/domains`、`/api/pm-domain/active`、`/api/pm-domain/literature`、`/api/pm-domain/orphans`（`connection.fetch` 认证）。
- Guard：对 polymer 专家 preset 拒绝原始 `cognition_remember/recall`，强制走 domain wrappers。

文献页在 `dsh-plugin-desktop/src/client/literature`，本插件只提供数据和路由。
