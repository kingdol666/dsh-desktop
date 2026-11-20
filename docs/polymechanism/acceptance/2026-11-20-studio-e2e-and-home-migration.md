# 验收记录:Studio 真实端到端作业 + 运行时目录迁移(2026-11-20)

执行环境:Windows 11,Studio 2.1.0(dev 构建),USTC deepseek-flash-2(OpenAI 兼容网关),
校园网直连出口 222.195.81.77(AS4538 CERNET)。

## 一、运行时目录迁移(`~/.dsh` → `~/.pmstudio`)

| 项 | 结果 |
| --- | --- |
| 默认 home | `product-identity.ts`: stable `homeDirectoryName = '.pmstudio'`;新增 `legacyHomeDirectoryName = '.dsh'` |
| 迁移 | 首次启动一次性复制;Windows 用 robocopy(长路径安全、可合并半成品),其他平台 `fs.cp`;写 `.migrated-from-legacy-home` 标记防重复;失败回退旧目录保证可启动 |
| 实机结果 | `~/.pmstudio` 1.4GB;**95 个历史会话**、profiles(lit/desktop/headless/acp)、`.credentials.yaml`(USTC key)、skills、storages、pm 全部就位;Studio 正常启动 |
| 会话落点 | 新会话按工作区落在 `~/.pmstudio/sessions/--C-Users-87287-.pmstudio-workspaces-pva-e2e--/session-*/session.v4.jsonl.zstd`(实证) |
| 研究数据 | 项目/证据/假设/机理图/知识卡在 `~/.pmstudio/pm/`(实证:PR-11-7f1c) |
| 迁移测试 | 10/10(命名、一次性复制、幂等、采用旧目录) |
| 边界 | Electron 的 Chromium 缓存仍在 `%APPDATA%\PolyMechanism Studio`(UI 缓存,非科研数据);可用 `DSH_HOME` 覆盖 |

## 二、校园网文献下载实测(直连,不走代理)

| DOI | 出版商 | 结果 |
| --- | --- | --- |
| 10.1295/koron.45.609 | J-STAGE(高分子論文集) | **DOWNLOADED** 1.15MB,PVA 1988 正交双轴拉伸原文 |
| 10.1021/acsapm.5c00216 | ACS | **CAMPUS_REQUIRED**(出版商 403 反爬;直连已到出版商) |
| 10.1007/s00289-010-0279-9 | Springer | **MANUAL_REQUIRED**(跳转 idp.springer.com 机构登录;USTC 该刊多经 CARSI) |
| 10.1016/j.polymer.2015.02.045 | Elsevier | **MANUAL_REQUIRED**(Cloudflare;无 OA) |
| 10.48550/arXiv.1706.03762 | arXiv | DOWNLOADED(此前已验证) |

新增能力:landing `citation_pdf_url` 解析 + DOI 前缀出版商模板(Springer/Wiley/ACS/T&F/IOP/J-STAGE),
订阅链**直连**(代理会掩盖校园 IP),401/403/429/反爬 → `CAMPUS_REQUIRED`;不绕过付费墙。

## 三、真实模型作业 I(文献 + 表征,deepseek-flash-2)

项目 **PR-11-7f1c**("PVA 取向-双折射端到端"),6 条证据,SHA-256 链 `verified=true`。

| 步 | 工具 | 真实结果 |
| --- | --- | --- |
| 1 | pm_literature_search ×5 | 5/5;core 72(ACS Appl. Polym. Mater. 2025, biaxially stretched PVA acetal);PVA 1988 排第 3(61) |
| 2 | pm_literature_download | DOWNLOADED(1.15MB) |
| 3 | pm_literature_download(Springer) | MANUAL_REQUIRED(如实,未重试) |
| 4 | pm_project_create | PR-11-7f1c |
| 5 | pm_waxs_analyze | **结晶度 11.73%**(非晶晕 19.99° + 晶峰 22.50°,R²=0.99952)→ EV-1-42c0 |
| 5 | pm_hermans_analyze | **f=0.8973**,⟨cos²⟩=0.93155,峰位 0° → EV-2-5cf5 |
| 5 | pm_saxs_analyze | Rg=3.000nm / Porod −3.000(**模型识破:数据严格 q⁻³,为退化拟合,不可用**)→ EV-3-3b7f |
| 5 | pm_ftir_analyze | 羰基指数 0.0019,氢键带 3330cm⁻¹ → EV-4-31ca |
| 6 | read + extract | 7 页/14,280 字符;2 条测量类 claims(结晶度 30–40%、n(101)=1.578 vs n[101]=1.553;荧光/双折射取向比 0.8–0.95)→ EV-5/EV-6 |
| 7 | kb_ingest + kb_search | 重复跳过 1;首次因 PATH 无 venv 导致 0 向量(模型如实报告);补 PATH 后 rebuild → **9 向量**,hybrid 检索命中 1(81ms) |
| 8 | evidence_verify | verified=true, chainLength=6 |

