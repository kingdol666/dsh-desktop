---
name: domain-routing
description: 领域隔离与路由：先 domain_route/domain_scope 确定 PVA/WAXS/通用域，再让 KB、Zotero、lit-library 和记忆按 domain 作用域工作
whenToUse: 开始一个检索、文献、表征或机理任务前；问题可能跨 PVA/方法/其他高分子体系；或需要写入领域经验记忆时
metadata:
  domain: orchestration
  version: 1
---

# 领域路由与隔离

## 0. 先定领域，再取知识

每次任务开始时：

1. `domain_list` 看当前工作区 + 全局回退的领域。
2. `domain_route(question)` 判断领域。返回 `needsConfirmation:true` 时，**只问用户一个短问题**（例如“这更像 PVA 光学膜还是 WAXS 方法？”），不要自动建域。
3. `domain_scope(domain, projectId?)` 写 active domain；后续 KB/Zotero/lit-library/记忆默认使用它。
4. 把 domain 写进 brief 的“约束/已知事实”段。

没有 active domain 时，`kb_search`/`kb_rag`/`kb_ingest` 会返回 `DOMAIN_REQUIRED`。这不是故障，是隔离门。

## 1. 默认领域表

| domain | 用途 | 默认资料 |
|---|---|---|
| `pva-optical-film` | PVA 双轴拉伸、取向、结晶度、双折射、热定型 | `.kb-papers` 的 PDF；`.kb-notes` 的内部报告 |
| `waxs-methods` | WAXS/SAXS/GIWAXS/WAXD、衍射/散射、结晶度方法 | `.kb-papers` 的 PDF |
| `generic-polymer` | 其他高分子/纳米颗粒/方法参考 | `.kb-papers` 的 PDF |

实际以工作区 `domains/*/domain.json` 为准；上表只是迁移默认值。

## 2. 检索规则

- 文献结论默认 `kind=pdf`；`domain` 配置的 `defaultKind` 由插件自动应用。
- 默认只查主域。需要方法/对照论文时，显式传 `crossDomain:true`，只展开 `relatedDomains`；结果带 `domain` 标签。
- 内部报告/手记在独立 `.kb-notes`，不要把它们当论文引用；需要内部资料时显式切到 notes 域或传 `kind:'md'/'txt'`。
- `kb_search`/`kb_rag` 的 `kb_root` 只用于迁移/测试逃生；日常用 `domain`。
- 不要用 `kb_search` 的“大概相关”补 DOI；没有命中就写 `gaps`。

## 3. 记忆规则

- 领域事实只写 `domain_remember`：强制 `scope=workspace` + `tags: ['project:<id>','domain:<id>','workspace:<hash>']`。
- 跨域召回必须 `crossDomain:true` + `confirmCrossDomain:true`，并只展开 `relatedDomains`。
- 专家不能调用原始 `cognition_remember/recall`；用 `domain_remember/recall`（Reviewer 只 recall）。
- 记忆只写可复用规则/流程经验；不写一次性数值，不写未验证假设；**记忆不是证据**。

## 4. Zotero / lit-library 绑定

- `domain.json` 的 `zoteroCollection` 是该域的 Zotero collection；`zotero_search` 传 `collection` 限定。
- `litProject` 是 `lit-library` 的项目名；`lit_find/lit_import/lit_check` 用该 project。
- 不同域不要共用同一个 Zotero collection/lit project；域切换时同时切换绑定。

## 5. 低置信度与跨域

- 置信度低/前两名接近：问一个短问题，选项来自 `domain_route.alternatives`。
- 用户明确要跨域：`domain_scope` 保持主域，检索传 `crossDomain:true`；不要把关联域结果写成主域事实。
- 没有任何域匹配：先 `domain_list`，让用户选已有域或新建 `domains/<id>/domain.json`；不要自动建域。

## 6. 禁止

- 不得绕过 domain 直接 `kb_root` 检索（迁移/测试除外）。
- 不得把 `.kb-notes` 的报告当论文引用。
- 不得把 global 记忆当领域事实；不得把记忆当 evidenceId。
- 不得把关联域（methods/对照）的结论冒充主域（PVA）结论。
