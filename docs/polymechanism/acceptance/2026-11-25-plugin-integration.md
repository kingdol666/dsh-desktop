# T0 插件集成验收（2026-11-25，v2.2.5）

## 集成批次（生态调查 2026-11-24 → 实施）

按"桌面托管捆绑"模式（生产依赖 + DESKTOP_SHIPPED_PLUGIN_BUNDLES，随安装包分发、开箱即用）集成 6 个包：

| 插件 | 版本 | 许可 | engines 核验 | 能力 |
| --- | --- | --- | --- | --- |
| memory-eternal | 0.49.11 | MIT | `>=0.1.5-alpha.2 <0.3.0-0` ✅ | 跨会话记忆 memory_note/recall/write；知识卡+召回 |
| dsh-library | 0.3.3 | Apache-2.0 | `>=0.2.1-0 …` ✅ | library_add/search/cite_check/list/remove/diagnose；零下载哈希嵌入 |
| dsh-cite-verify | 0.2.3 | Apache-2.0 | ✅ | cite_verify/batch/fix/export；Crossref/PubMed/arXiv 核验（白名单+限速） |
| dsh-research-skills | 0.1.2 | Apache-2.0 | ✅ | 7 个科研 SOP 技能 |
| dsh-matlab-workbench | 0.1.0-beta.2 | MIT | `0.2.1-rc.2 \|\| 0.2.1-rc.3` ✅ | dsh_matlab_prepare/code/collect/…（需本机 MATLAB） |
| @perrylink/dsh-research-core | 0.1.6 | Apache-2.0 | ✅ | PerryLink 工具共享核心 |

禁入核查：dsh-ai4scholar 已改 AGPL（本次调查发现，风险登记）、dsh-yuque-kb AGPL、dsh-datapilot/research-desk/scholar-digest engines 超限。

## 启动冒烟（verify:profile EXIT=0）

新增硬断言（scripts/verify-profile-boot.mjs）：
- 全局工具注册表必须包含 memory_recall / memory_note / library_search / library_add / cite_verify / dsh_matlab_prepare（20s 轮询等待）
- 技能注册表必须包含 citation-audit / reproducibility-audit / manuscript-preflight（dsh-research-skills）
- 六专家 preset 仍全量工具面（preset-composition 14/14）

## 已知限制（如实）

- memory-eternal 可选 Web UI 面板 + watchdog 自动拉起在 Windows/Node24 `spawn EINVAL`（上游问题，已用 profile 覆盖层禁 watchdog 自动拉起；核心记忆工具不受影响，启动日志如实记录失败）
- verify 脚本临时目录清理增加韧性（eternal 句柄不掩盖验收结论）

## 门禁

- verify:profile EXIT=0 / verify:literature EXIT=0
- shipped-plugin-bundles + preset-composition + package specs 67/67
- 打包体积 364.3MB → 374.4MB（+6 插件）

## 发布与实机

- Release：`https://github.com/kingdol666/polymechanism-studio/releases/tag/v2.2.5`
- Setup 374,448,297 字节；SHA-256 `d741514a740d85062d0079511abf95ca669e7c5cd7b1a7b9935f28feca77d9a6`（GitHub digest 一致）
- 已安装 2.2.4 应用内检查到 2.2.5 ✓；应用内下载因当时网络对 GitHub 大传输完全停滞（partial 0 字节）未完成 → 改用**字节相同**的本地 Setup 安装（SHA-256 与 Release 资产核对一致）；安装后 `/pm/health` 35 工具、`pm_waxs_pro`/`pm_analysis_report` 在线
- 发布上传当晚网络同样受控（gh 首次静默失败，`gh release upload` 重试约 75 分钟后成功）——记录为环境因素

## 场景实测（session-d780f05f，表征专家，真实调用）

