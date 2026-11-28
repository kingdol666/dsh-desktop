/** Paired zh/en copy and existing draft prompts for the Stable research desk. */

const ZH = Object.freeze({
  title: '研究工作台', launcherHint: '证据链 · 假设 · 机理图谱 · 知识卡', projectSelect: '选择项目', noProjects: '暂无项目',
  noProjectsHint: '在会话中请科研总控使用 pm_project_create 创建项目，或先准备一次文献作业。',
  refresh: '刷新', close: '关闭', sections: '工作台分区', loading: '正在读取项目状态…', retry: '重试',
  loadError: '无法读取研究记录。请重试；若问题持续，请确认研究服务已启用。',
  tabs: Object.freeze({ overview: '概览', evidence: '数据与证据', hypotheses: '假设', mechanism: '机理', knowledge: '知识', tools: '工具' }),
  project: '研究项目', projectId: '项目 ID', domain: '研究领域', status: '项目状态', created: '创建日期', noQuestion: '未填写研究问题。',
  workflow: '研究流程', workflowHint: '从登记记录到假设与机理', inspector: '项目检查器', next: '下一步',
  evidenceCount: '证据记录', hypothesisCount: '假设', openHypotheses: '未决假设', mechanismCount: '机理边', nodeCount: '机理节点',
  sharedKnowledge: '共享知识库', sharedKnowledgeHint: '这些知识卡不按当前项目筛选。',
  ledgerVerified: '证据链校验通过', ledgerBroken: '证据链校验失败 · 请勿引用', ledgerRows: '链上记录', brokenAt: '断点', unknownRecord: '未知记录',
  gateNote: '证据链校验不代表通过科学门控。', draftHint: '以下操作只填入草稿，不会发送。',
  literature: '让文献专家开始检索', checkGaps: '检查证据缺口', openConversation: '返回研究对话',
  unavailable: '输入框尚未就绪。请在会话输入框中重试。', staged: '已填入会话草稿，发送前可继续编辑。',
  dataHeading: '证据记录', dataHint: '仅显示服务端已登记的记录，选择一项查看完整来源与观测字段。',
  evidenceDetail: '证据与来源', selectEvidence: '没有可供检查的证据记录。',
  noEvidence: '尚无证据记录。登记证据后，来源与观测字段会显示在这里。',
  entryId: '证据 ID', claim: '证据陈述', polarity: '方向', strength: '强度',
  source: '来源', recordTime: '登记时间', observation: '观测 ID', hash: '记录哈希', payload: '已登记观测字段',
  openDoi: '打开 DOI 来源', sourceReferenceOnly: '仅显示来源引用；此视图不读取原始文件。',
  missingEvidence: '关联证据不在当前账本中。', boundEvidence: '关联证据',
  polarities: Object.freeze({ supports: '支持', refutes: '反驳', neutral: '中性' }),
  strengths: Object.freeze({ strong: '强', moderate: '中', weak: '弱' }),
  sourceTypes: Object.freeze({ doi: 'DOI', file: '文件', dataset: '数据集', run: '运行记录' }),
  projectStatuses: Object.freeze({ active: '进行中', paused: '已暂停', archived: '已归档' }),
  hypothesisStatuses: Object.freeze({ proposed: '已提出', conditional: '有条件', under_test: '验证中', supported: '已支持', refuted: '已反驳', archived: '已归档' }),
  edgeStatuses: Object.freeze({ established: '已确立', candidate: '候选', disputed: '有争议', refuted: '已反驳' }),
  cardStatuses: Object.freeze({ pending: '待审', approved: '已批准', rejected: '已否决', superseded: '已被替代' }),
  noHypotheses: '尚无假设。', competitors: '竞争假设', noCompetitors: '尚未声明竞争假设。', transitions: '状态轨迹',
  noNodes: '尚无机理节点。', noEdges: '尚无机理边。', noCards: '尚无知识卡。',
  toolsHeading: '已接入的科研能力', toolGroups: ['文献', '表征', '仿真', '机理', '知识'] as const,
  literaturePrompt: [
    '请作为文献专家完成一次文献作业：',
    '1) 用 pm_literature_search 检索我的课题关键词（高分子、双轴拉伸、取向、双折射、WAXS/FTIR/SAXS 任一相关方向）；',
    '2) 对 core/important 候选读摘要做终审（accept / review / reject + 理由）；',
    '3) 用 pm_literature_download 下载选中的 PDF（机构网络内合法访问），失败的给出 DOI 直链；',
    '4) 精读后用 pm_literature_extract 把测量类结论登记为证据（区分“论文测量的”与“论文解释的”）；',
    '5) 汇总成一张证据表并说明缺口。',
  ].join('\n'),
  gapPrompt: '检查当前项目的证据链与科学门控，列出缺口并给出补证计划。',
} satisfies Record<string, unknown>)

type Localized<T> = T extends string ? string : { readonly [K in keyof T]: Localized<T[K]> }

/** Complete, statically paired workbench copy. */
export type PmWorkbenchCopy = Localized<typeof ZH>

