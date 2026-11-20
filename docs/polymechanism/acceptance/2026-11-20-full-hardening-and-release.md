# 验收记录:全功能收尾与 2.1.0 发布(2026-11-20)

## 一、架构审计结论(代码级)

| 维度 | 审计发现 | 修复 |
| --- | --- | --- |
| 后端业务 | 分层方向正确(domain→core→research),科学层真跑物理;但工具层泄漏业务规则、错误信封 5 种风格、门控不闭环、并发只有 evidence 有队列 | 本次修门控/链/并发/边证据(见下);错误信封统一留作后续 |
| 前后端通讯 | 只有 2 条路由且前端只用 1 条;无事件/刷新;契约手写两份漂移;overview N+1 | 新增 /pm/projects + /pm/projects/:id/state;工作台完整消费;N+1 留作后续 |
| CAE/仿真 | Layer A 解析引擎真实(selftest 20 项真值回收);MD 层真实但本机无 LAMMPS;sim 工具 8 处类型错误含运行时崩溃 | 全部修复;`temperature_k→temperatureK` 修正;CSV 列名映射生效 |
| 文献检索 | 核心链路真实(OpenAlex/Crossref/下载链/SSRF 出口白名单);无 Python 网络测试 | 新增打包载荷测试;真实模型作业验证 |
| 存储查看 | 后端存储真实(JSONL/JSON),前端只能看计数 | 工作台证据表/机理图/知识卡/链校验徽标 |
| 机理分析 | 图谱查询/路径/状态机真实;门控是"提示器"、seed 伪造强证据、边丢证据 ID | 门控闭环、seed 基线语义、evidenceIds 持久化 |

**评分(修复后)**:后端 8/10(仍缺统一错误模型、路由覆盖、revision)、前后端通讯 7/10(仍无 SSE/事件)。

## 二、本次修复清单(5 个提交)

| 提交 | 内容 |
| --- | --- |
| `04ae0da2` | sim 工具 8 类型错误清零;`temperatureK` 键修正;CSV 列映射;`md_run` 入联合类型;**发行包携带 science/pylibs + skills/knowledge/config**(随包 CPython,venv 不可重定位) |
| `a29a1046` | 门控:无证据 claim→block、零竞争假设→block、无单位方程→warn、DOI 三态;账本 prevHash 真链(删行可发现);seed 不伪造强证据;边 evidenceIds 持久化;hypothesis/knowledge 写队列 + 知识卡 ID scope 前缀 + review 状态机 + supersede |
| `b579bca3` | 研究工作台:项目/状态只读路由 + 六标签页面板(概览/证据/假设/机理/知识/工具)+ 一键文献作业提示注入 + 空错载态 |
| `6eb7211f` | 新图标:高分子链 + 双折射分光标记(链与光学意象);全平台资产重生成(1024 PNG/ICO 16 精确帧/ICNS/icons hicolor) |
| `89d9c1a3` | 版本 2.1.0 + 三平台发布工作流(tag v* → win/linux/mac 构建并发布 Release) |
| `248eaf65` | **修复两个长期基线失败**(open 补丁断言陈旧、pi-ai 双版本断言)→ package.spec 49/49,打包前置门首次全绿 |

## 三、Zotero 实测(本机 Zotero 9.0.5)

| 能力 | 结果 |
| --- | --- |
| 本地 API | ✅ 运行中,api v3,schema 42(读 200) |
| 库检索/清单/分类/标签 | ✅ inventory/search/collections 实测返回真实条目 |
| 题录写入 | ✅ `import-bibtex` 201(实测新增 PVA 1988 论文,key GH73HGVI,检索回环确认) |
| 分类归集/REST 写 | ⚠️ 需 Zotero 9 弹窗「始终允许」一次;我无法代点 GUI。Skill 的 authorize 会等待该弹窗 |
| Zotero→知识库迁移 | ✅ 实测 1 篇 PDF added(96 块/80 向量);运行中 Zotero 会锁 sqlite,需用 DB 副本或退出 Zotero |
| 中文文献/知网/引文追踪 | 工具在位(skill 命令),未逐项实测 |

**结论**:Zotero 集成"能用"——读全通、题录写入通、分类写入差一次人工授权点击。

## 四、知识库实测

- kb_ingest:2 篇 PDF → 69 chunks/64 vectors;检索命中 Ursu2015 双折射段(页 2-4)
- kb_zotero:1 篇 → 96 块/80 向量
- kb_fetch:arXiv 下载成功 + manifest;付费墙 DOI 如实 MANUAL_REQUIRED
- 模型作业:kb 45 块/36 向量 + kb_search 命中 Top-1(80ms)

## 五、门与基线

| 门 | 结果 |
| --- | --- |
| pm-research | 47/47;tsc 0 错 |
| pm-core | 31/31(+6 integrity) |
| pm-domain | 通过 |
| desktop 全量 | 31 failed/1833 passed,逐文件分布与基线一致(15 module-resolution/5 verify-linux/3 desktop-runtime-env/2 compatibility-shell/1×4),**无新增** |
| package.spec | **49/49(基线 2 失败已修)** |
| check:win-package:platform | **312 passed/1 skipped EXIT=0**(此前被基线失败阻断) |
| verify:profile / verify:literature | EXIT=0 / EXIT=0(新增 /pm/projects 断言) |
| client tsc / native-ui tsc | 0 错(后者修掉长期遗留错误) |

## 六、打包

- Windows:本地 `dist:win` 产出未签名 NSIS 安装包(见 dist/)
- macOS/Linux:`.github/workflows/release.yml` 在对应 runner 构建(未签名;签名证书留在维护者机器)
- `science/pylibs` 每平台随构建生成(平台二进制不可跨平台);build 脚本自动准备

## 七、如实边界

1. **Zotero 分类写入**需用户点一次授权弹窗;REST 写入在 Zotero 9 + 未授权时的 404 已澄清为端点存在(400 无载荷)。
2. **付费墙直连**需校园网出口;本机为 MANUAL_REQUIRED(设计行为)。
3. **macOS/Linux 安装包**由 CI 产出,本机无法交叉编译;工作流已提交,需推送 tag 触发。
4. **DOC 与契约**:docs 09 仍描述 14 条路由/SSE,实际 4 条;本次未改文档口径,避免"文档先行"的旧问题。
5. **前后端契约**仍为两份手写类型(未抽共享包);工作台类型与后端字段一致,但无编译期约束。