模型自评(摘录,保留其科研纪律):SAXS 不可用、WAXS 结晶度是下限(缺 (101) 峰)、FTIR 1444cm⁻¹
为边界伪峰、Hermans 未定相;"低结晶+高取向=高 Δn 但热稳定性差"的机理解释明确标注为推断。

## 四、真实模型作业 II(机理 + 假设 + 门控 + 知识卡)

| 步 | 结果 |
| --- | --- |
| import_seed | 23 节点 / 23 边 |
| mechanism_query(['拉伸比','双折射'],2) | 14 节点 / 17 边 / 3 路径 / missingKnowledge [] |
| hypothesis_propose | HY-1-8ba5(3 证据) |
| transition | conditional ✅ → under_test ✅ → **supported 曾被放行**(旧门控) |
| gate_check | **warn**,失败项 G-COMPETE |
| knowledge_propose | KC-p-3-2386 pending |
| kb rebuild + search | 13 块 / 9 向量;命中 1 |

模型对自家结论的裁决:supported **不成立**——账本里没有 Δn 因变量;EV-6 比值<1 实际**偏向 H2**;
判别实验(固定 λ 扫 Δn–f)无法分离共线的 f/Xc,需正交扰动(固定 λ 改 Xc / 固定 Xc 改 λ)。
随后自动把 HY-1-8ba5 **archived**。

### 据此完成的产品修复(本次提交)

**门控收紧**:`G-COMPETE` 从 warn 升级为 **block**(结论必须排除至少一个竞争假设);
`pm_hypothesis_transition` 新增 `excludedCompetitors` 参数,服务端把假设声明的竞争假设映射为
gate 的排除状态。实机复验:
- 不传排除 → `GATE_BLOCKED: declare at least one excluded competitor before concluding` ✅
- 传排除但仍无绑定证据 → `GATE_BLOCKED: claim has no bound evidence records` ✅(双重门)
- 归档 HY-1 → archived ✅
测试:pm-core 31/31、pm-research 47/47(更新了 4 个语义断言);verify:profile=0;verify:literature=0。

## 五、全场景覆盖矩阵

| 场景 | 状态 | 证据 |
| --- | --- | --- |
| 文献在线检索 + 高分子预筛 | ✅ | 作业 I 步 1(core 72/important) |
| 校园网订阅/开放下载 + 状态分类 | ✅ | J-STAGE DOWNLOADED;ACS/Wiley/Springer 如实分类 |
| 文献精读 + 测量类证据抽取 | ✅ | EV-5/EV-6 |
| 知识库入库/检索(含向量) | ✅ | 9 向量,命中 1 |
| WAXS 结晶度分解 | ✅ | 11.73%(真值回收) |
| Hermans 取向 | ✅ | 0.8973(模型从 CSV 独立复算 0.89733) |
| SAXS / FTIR / 松弛 | ✅ | Rg(退化被识别)/ 羰基指数 / 模型 E2E 覆盖 KWW |
| 解析仿真(pm_sim_*) | ✅ | 单测 + 真值回收(chain_stats/rubber/avrami/tg/diffusion/flory) |
| 机理图谱导入/查询/路径 | ✅ | 23n/23e;14n/17e/3 路径 |
| 假设状态机 + 科学门控 | ✅(已收紧) | under_test→supported 双重门拦截 |
| 知识卡 RSI(propose/review 状态机) | ✅ | KC-p-3-2386 pending;review 单测 |
| 证据账本哈希链 | ✅ | verified, 6 条 prevHash |
| 研究工作台路由 | ✅ | /pm/projects + /:id/state(verify:literature 断言) |
| Zotero 读/写入 | ✅/⚠️ | 读全通 + import-bibtex 201;分类写需 Zotero 弹窗授权一次 |
| 安装包内 science 引擎 | ✅ | win-unpacked 内 Hermans f=0.6334 CONVERGED |

## 六、发现并修复的问题

1. 迁移在 Windows 深路径 node_modules 上失败 → robocopy 回退(本次实机 1.4GB 迁移成功)。
2. 旧 Studio 实例占单实例锁 → 启动前清理进程。
3. lit profile 的 preset 归属为空(headless 会话无 header)→ resolvePreset 惰性读取 + `defaultId` 兜底。
4. pm-research lib 缺失时工具整体不注册 → 运行前必须 build(流程已在验收脚本中固化)。
5. `G-COMPETE` 仅 warn → block + 排除参数(上文)。
6. kb-rag 在 headless 下解析到系统 Python(损坏 numpy) → 0 向量;带 science venv 的 PATH 后恢复。

## 七、边界(如实)

- ACS/Wiley/Elsevier 对脚本 UA 反爬;Springer 要求机构登录——三者需浏览器在校园网下载后
  `pm_literature_read`/`kb_ingest` 入库(工具已提供 MANUAL_REQUIRED 直链)。
- `saxs_pva_reference.csv` 为 q⁻³ 解析参考数据,不能当真实 Rg;WAXS 参考数据缺 (101) 峰。
- 工作台为六标签覆盖层(非 Dockview 可停靠);契约仍为前后端各一份手写类型。
- macOS/Linux 安装包由 CI 构建(未签名)。
