# 09 — API 与工具契约

> 约束来源：`defineTool` 实际支持范围（`type` 仅 `string|number|integer|boolean|null|array|object|json|oneOf`；不支持 `min/max/pattern/anyOf/format`；`object` 必须显式 `additionalProperties`）。**所有数值范围/格式校验写在 `execute` 内并返回结构化错误**，不写进 schema（写了也不生效）。
> 命名：Agent 工具 `pm_<域>_<动作>`；Host 服务方法 camelCase；HTTP 路由 `/pm/<service>/<method>`。

---

## 1. 通用约定

### 1.1 错误形状（所有工具统一）

```ts
interface PmError { ok: false; error: {
  code: 'INVALID_ARGUMENT'|'NOT_FOUND'|'CONFLICT'|'PERMISSION_DENIED'
      | 'GATE_BLOCKED'|'RANGE_VIOLATION'|'DEPENDENCY_UNAVAILABLE'|'INTERNAL';
  message: string;          // 人话，可直接展示
  details?: Record<string, unknown>;
  hint?: string;            // 可操作建议（重试/换工具/补证据）
} }
```

### 1.2 成功形状

```ts
{ ok: true; data: T; meta?: { revision?: number; gate?: GateVerdict; warnings?: string[] } }
```

### 1.3 版本与兼容

- 工具名一旦发布不重命名；破坏性变更 → 新增 `_v2` 并保留旧版一个发布周期。
- 所有写操作接受可选 `expectedRevision`（乐观并发），不匹配返回 `CONFLICT`。

---

## 2. Agent 工具（Host，`defineTool`）

### 2.1 项目

```ts
pm_project_create
  parameters: { title:{type:'string',required:true}, question:{type:'string',required:true},
                domain:{type:'string',enum:['pva-optical-film','generic-polymer'],required:true},
                preset:{type:'string'} }
  returns: { projectId, title, presetDefault }

pm_project_status
  parameters: { projectId:{type:'string',required:true} }
  returns: { project, counts:{hypotheses,evidence,edges,cards}, openQuestions[], gateWarnings[] }

pm_project_link_workspace
  parameters: { projectId:{type:'string',required:true}, workspacePath:{type:'string',required:true} }
```

### 2.2 证据

```ts
pm_evidence_record
  parameters: {
    projectId:{type:'string',required:true},
    kind:{type:'string',enum:['experiment','cae','characterization','literature','simulation'],required:true},
    claimSupport:{type:'string',required:true},                 // 它支持/反驳什么
    polarity:{type:'string',enum:['supports','refutes','neutral'],required:true},
    strength:{type:'string',enum:['strong','moderate','weak'],required:true},
    sourceType:{type:'string',enum:['doi','dataset','file','run'],required:true},
    sourceRef:{type:'string',required:true},
    artifactPath:{type:'string'},                               // 可选：落盘产物
    payload:{type:'object',additionalProperties:true}            // 结构化数值
  }
  // execute 内校验：artifactPath 存在且计算 sha256；DOI 走 Crossref 解析；
  // 同一 sourceRef+hash 去重（返回已存在证据 id，不重复写）
  returns: { evidenceId, hash, deduped:boolean }

pm_evidence_query
  parameters: { projectId:{type:'string',required:true},
                polarity:{type:'string',enum:['supports','refutes','neutral']},
                kind:{type:'string'}, linkedTo:{type:'string'}, limit:{type:'integer'} }
  returns: { items: EvidenceSummary[], total:number }

pm_evidence_verify
  parameters: { projectId:{type:'string',required:true}, evidenceId:{type:'string'} }
  returns: { verified:boolean, brokenAt?:string, chainLength:number }
```

### 2.3 假设

```ts
pm_hypothesis_propose
  parameters: {
    projectId:{type:'string',required:true},
    statement:{type:'string',required:true},
    competitors:{type:'array',items:{type:'string'}},            // 竞争假设 id 或陈述
    mechanismEdgeIds:{type:'array',items:{type:'string'}},
    evidenceIds:{type:'array',items:{type:'string'}},
    testDesign:{type:'object',additionalProperties:false,properties:{
      design:{type:'string'},observable:{type:'string'},
      expectedIfTrue:{type:'string'},expectedIfFalse:{type:'string'}}}
  }
  returns: { hypothesisId, status:'proposed', gate:GateVerdict }

pm_hypothesis_transition
  parameters: { projectId:{type:'string',required:true}, hypothesisId:{type:'string',required:true},
                to:{type:'string',enum:['conditional','under_test','supported','refuted','archived'],required:true},
                rationale:{type:'string',required:true},
                evidenceIds:{type:'array',items:{type:'string'}} }
  // 服务端状态机 + 不变量校验：
  //  supported/refuted 需 ≥2 证据(≥1 strong) + 判别实验 + Gate 通过，否则 GATE_BLOCKED
  returns: { hypothesisId, from, to, gate }

pm_hypothesis_list
  parameters: { projectId:{type:'string',required:true}, status:{type:'string'} }
  returns: { items: HypothesisSummary[] }
```