const EN: PmWorkbenchCopy = Object.freeze({
  title: 'Research workbench', launcherHint: 'Ledger · Hypotheses · Mechanisms · Knowledge cards', projectSelect: 'Select project', noProjects: 'No projects yet',
  noProjectsHint: 'Ask the research agent in conversation to create a project with pm_project_create, or start by preparing a literature search.',
  refresh: 'Refresh', close: 'Close', sections: 'Workbench sections', loading: 'Loading project state…', retry: 'Retry',
  loadError: 'Could not read the research records. Retry, or check that the research service is enabled.',
  tabs: { overview: 'Overview', evidence: 'Data & evidence', hypotheses: 'Hypotheses', mechanism: 'Mechanisms', knowledge: 'Knowledge', tools: 'Tools' },
  project: 'Research project', projectId: 'Project ID', domain: 'Research domain', status: 'Project status', created: 'Created', noQuestion: 'No research question recorded.',
  workflow: 'Research workflow', workflowHint: 'From recorded evidence to hypotheses and mechanisms', inspector: 'Project inspector', next: 'Next steps',
  evidenceCount: 'Evidence records', hypothesisCount: 'Hypotheses', openHypotheses: 'Unresolved hypotheses', mechanismCount: 'Mechanism edges', nodeCount: 'Mechanism nodes',
  sharedKnowledge: 'Shared knowledge library', sharedKnowledgeHint: 'These knowledge cards are not filtered by the selected project.',
  ledgerVerified: 'Ledger verified', ledgerBroken: 'Ledger verification failed — do not cite', ledgerRows: 'Records in chain', brokenAt: 'Break at', unknownRecord: 'Unknown record',
  gateNote: 'Ledger integrity does not certify scientific gate clearance.', draftHint: 'These actions fill a draft without sending it.',
  literature: 'Start a literature search', checkGaps: 'Check evidence gaps', openConversation: 'Return to conversation',
  unavailable: 'Composer is not ready. Try again from the conversation input.', staged: 'Draft prepared. You can edit it before sending.',
  dataHeading: 'Evidence records', dataHint: 'Only recorded entries are shown. Select one to inspect its full provenance and observation fields.',
  evidenceDetail: 'Evidence & provenance', selectEvidence: 'No evidence record to inspect.',
  noEvidence: 'No evidence recorded. Provenance and observation fields appear here after evidence is recorded.',
  entryId: 'Evidence ID', claim: 'Evidence statement', polarity: 'Polarity', strength: 'Strength',
  source: 'Source', recordTime: 'Recorded', observation: 'Observation ID', hash: 'Record hash', payload: 'Recorded observation fields',
  openDoi: 'Open DOI source', sourceReferenceOnly: 'Source reference only; this view does not open raw files.',
  missingEvidence: 'Linked evidence is not in this ledger.', boundEvidence: 'Linked evidence',
  polarities: { supports: 'Supports', refutes: 'Refutes', neutral: 'Neutral' },
  strengths: { strong: 'Strong', moderate: 'Moderate', weak: 'Weak' },
  sourceTypes: { doi: 'DOI', file: 'File', dataset: 'Dataset', run: 'Run' },
  projectStatuses: { active: 'Active', paused: 'Paused', archived: 'Archived' },
  hypothesisStatuses: { proposed: 'Proposed', conditional: 'Conditional', under_test: 'Under test', supported: 'Supported', refuted: 'Refuted', archived: 'Archived' },
  edgeStatuses: { established: 'Established', candidate: 'Candidate', disputed: 'Disputed', refuted: 'Refuted' },
  cardStatuses: { pending: 'Pending review', approved: 'Approved', rejected: 'Rejected', superseded: 'Superseded' },
  noHypotheses: 'No hypotheses recorded.', competitors: 'Competing hypotheses', noCompetitors: 'No competing hypotheses declared.', transitions: 'Status history',
  noNodes: 'No mechanism nodes recorded.', noEdges: 'No mechanism edges recorded.', noCards: 'No knowledge cards recorded.',
  toolsHeading: 'Available research capabilities', toolGroups: ['Literature', 'Characterization', 'Simulation', 'Mechanisms', 'Knowledge'] as const,
  literaturePrompt: [
    'As the literature expert, complete a literature review:',
    '1) Use pm_literature_search to search project keywords (polymer, biaxial stretching, orientation, birefringence, or WAXS/FTIR/SAXS).',
    '2) Review the abstracts of core/important candidates and mark accept, review, or reject with a rationale.',
    '3) Use pm_literature_download to obtain selected PDFs where institutionally authorized; provide direct DOI links when downloads fail.',
    '4) After close reading, use pm_literature_extract to record measured findings as evidence, distinguishing measurements from the authors’ interpretations.',
    '5) Summarize the evidence in a table and identify gaps.',
  ].join('\n'),
  gapPrompt: 'Check the current project’s evidence chain and scientific gates, then list the gaps and propose a plan to address them.',
})

/** Select the workbench copy for an active locale.
 * @param locale - Locale ID supplied by the desktop client.
 */
export function pmWorkbenchCopy(locale: string): PmWorkbenchCopy {
  return locale.toLowerCase().startsWith('zh') ? ZH : EN
}
