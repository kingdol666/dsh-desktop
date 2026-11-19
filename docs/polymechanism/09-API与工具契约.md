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
    question:{type:'string',required:true},
    anchors:{type:'array',items:{type:'string'}},                // 节点名/符号
    conditions:{type:'object',additionalProperties:true},        // {temperature,drawRatio,strainRate,...}
    hops:{type:'integer'},                                       // 默认 2
    limit:{type:'integer'}
  }
  returns: { paths: MechanismPath[], edges: EdgeSummary[], cards: CardSummary[],
             missingKnowledge: string[] }                         // ★必须返回

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
  parameters: { projectId:{type:'string',required:true}, from:{type:'string',required:true},
                to:{type:'string',required:true}, maxHops:{type:'integer'} }
  returns: { paths:[{ nodes:string[], edges:string[], strength:number, conditionsOk:boolean }] }
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
  parameters: { modelId:{type:'string',required:true}, datasetRef:{type:'string',required:true},
                initialParams:{type:'object',additionalProperties:true} }
  // 转 pmScience 执行；参数越界 → warnings + confidence 降级
  returns: { params:Record<string,number>, rmse:number, r2:number, warnings:string[], evidenceId? }
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

### 2.8 文献（适配层，薄包装第三方）

```ts
pm_literature_extract
  parameters: { doi:{type:'string'}, filePath:{type:'string'}, projectId:{type:'string',required:true} }
  // 调 kb_rag/zotero 取全文 → 抽取 {材料,工艺,结构量,性能,极性} → 建议 Evidence
  returns: { candidates:[{ claimSupport, polarity, strength, values:Record<string,unknown> }],
             suggestedEvidence:[...], fullTextRef?:string }
```

### 2.9 科学计算（转 MCP）

```ts
pm_cae_run
  parameters: { projectId:{type:'string',required:true},
                material:{type:'object',additionalProperties:true,required:true},
                machine:{type:'object',additionalProperties:true,required:true},
                process:{type:'object',additionalProperties:true,required:true},
                mesh:{type:'string'}, background:{type:'boolean'} }
  returns: { runId, jobId?, status, metrics:{deltaN?:number,retardation?:number,E?:number,shrinkage?:number},
             artifacts:[{path,sha256}], provenance:{verified:boolean} }

pm_cae_study
  parameters: { projectId:{type:'string',required:true},
                mode:{type:'string',enum:['machine-refine','optimize'],required:true},
                variable:{type:'string'}, min:{type:'number'}, max:{type:'number'},
                samples:{type:'integer'}, mesh:{type:'string'}, goal:{type:'number'} }
  returns: { studyId, samples:[...], best:{...}, constraints:{satisfied:boolean} }

pm_optics_analyze
  parameters: { projectId:{type:'string',required:true}, runId:{type:'string'}, orientationField:{type:'object',additionalProperties:true} }
  returns: { deltaN:number, retardation:number, dispersion:Record<string,number>, warnings:string[] }

pm_waxs_crystallinity / pm_ftir_peak_fit / pm_saxs_reduce / pm_hermans_factor / pm_fit_relaxation
  parameters: { datasetRef:{type:'string',required:true}, options:{type:'object',additionalProperties:true} }
  returns: { values:Record<string,number>, quality:{r2?:number,rmse?:number,warnings:string[]}, plotSpec?:object }
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
      env: { PM_PROJECT_ROOT: '{{dshHome}}/pm', PM_CAE_ROOT: '<cae repo>' }
      toolCallTimeoutMs: 600000             # CAE 长任务
      failOnStartupError: false              # 引擎缺失不阻断 Host
```

工具暴露为 `mcp__pm_science__<tool>`；`pm-research` 的 `pm_cae_*` 工具是**语义化包装**（固定参数、单位、错误归一），避免上层直接依赖 MCP 原始名。

## 6. 工具权限矩阵（服务端强制）

| 工具 \ Preset | scientist | physicist | characterization | modeler | literature | reviewer |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| pm_project_* | ✓ | — | — | — | — | — |
| pm_evidence_record | — | — | ✓ | ✓ | ✓ | — |
| pm_evidence_query/verify | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| pm_hypothesis_propose | ✓ | ✓ | — | ✓ | — | — |
| pm_hypothesis_transition | ✓ | — | — | — | — | — |
| pm_mechanism_query | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| pm_mechanism_propose_edge | — | ✓ | — | — | — | — |
| pm_model_* | ✓(list/describe) | ✓(list/describe) | — | ✓(全) | — | — |
| pm_knowledge_propose | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| pm_knowledge_review | — | — | — | — | — | ✓ |
| pm_gate_check | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| pm_cae_* / pm_optics_* | — | — | ✓(optics) | ✓(全) | — | — |
| pm_waxs/ftir/saxs | — | — | ✓ | — | — | — |
| pm_literature_extract | — | — | — | — | ✓ | — |
| pm_objection_record | — | — | — | — | — | ✓ |

实现方式：每个 role 一个 `tools/<role>.ts`，只 `register` 白名单内的工具；**未挂载即不可见**（模型无法调用）。

## 7. 契约测试要求

每个工具至少 3 个用例（`plugins/pm-research/tests/tools/`）：

1. **正常路径**：合法输入 → 期望输出形状。
2. **非法输入**：越界/缺字段/错枚举 → `INVALID_ARGUMENT` + `hint`。
3. **权限拒绝**：以错误 preset 上下文调用 → `PERMISSION_DENIED`。

不变量测试（`packages/pm-core/tests/`）：证据哈希不可改、假设状态机非法迁移被拒、`established` 边缺证据被降级、知识卡批准必须带 reviewer。