### 2.4 机理图谱

```ts
pm_mechanism_query
  parameters: {
    projectId:{type:'string',required:true},
    anchors:{type:'array',items:{type:'string'},required:true},   // 节点名/符号/ID
    conditions:{type:'object',additionalProperties:true},        // {temperatureC,drawRatio,strainRate,...}
    hops:{type:'integer'}                                        // 默认 2；同时作为路径最大边数
  }
  returns: { nodes: MechanismNode[], edges: MechanismEdge[], paths: MechanismPath[],
             missingKnowledge: string[] }                         // ★paths 对 anchors 两两枚举

pm_mechanism_propose_edge
  parameters: {
    projectId:{type:'string',required:true},
    from:{type:'string',required:true}, to:{type:'string',required:true},
    relation:{type:'string',enum:['increases','decreases','determines','couples','competes','mediates'],required:true},
    equation:{type:'string'},
    conditions:{type:'object',additionalProperties:true},
    theorySource:{type:'object',additionalProperties:true},       // {doi,textbook,chapter}
    evidenceIds:{type:'array',items:{type:'string'}},
    applicability:{type:'string',enum:['candidate','established'],required:true}
  }
  // 'established' 需 theorySource + ≥1 strong supports 证据，否则降级 candidate 并 warn
  returns: { edgeId, applicability, gate }

pm_mechanism_path
  // 无独立工具：pm_mechanism_query 对 anchors 两两枚举有向路径（≤hops），
  // 结果按 confidence 乘积排序去重。
  parameters: { projectId:{type:'string',required:true}, anchors:{type:'array',items:{type:'string'}},
                hops:{type:'integer'} }
  returns: { paths:[{ nodes:string[], edges:string[], strength:number }] }
```

### 2.5 模型

```ts
pm_model_list
  parameters: { domain:{type:'string'} }
  returns: { items:[{ id,name,domain,status,validRange }] }

pm_model_describe
  parameters: { modelId:{type:'string',required:true} }
  returns: { spec: ModelSpec }                                  // 含方程 LaTeX、参数约束

pm_model_fit
  parameters: { projectId:{type:'string',required:true},
                dataPath:{type:'string',required:true},              // 工作区 CSV（time,signal）
                timeColumn:{type:'string'}, signalColumn:{type:'string'},
                model:{type:'string',enum:['maxwell','kww'],required:true} }
  // 服务端调用 science engine；结果归档并自动登记证据（record 默认 true）
  returns: { analysis:{params,fit:{rmse,r2},halfTime}, evidence, artifactPath }
```

### 2.6 知识（RSI）

```ts
pm_knowledge_query
  parameters: { question:{type:'string',required:true}, projectId:{type:'string'},
                scope:{type:'string',enum:['global','project','agent']}, limit:{type:'integer'} }
  returns: { cards:CardSummary[], edges:EdgeSummary[], missing:string[] }

pm_knowledge_propose
  parameters: {
    scope:{type:'string',enum:['global','project','agent'],required:true},
    kind:{type:'string',enum:['fact','method','pitfall','decision','edge-candidate'],required:true},
    title:{type:'string',required:true}, body:{type:'string',required:true},   // Markdown
    links:{type:'object',additionalProperties:true},                            // {nodeIds,edgeIds,evidenceIds}
    projectId:{type:'string'}
  }
  // 服务端写 origin{taskId,sessionId,agent}，状态 pending；重复标题+内容哈希去重
  returns: { cardId, status:'pending' }

pm_knowledge_review
  parameters: { cardId:{type:'string',required:true},
                decision:{type:'string',enum:['approve','reject','supersede'],required:true},
                rationale:{type:'string',required:true} }
  // 仅 polymer-reviewer preset 或人类 UI 可调用（工具级权限）
  returns: { cardId, status }
```

### 2.7 门控

```ts
pm_gate_check
  parameters: { kind:{type:'string',enum:['claim','edge','hypothesis','optics','model-use'],required:true},
                projectId:{type:'string',required:true},
                payload:{type:'object',additionalProperties:true} }
  returns: { verdict:'pass'|'warn'|'block', checks:[{rule:string,ok:boolean,detail:string}], requiredEvidence:string[] }
```