| 项 | 插件 | 工具真实调用 | 结果 |
| --- | --- | --- | --- |
| 记忆 | memory-eternal | memory_note ✓ / memory_recall ✓ | 工具通；笔记入会话草稿（vault 未持久化），召回为空——需在「记忆」面板一次性持久化 vault 才能跨会话召回（设计行为） |
| 引用核验 | dsh-cite-verify | cite_verify ✓ | **DOI 真实解析 ✓ + 正确识别伪造标题**（相似度 0.1905 → fail），登记证据 ev-766025696a06；如实标注 v0.1 不查撤稿 |
| 工作区 KB | dsh-library | library_add ✓ / library_search ✓ | 24 chunks 建索引+嵌入；"热定型 结晶度"检索 5 条命中，**首条即正确结论段落**（且保留 NO_FIT 限定） |
| 科研技能 | dsh-research-skills | skill(reproducibility-audit) ✗ | 技能已入注册表但**调用失败**：上游插件以 path 注册 skill，与 rc.3 加载器要求 source 字符串不兼容（`source must be a string`）；且 literature-review 与自带技能重名被遮蔽；该插件本身不含工具（docs 明示） |
| MATLAB | dsh-matlab-workbench | 未测（需本机 MATLAB 在 PATH） | 留待用户环境验证 |

## 全功能实机验证（2026-11-25 第二轮：真实论文机理分析）

- 论文：Lee/Son/Park, Polymers 2025, 17, 3320（DOI 10.3390/polym17243320）。**pm_literature_download 被 MDPI Cloudflare 拦（CLOUDFLARE_CHALLENGE），pm_literature_browser_download（真浏览器 CDP）成功取回 809,716B 真实 PDF**——浏览器兜底链路首次端到端命中。
- 知识库：kb_stats **16 文档 / 841 块 / 743 向量**在线；dsh-library `library_add`（extracted.txt）→ `library_search` 5 条命中（"nozzle speed crystallinity"）。
- 记忆：memory_note/recall 工具通，笔记仍入会话草稿（vault 未持久化，如实记录）。
- 数据复算（智能体 numpy）：Xc 斜率 -0.06375 %/(mm/s)（R²=0.9643），相对降幅 17.708% ≡ 原文 17.7%；溶解增幅 18.657% ≡ 约 19%；F→p 反算 0.021526/0.052284（原文 0.0215/0.052，|Δ|<3e-4）；溶解组 F=4.17<Fcrit=4.256 → 95% 不显著（如实标注）；3 点相关性 df=1 p=0.0588（如实标注）；**智能体自曝并修正了一次 F 分布归一化常数错误（p 偏低 45 倍），错误值留档**。
- 机理判别（scientist 会话 PR-17-8f82，12 证据/6 候选边）：H1（局部热输入时间主导）→ **supported**（excludedCompetitors 排除 H2，G-EVID+G-COMPETE 通过）；H2（体相温度主导）→ **refuted**（需 refutes 极性证据 EV-11 才放行）；H3（剪切/停留历史→取向/成核）**无数据可判别，明确列为开放项**。
- 门控实况（全部真实拒绝）：transition proposed→under_test 被状态机拒绝（须经 conditional）；G-COMPETE 要求 `excluded:true` 标记；refuted 要求 refutes 极性证据；ED-2 因方程未显式单位 G-UNIT warn；因 literature_search 429 无法核 DOI，**无一条边标 established（G-DOI 保守）**；pm_mechanism_query 空图（本工作区无 seed）→ 如实报知识缺口。
- 权限边界（设计内）：characterization 无 pm_literature_read/pm_project_create/pm_hypothesis_transition/pm_mechanism_propose_edge；**scientist 无 pm_evidence_record**（改用 pm_literature_extract 登记 EV-1…EV-12）。
- 双报告：智能体自产 `mech-nozzle-speed-crystallinity-dissolution.html/.md`（22,193B/12,923B，2 张内嵌 SVG）；监督者另渲染 `mech-report.html/.md`（14,492B/6,079B）。均位于 data-wjh/reports-full-verify/。

## 有效性诚实评估

- **真正有效**：dsh-library（自有报告可语义检索，含限定语）、dsh-cite-verify（能拦下张冠李戴的引用——本次实测成功拦截了一个 DOI 真实但标题伪造的引用）
- **部分有效**：memory-eternal（工具链通，需一次性 vault 持久化；后续会话将真正跨会话记忆）
- **暂不可用**：dsh-research-skills（上游 rc.3 不兼容，计划 2.2.6 移出捆绑或等上游修复）
- **未测**：dsh-matlab-workbench（需 MATLAB 环境）
