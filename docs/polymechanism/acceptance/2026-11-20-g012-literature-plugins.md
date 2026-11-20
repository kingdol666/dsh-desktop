# G012 验收记录:文献插件集成与契约冒烟(2026-11-20)

对应台账 G012(docs/polymechanism/11-文献检索与高分子筛选设计.md §3)。执行分支 `feat/lit-g012-plugins`。

## 交付物

| 交付物 | 位置 |
| --- | --- |
| 组合级验收脚本 | `dsh-plugin-desktop/scripts/verify-literature-plugins.mjs`(`yarn verify:literature`) |
| 桌面启动 wrapper | `scripts/start-polymechanism.cmd`(前置 science venv 到 PATH) |
| 插件契约记录 | `docs/polymechanism/evidence/plugin-contracts.md`(补 S0.6 债) |
| profile 安装(repo 外) | `~/.dsh/profiles/desktop`:bundles + dsh-kb-rag@1.6.8 + dsh-zotero-skill@0.5.5(pnpm hoisted,精确版本) |

## 冒烟结果(六项)

| # | 冒烟项 | 结果 | 证据 |
| --- | --- | --- | --- |
| 1 | Host 组合无 skip | ✅ | verify:literature EXIT=0;`[kb-rag] ready (v1.6.8): 10 tools + /kb command`;kb-rag/zotero-skill 两个 bundle 层均加载 |
| 2 | kb_* 工具可见 | ✅ | boot 断言 10/10 注册(tools.get);pm_literature_read/extract 回归在位 |
| 3 | kb_ingest→kb_search | ✅ | 2 篇真实 PDF(Ursu 2015 / Nishio 1994)→69 chunks/64 vectors;hybrid 检索"biaxial stretching orientation birefringence"首条命中 Ursu Results 段(page 2-4,score 0.032) |
| 4 | kb_fetch 下载链 | ✅ | arXiv 1706.03762 下载成功落 `<target_dir>/arxiv/2017/...pdf` + manifest v2;付费墙 DOI(10.1016/j.polymer.2015.02.045)按设计拒绝并给浏览器手动指引;代理检测正常(127.0.0.1:7890) |
| 5 | Zotero | ⏸ N/A | Zotero 未安装(23119 无响应);skill provider 已注册(skill 名 `zotero`);检索/筛选/下载链不依赖 Zotero,G015 前补装 |
| 6 | 契约文档 | ✅ | plugin-contracts.md 记录真实返回形状 |

## 回归

| 门 | 结果 |
| --- | --- |
| desktop vitest | 9 failed / 139 passed — **上游基线不变**(31 tests/9 files 与既有清单一致) |
| verify:profile | EXIT=0 |
| pm-research vitest(science venv 扩展后) | 12 files / 37 tests 全过(含 pm_sim 真值回收 selftest) |
| pm-core vitest | 3 files / 25 tests 全过 |

## 环境决策(重要)

- **anaconda base env 已损坏**(numpy 2.5.4 vs 编译版 scipy/sklearn,sentence_transformers 导入失败)——不改用户 base env;kb-rag daemon 经 Host PATH 解析 `python`,故提供 `scripts/start-polymechanism.cmd` 前置仓库 `science/.venv`(py3.12.13,numpy 2.5.5/scipy 1.18.1/torch 2.15.0+cpu,uv 扩展安装 pymupdf+faiss-cpu+sentence-transformers+torch,零回归)。
- **模型缓存**:bge-small-zh-v1.5 + bge-reranker-base 经 `HF_ENDPOINT=https://hf-mirror.com` 预下载完成(后续离线可用)。
- **已知降级**:kb-rag client inject 的 `dsh-client-ui-primitives` 在 rc3 client graph 无独立 entry(verify 脚本 WARN);kb-rag client 半边自述加载失败不影响 Host 工具面——如实记录。

## G013 设计修订

见 plugin-contracts.md 末节:下载链复用 kb_fetch(pm 层收窄为 manifest+证据+状态分类);检索仍自建(OpenAlex+Crossref+rubric);SSRF 守卫落 pm_science。