### 2.8 文献

```ts
pm_literature_read
  parameters: { path:{type:'string',required:true}, maxChars:{type:'integer'} }   // 工作区内 PDF/TXT/MD
  returns: { status, pages, title, author, chars, truncated, text }

pm_literature_extract
  parameters: { projectId:{type:'string',required:true},
                sourceType:{type:'string',enum:['doi','file'],required:true},
                sourceRef:{type:'string',required:true}, title:{type:'string',required:true},
                claims:{type:'array',items:{claim,polarity,strength}},required:true }
  // 每条 claim 登记一条证据；重复内容由账本哈希去重
  returns: { title, sourceRef, recorded:[{evidence,deduped}] }
```

### 2.8a 文献检索与下载（docs 11，G013）

```ts
pm_literature_search
  parameters: { query:{type:'string',required:true}, yearFrom:{type:'integer'},
                yearTo:{type:'integer'}, maxResults:{type:'integer',max:50},
                sources:{type:'array',items:{enum:['openalex','crossref']}},
                screen:{type:'boolean',default:true} }
  // OpenAlex 主源 + Crossref 辅源；每条候选附 screen rubric 评分并按总分排序
  returns: { ok, query, count, candidates:[{ doi,title,venue,year,authors,citedByCount,
             oaStatus,oaUrl,topics[],type,source,
             screen:{ total,grade:'core|important|reference',breakdown:{venue,topic,lexicon,quality,freshness,availability},reasons[] } }] }

pm_literature_screen
  parameters: { candidates:{type:'array',required:true,items:{doi,title,venue,year,citedByCount,oaStatus,oaUrl,topics,abstract}} }
  // 离线确定性 rubric（G013 内联表；G014 外提配置+校准）
  returns: { ok, count, candidates:[候选+screen] }   // 按 total 降序

pm_literature_download
  parameters: { doi:{type:'string',required:true}, targetPath:{type:'string'} }  // 默认 literature/，workspace 围栏
  // OA 链 arXiv→OpenAlex→Unpaywall→Crossref；出口主机白名单+DNS 全局校验；不绕过付费墙
  returns: { ok, status:'DOWNLOADED|OA_LINK_ONLY|CAMPUS_REQUIRED|MANUAL_REQUIRED', doi, file,
             landingUrl, attempts[], manifestEntry, manifestDeduped }
  // 每次调用（含失败态）追加 literature-manifest.jsonl；DOWNLOADED 按 doi 幂等去重
```

安全边界：egress 仅允许固定学术 API/出版商主机白名单；scheme http/https；每跳重定向全量重校验；
50MiB/8 跳/45s 上限；路径含 `..` 段直接拒绝，写盘前 realpath+commonpath 包含检查。

### 2.9 高分子仿真（真实引擎，docs 10）

Layer A 解析物性（常驻）——结果自动归档并登记证据（payload 标记 simulation=true）：

