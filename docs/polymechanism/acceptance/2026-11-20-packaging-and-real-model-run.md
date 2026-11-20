# 验收记录:文献插件打包化 + USTC deepseek-flash-2 真实模型作业(2026-11-20)

## 一、打包化(插件成为项目整体的一部分)

**结论:可以,已落地。** 机制(跟随 dsh-market/@agents-anywhere 先例):

1. `dsh-kb-rag@1.6.8` + `dsh-zotero-skill@0.5.5` 作为 **dsh-plugin-desktop 生产依赖**(MIT,electron-builder TRAVERSAL collector 自动收进 `resources/app/node_modules`——`verify-licenses` 630 包检查通过,THIRD_PARTY_NOTICES 已再生)。
2. `syncDesktopManagedProfileBundles`(src/profile.ts)扩展:每次 desktop profile 启动把两个 bundle 注入活跃 profile 的 bundles 列表(缺则补,幂等),**不写入 desktop cordis.patch.yml**——desktop patch 行会与用户 profile 侧副本产生 duplicate loader entry id(实测硬错误);profile 侧更高版本仍可通过 `dsh plugin add` 反超(overlay semver 规则)。
3. 解析:安装锚点(打包后 `resources\app\package.json`)优先——**新机器零 pnpm 安装即可用**。

验收:`tests/shipped-plugin-bundles.spec.ts` 4/4;`verify:literature` EXIT=0;`verify:profile` EXIT=0;desktop 全量套件 **31 failed/1833 passed = 上游基线持平**(期间修复了 sync 注入导致的 profile-context 断言过期,该测试现在如实断言注入后的组合);`verify-licenses` EXIT=0。

## 二、真实模型作业(USTC deepseek-flash-2)

**配置**:用户已在 desktop/lit profile 配置 USTC 网关(`https://api.llm.ustc.edu.cn/v1`,OpenAI completions,`USTC_API_KEY` 存于 `~/.dsh/.credentials.yaml`);lit profile 为隔离测试组合(headless bundle + kb-rag + pm-research 文件 URL + 六专家中 scientist/literature 两席 + ustc/deepseek-flash-2/max)。

**驱动方式**:`dsh --profile lit "<task>"`(vendored rc.3 launcher,headless 单轮任务,`--json` 可出 NDJSON 事件)。

### 作业 1(完整 7 步闭环,deepseek-flash-2,max reasoning)

模型自主完成:检索(5 条候选,rubric 判级 core/important×4,分项理由透明)→ arXiv DOI **DOWNLOADED**(2.2MB,manifest 记账)→ 付费墙 DOI **MANUAL_REQUIRED**(未绕过、未重试)→ pm_project_create(PR-1-e7e9)→ 精读 PDF(15 页/39,614 字符)→ 2 条 claims 入证据账本(EV-1-ae8f/EV-2-fc56,query 复核一致)→ kb_ingest(45 块/36 向量)→ kb_search 命中 Top-1(80ms)→ 产出 `pva-lit-e2e-report.md` + 逐步原始 JSON。

模型自查亮点(原样保留):
- 诚实标注"pm 工具未注册,改用同源实现"(见下·缺陷①,已修复);
- 指出 rubric 噪声:#2(无机硫属化合物)/#4(PP/PB)词面命中判 important——**两级筛选的 Agent 终审正是为此设计**,校准线索已记入;
- 科学结论边界:"项目账本只有 2 条 NLP 证据,不能回答 PVA 机理问题"——不编造。

### 作业 2(缺陷修复后的原生工具验证)

pm-research 修复(`inject=['webServer']`→可选,headless 无 HTTP 面时路由跳过、工具照常注册)后:模型**原生调用 `pm_literature_screen`** 返回 grade=core/total=98;随后原生检索 PVA 正交双轴拉伸文献并尝试下载真 PVA 论文(10.1295/koron.45.609, J-STAGE)。

## 三、发现并修复的缺陷

| # | 缺陷 | 修复 |
| --- | --- | --- |
| 1 | pm-research `inject=['webServer']` → headless/CLI 组合(无 HTTP 面)插件整体不激活,pm_* 工具全部缺席 | webServer 改为可选注入;路由条件注册;工具面在任何 harness 激活(pm-research 46/46 测试) |
| 2 | desktop patch 直接插 kb-rag 行与用户 profile 副本 duplicate id 硬错误 | 改为 syncDesktopManagedProfileBundles 注入(market 同款模式) |
| 3 | verify-profile-boot.mjs 两处 PR#11 遗留过期断言(pm_cae_coupon/cae.configured) | 断言更新至 pm_sim + literature + sim 形状(PR#15 已修,本次复验) |

## 四、边界(如实)

- **付费墙直连**:本机当前非校园网出口,Elsevier 付费墙 DOI 返回 MANUAL_REQUIRED(设计行为);Springer/ACS 等出版商直连需校园网环境实测(CAMPUS_REQUIRED/DOWNLOADED 语义已支持)。
- **lit profile 是测试组合**(用户 profile 外的隔离环境);桌面 UI 的 desktop profile 默认模型已是 ustc/deepseek-flash-2,直接可用。
- 校准锚集仍为小样本;#2/#4 类噪声待 Agent 终审+后续权重校准。
