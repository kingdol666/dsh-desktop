# 插件契约记录(plugin contracts)

> 2026-11-20 G012 实测。来源:npm registry manifest + 安装包源码(`~/.dsh/profiles/desktop/node_modules/`)+ 实机冒烟输出。
> 目的:补 08 文档 S0.6 债——记录 kb_* / zotero 工具的**真实返回形状**,作为 G013/G015 编排与契约测试的基准。

## 安装事实

| 项 | 值 |
| --- | --- |
| 方式 | profile package.json 精确版本依赖 + pnpm install(hoisted)+ `dsh.profile.bundles` 追加,复刻 plugin-manager `installBundle` 流程 |
| 落点 | `~/.dsh/profiles/desktop/`(bundles: dsh-base / dsh-web-app / dsh-community-market / dsh-kb-rag / dsh-zotero-skill) |
| dsh-kb-rag | 1.6.8(MIT);peer `@deepseek-ai/dsh-tools >=0.2.0-rc.2 <0.3.0`(rc.3 在域内)、`@deepseek-ai/cordis ^4.0.1`;client inject `dsh-client-ui-conversation` ✓物化 / `dsh-client-ui-primitives`(rc3 client graph 无此 entry,WARN 降级,不影响 Host 工具面) |
| dsh-zotero-skill | 0.5.5(MIT);无 `@deepseek-ai` peer;纯 Host skill provider(`skills.registerProvider`,skill 名 `zotero`),无 client 行(不在 web graph,属预期) |
| 组合验收 | `yarn workspace dsh-plugin-desktop verify:literature`(scripts/verify-literature-plugins.mjs)EXIT=0:kb_*×10 注册 + zotero/literature-review/polymer skills + 六专家 preset + pm 工具面 + web client graph + /pm/health 200/403 双探针 |

## kb_* 工具契约(实测)

引擎:`node_modules/dsh-kb-rag/kb_engine.py`(daemon `serve` JSON-lines 协议 `{id,command,payload}→{id,ok,response|error}`,单发 CLI `<command>` 模式同协议)。工具经 Host `ctx.tools.register` 注册,execute 时惰性 spawn daemon(首次调用触发)。

| 工具 | 关键参数 | 返回要点(实测样例) |
| --- | --- | --- |
| `kb_ingest` | `paths[]`(必),`kb_root`(默认 `.kb`),`force/meta­data_only/rebuild` | `{ok, kb_root, files:[{path,status:'added',chunks,vectors,title,year,ms}], files_total, totals}`;实测 2 PDF→chunks 15/54,vectors 13/51 |
| `kb_search` | `query`(必),`top_k`(1-10),`depth: quick/deep`,`mode: hybrid` | `{query, scored, top_k, mode_used, reranker, results:[{file,title,authors,year,journal,doi,zotero_key,section,para:[a,b],page:[a,b],score,snippet}]}`;实测 62 chunks scored,首条命中 Ursu 2015 Results 段(页 2-4) |
| `kb_fetch` | `identifiers[]`(DOI/arXiv),`target_dir`(默认 `~/.kb-rag/downloads`),`ingest` | 落盘 `<dir>/<source>/<year>/<title>__<hash8>.pdf` + `manifest.json`(v2 结构,内容哈希去重);实测 arXiv 1706.03762 下载成功,付费墙 DOI 返回手动兜底指引(不绕过);检测代理并警告 TLS/反爬干扰;timeoutMs 300000 |
| `kb_scope` | `scope: kb/both/web`,`depth`,`strict`,`diligence: normal/thorough` | 按会话隔离的检索范围设置;`thorough` 解除检索上限并进入"fetch 补库→引文关联→再查"循环 |
| `kb_stats` | `kb_root` | 文档/块/向量计数、最近导入、模型缓存状态(`KB_EMBED_MODEL`/`KB_RERANK_MODEL`) |
| `kb_status` | `job_id` | 后台任务(大批量 ingest/zotero)进度 |
| `kb_zotero` | `zotero.sqlite` 路径或自动检测,`dry_run` | 单向迁移本地 Zotero 库(含 PDF 附件)进知识库;无本地附件的条目跳过,不联网下载 |
| `kb_rag` | `query`,`depth`,`scope` | 编号引用的证据回答,可选 HTML 报告页(自检禁止外部依赖) |
| `kb_dedup` / `kb_clear` | `confirm:true`(clear 必传) | 去重保留最早副本 / 清空需确认 |

**引擎环境变量**:`KB_EMBED_MODEL`(默认 BAAI/bge-small-zh-v1.5)、`KB_RERANK_MODEL`(默认 BAAI/bge-reranker-base)、`KB_HF_MIRROR`>`HF_ENDPOINT`(镜像)、`KB_AUTO_PIP=1`(缺包自动 pip)、`UNPAYWALL_EMAIL`;**工作区级** `<workspace>/.kb-rag/engine.env` KEY=VALUE 合并进 os.environ(优先级低于进程环境)。

**Python 解释器解析**:daemon 经 `subprocess.resolveExecutable("python")` 取 Host PATH——本机为 anaconda base(**其 numpy 2.5.4 与编译版 scipy/sklearn 不兼容,sentence_transformers 导入失败**);缓解:用 `scripts/start-polymechanism.cmd`(前置仓库 `science/.venv/Scripts` 到 PATH)启动桌面。science venv 实测:py3.12.13 + numpy 2.5.5 + scipy 1.18.1 + torch 2.15.0+cpu,ingest/search 全绿;pm_science 自测无回归(37/37+25/25)。

## zotero skill 契约(实测源码,功能冒烟因 Zotero 未装记 N/A)

- skill 名 `zotero`(frontmatter),由插件 `apply(ctx)` 经 `ctx.skills.registerProvider` 注册;Python 脚本随包在 `zotero/scripts/`
- 连接:Zotero 官方本地 API `http://127.0.0.1:23119`(需 Zotero 运行 + 设置开启"允许其他应用通信";写操作首次弹窗授权,Always Allow 持久化);不直接读写 zotero.sqlite(仅 kb_zotero 迁移场景读)
- 检索:`search <query>` 返回题录(题名/作者/年份/item key/BibTeX key);OpenAlex/Crossref 检索带加权排序(期刊 0.45/引用速度 0.30/相关 0.15/新鲜 0.10);**收录只导题录与摘要,不自动下载 PDF**(PDF 落地靠 kb_fetch 或手动)
- 本机状态:Zotero 未安装(127.0.0.1:23119 无响应)→ 库管理/收录/全文精读功能 N/A,**检索/筛选/下载链不依赖 Zotero**;G015 端到端的 Zotero 步骤在装 Zotero 后补测

## G013 设计修订(基于实测)

1. `pm_literature_download` 不重复实现下载链——kb_fetch 已覆盖 DOI/arXiv→PDF(含 `target_dir` 指定位置 + manifest v2 + 反爬识别);pm 层新增价值收窄为:**manifest 与证据账本/RSI 的对接、状态分类(DOWNLOADED/PAYWALL_MANUAL/CAMPUS_REQUIRED)、批量 screening 编排**
2. `pm_literature_search` 仍需自建(kb 引擎无在线学术检索;kb_scope 的 web 范围指 DSH 平台 web_search 补充,非学术源);OpenAlex/Crossref 直连 + 高分子 rubric(设计 11 §5 不变)
3. SSRF 守卫照设计 11 §4.4 落在 pm_science Python 侧(litsearch.py),kb_fetch 的抓取行为属第三方包,不在本仓库代码约束域