```ts
pm_sim_chain_mechanics
  parameters: { projectId, model:{enum:['fjc','wlc'],required}, contourNm:{required},
                temperatureK:{required}, segmentNm?, persistenceNm?,
                probeForcePn?, probeExtensionNm?, gridPoints?, …evidence/record }
  returns: { simulation:{status,model,curve|probe,definitions}, evidence?, artifactPath?, deduped? }

pm_sim_rubber_elasticity
  parameters: { projectId, mode:{enum:['uniaxial','biaxial'],required}, shearModulusMPa:{required},
                linksPerChain:{required}, stretchX?, stretchY?, maxStretch?, gridPoints?, … }
  returns: { simulation:{lambdaChain,beta,stressTrueMPa,workPerVolMPa,neoHookeanRefMPa,path}, … }

pm_sim_viscoelastic
  parameters: { projectId, part:{enum:['rouse','shift'],required},
                rouse:{beadsPerChain,kuhnLengthNm,frictionPerBead,chainNumberDensity,temperatureK} |
                shift:{shiftModel:{enum:['wlf','vft']},referenceTemperatureK,temperaturesK,c1?,c2K?,vftTinfK?}, … }
  returns: { simulation:{tau1S,tauModesS,G0Pa,modulus} | {shift:{temperatureK,log10aT,aT}}, … }

pm_sim_chain_stats
  parameters: { projectId, beadsPerChain:{required}, kuhnLengthNm:{required}, stretchX?, stretchY?, stretchZ?, … }
  returns: { simulation:{size:{radiusOfGyrationNm,…},orientation:{lambdaChain,meanCos2X,orientationF}}, … }

pm_sim_crystallization
  parameters: { projectId, dataPath:{required}, timeColumn?, crystallinityColumn?, … }
  returns: { simulation:{n,K,halfTimeS,fit:{rmse,r2}}, … }   // 对照 WAXS 结晶度时序

pm_sim_flory_huggins
  parameters: { projectId, n1/n2:{required}, chi | chiA+chiB+temperatureK, phi?, gridPoints?, … }
  returns: { simulation:{chi,spinodalChi,critical:{phiCritical,chiCritical},verdict}, … }

pm_sim_tg_blend
  parameters: { projectId, part:{enum:['fox-flory-fit','fox-flory-predict','gordon-taylor'],required},
                fit:{dataPath,massColumn?,tgColumn?} | predict:{tgInfinityK,constantK,predictMolarMass} |
                blend:{weight1,tg1K,weight2,tg2K,kConstant?}, … }
  returns: { simulation:{TgInfinityK,K,fit} | {TgK} | {TgBlendK,inputs}, … }

pm_sim_diffusion
  parameters: { projectId, part:{enum:['arrhenius','vrentas-duda'],required},
                arrhenius:{dataPath,temperatureColumn?,diffusivityColumn?} |
                vrentas-duda:{d0,activationJPerMol,omega1,v1Star,k11,k21K,tg1K,k12,k22K,tg2K,gamma?}, … }
  returns: { simulation:{D0,EaJPerMol,fit} | {D1,freeVolumeOverGamma}, … }
```
仿真纪律：预测 ≠ 实测；claimSupport 必须写明模型与参数；预测-实测一致性由 pm_gate_check 的 sim-vs-measurement 检查裁决。

pm_waxs_analyze / pm_ftir_analyze / pm_saxs_analyze / pm_hermans_analyze
  parameters: { projectId:{type:'string',required:true}, dataPath:{type:'string',required:true},
                xColumn/yColumn/…:{type:'string'}, record:{type:'boolean'},
                claimSupport/polarity/strength:{…} }
  returns: { analysis:{…}, evidence, artifactPath, deduped }   // 归档并自动登记证据
```

---

## 3. Host 服务（Client/UI 调用）

```ts
interface PmProjects  { create(i):Promise<Project>; list():Promise<Project[]>; get(id):Promise<Project|null>;
                        update(id, patch, rev?):Promise<Project>; archive(id):Promise<void>; linkWorkspace(id,path):Promise<void> }
interface PmEvidence  { record(i):Promise<{evidence,deduped}>; query(q):Promise<Page<Evidence>>;
                        get(id):Promise<Evidence|null>; verify(id):Promise<VerifyResult> }
interface PmHypotheses{ propose(i):Promise<Hypothesis>; transition(i):Promise<Hypothesis>;
                        list(projectId,f?):Promise<Hypothesis[]>; get(id):Promise<Hypothesis|null> }
interface PmMechanism { upsertNode(i); upsertEdge(i); neighbors(id,hops); pathSearch(i);
                        queryByCondition(i); attachEvidence(edgeId,evidenceId); get(id) }
interface PmModels    { list(f?); describe(id); validate(id); fit(i) }
interface PmKnowledge { propose(i); review(i); query(q); get(id); supersede(id,byId) }
interface PmGate      { evaluate(kind,payload):Promise<GateVerdict> }
interface PmScience   { caeRun(i); caeStudy(i); opticsAnalyze(i); characterization(kind,i) }
```

**事件**（UI 订阅）：

```ts
'pm/project/changed' | 'pm/evidence/added' | 'pm/hypothesis/changed'
'pm/mechanism/changed' | 'pm/knowledge/changed' | 'pm/job/progress'
```

## 4. HTTP 降级路由

| 方法 | 路径 | Body | 响应 |
| --- | --- | --- | --- |
| GET | `/pm/overview` | — | `{ok,data:{projects,totals,cae}}`（首页脉冲；只读聚合） |
| GET | `/pm/projects` | — | `{ok,data:Project[]}` |
| POST | `/pm/projects` | `{title,question,domain}` | `{ok,data:Project}` |
| GET | `/pm/projects/:id` | — | `{ok,data:Project}` |
| GET | `/pm/projects/:id/evidence?polarity=&kind=&limit=` | — | `{ok,data:Page}` |
| POST | `/pm/evidence` | `EvidenceInput` | `{ok,data:{evidence,deduped}}` |
| POST | `/pm/hypotheses` | `HypothesisInput` | `{ok,data}` |
| POST | `/pm/hypotheses/:id/transition` | `{to,rationale,evidenceIds,expectedRevision}` | `{ok,data}` |
| GET | `/pm/mechanism/:projectId/query?question=&conditions=` | — | `{ok,data}` |
| POST | `/pm/mechanism/edge` | `EdgeInput` | `{ok,data}` |
| POST | `/pm/knowledge` | `CardInput` | `{ok,data}` |
| POST | `/pm/knowledge/:id/review` | `{decision,rationale}` | `{ok,data}` |
| POST | `/pm/gate/check` | `{kind,projectId,payload}` | `{ok,data}` |
| POST | `/pm/science/cae/run` | `CaeRunInput` | `{ok,data}` |
| GET | `/pm/jobs/:jobId` | — | `{ok,data:{status,progress,result?}}` |
| GET | `/pm/events`（SSE） | — | `text/event-stream` |

**安全**：所有写路由校验来源（同源 + DSH 会话令牌）；路径参数 `projectId` 必须在白名单目录内解析，禁止 `..`；`artifactPath` 只接受项目根内路径。

## 5. MCP Server 声明（`cordis.patch.yml`）

```yaml
- insert:
  - id: pm-science-mcp
    name: '@deepseek-ai/dsh-mcp-client'
    config:
      serverName: pm_science
      transport: stdio
      command: '{{python}}'                 # 由桌面 primary-runtime 提供
      args: ['-I', '-m', 'pm_science.server']
      env: { PM_PROJECT_ROOT: '{{dshHome}}/pm' }
      toolCallTimeoutMs: 600000             # MD 长任务
      failOnStartupError: false              # 引擎缺失不阻断 Host
```

工具暴露为 `mcp__pm_science__<tool>`；`pm-research` 的 `pm_sim_*` 工具是**语义化包装**（固定参数、单位、错误归一），避免上层直接依赖 MCP 原始名。

## 6. 工具权限矩阵（服务端强制）

| 工具 \ Preset | scientist | physicist | characterization | modeler | literature | reviewer |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| pm_project_create | ✓ | — | — | — | — | — |
| pm_evidence_record | — | — | ✓ | ✓ | ✓ | — |
| pm_evidence_query/verify | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| pm_hypothesis_propose | ✓ | ✓ | — | ✓ | — | — |
| pm_hypothesis_transition | ✓ | — | — | — | — | — |
| pm_mechanism_query | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| pm_mechanism_propose_edge | ✓ | ✓ | — | — | — | — |
| pm_mechanism_import_seed | ✓ | — | — | — | — | — |
| pm_waxs_analyze | ✓ | — | ✓ | — | — | — |
| pm_ftir_analyze | ✓ | — | ✓ | — | — | — |
| pm_saxs_analyze | ✓ | — | ✓ | — | — | — |
| pm_hermans_analyze | ✓ | ✓ | ✓ | — | — | — |
| pm_model_fit | ✓ | ✓ | — | ✓ | — | — |
| pm_sim_chain_mechanics / viscoelastic / chain_stats | ✓ | ✓ | — | ✓ | — | — |
| pm_sim_rubber_elasticity / flory_huggins / tg_blend / diffusion | ✓ | ✓ | — | ✓ | — | — |
| pm_sim_crystallization | ✓ | — | ✓ | ✓ | — | — |
| pm_sim_md_run | ✓ | ✓ | — | ✓ | — | — |
| pm_literature_read | ✓ | — | — | — | ✓ | — |
| pm_literature_extract | ✓ | — | — | — | ✓ | — |
| pm_literature_search / screen / download | ✓ | — | — | — | ✓ | — |
| pm_knowledge_propose | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| pm_knowledge_review | — | — | — | — | — | ✓ |
| pm_gate_check | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

实现方式：工具全局注册，`authorize()` 从 **Agent 的实时 preset 绑定**（`agentPresets.composedPreset`，回退 session header）解析身份并查上表；模型传入的 `preset` 参数只能作为无 Agent 上下文时的兜底，不能覆盖真实身份。

## 7. 契约测试要求

每个工具至少 3 个用例（`plugins/pm-research/tests/tools/`）：

1. **正常路径**：合法输入 → 期望输出形状。
2. **非法输入**：越界/缺字段/错枚举 → `INVALID_ARGUMENT` + `hint`。
3. **权限拒绝**：以错误 preset 上下文调用 → `PERMISSION_DENIED`。

不变量测试（`packages/pm-core/tests/`）：证据哈希不可改、假设状态机非法迁移被拒、`established` 边缺证据被降级、知识卡批准必须带 reviewer。
