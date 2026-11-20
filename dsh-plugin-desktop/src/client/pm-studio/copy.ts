/**
 * Bilingual copy for the Desktop-owned Studio surfaces.
 *
 * The host's conversation namespace cannot carry product strings, so the
 * studio registers its own dictionary and binds it through `ctx.locale`. Every
 * user-visible string on the brand and blank-home console lives here; the
 * components never inline copy.
 */

import { useSyncExternalStore } from 'react'

/** Minimal locale face injected into studio components (stable functions). */
export interface PmLocaleFace {
  readonly getSnapshot: () => string
  readonly subscribe: (listener: () => void) => () => void
}

/** One expert station's copy. */
export interface PmExpertCopy {
  readonly label: string
  readonly hint: string
}

/** One quick-start action's copy. */
export interface PmQuickCopy {
  readonly id: string
  readonly title: string
  readonly hint: string
  readonly prompt: string
}

/** Complete Studio copy set for one language. */
export interface PmStudioCopy {
  readonly brandTag: string
  readonly consoleLabel: string
  readonly kicker: string
  readonly protocol: string
  readonly headlineLead: string
  readonly headlineAccent: string
  readonly headlineTail: string
  readonly subLead: string
  readonly subMid: string
  readonly subTail: string
  readonly stationLabel: string
  readonly experts: Readonly<Record<string, PmExpertCopy>>
  readonly ready: string
  readonly switching: string
  readonly quick: readonly PmQuickCopy[]
  readonly pulseLabel: string
  readonly pulseLoading: string
  readonly pulseEmpty: string
  readonly pulseUnavailable: string
  readonly evidenceUnit: string
  readonly hypothesisUnit: string
  readonly knowledgeUnit: string
  readonly projectUnit: string
  readonly simReady: string
  readonly simReadyMd: string
  readonly simDegraded: string
  readonly seatUnavailable: string
  readonly fillFailed: string
  readonly switched: (name: string) => string
  readonly filled: string
}

/** Simplified Chinese product copy (source key set). */
export const PM_STUDIO_ZH: PmStudioCopy = Object.freeze({
  brandTag: 'STUDIO',
  consoleLabel: '科研控制台',
  kicker: 'PolyMechanism · 科研工作台',
  protocol: 'PVA–OPTICAL / 01',
  headlineLead: '从分子链，到',
  headlineAccent: '可验证的机理',
  headlineTail: '。',
  subLead: '提出假设',
  subMid: '设计判别实验',
  subTail: '让每一条结论都落在证据上',
  stationLabel: 'EXPERT STATION',
  experts: Object.freeze({
    'polymer-scientist': Object.freeze({ label: '科学家', hint: '课题拆解与证据化结论' }),
    'polymer-physicist': Object.freeze({ label: '物理', hint: '机理、模型与适用窗口' }),
    'polymer-characterization': Object.freeze({ label: '表征', hint: 'WAXS / FTIR / SAXS 与拟合' }),
    'polymer-modeler': Object.freeze({ label: '建模', hint: 'CAE 求解与参数扫描' }),
    'polymer-literature': Object.freeze({ label: '文献', hint: '结论抽取与 DOI 证据' }),
    'polymer-reviewer': Object.freeze({ label: '评审', hint: '独立复核与知识卡门控' }),
  }),
  ready: '6 位专家已就绪',
  switching: '正在切换专家…',
  quick: Object.freeze([
    Object.freeze({
      id: 'design',
      title: '设计判别实验',
      hint: '竞争假设 → 观测量 → 最小工作量',
      prompt: '设计一组能判别「取向诱导结晶」与「拉伸诱导链伸展」的判别实验：给出观测量与单位、两种假设下的预期信号差异、所需样品与最小工作量，并说明结果将以何形式登记为可引用证据（数值、条件、来源哈希）。',
    }),
    Object.freeze({
      id: 'analyze',
      title: '分析表征数据',
      hint: 'WAXS · FTIR · SAXS · 登记证据',
      prompt: '分析这批 WAXS / FTIR 表征数据：提取结晶度、峰位与氢键指数，标注拟合残差与适用条件，把每个结论连同观测名称、单位与来源登记为可引用证据。',
    }),
    Object.freeze({
      id: 'review',
      title: '评审机理图谱',
      hint: '条件窗口 · 证据强度 · 晋升门控',
      prompt: '评审当前机理图谱中的候选边：逐条检查适用条件、理论依据与证据强度，给出每条边的证据 ID 或明确标注缺失，并指出哪些边可以晋升、哪些需要补实验。',
    }),
  ]),
  pulseLabel: 'PROJECT PULSE',
  pulseLoading: '研究脉冲加载中…',
  pulseEmpty: '尚无研究项目 · 从一次课题拆解开始',
  pulseUnavailable: '研究脉冲不可用 · 检查 Host 的 /pm/overview',
  evidenceUnit: '条证据',
  hypothesisUnit: '个假设',
  knowledgeUnit: '张待审知识卡',
  projectUnit: '个项目',
  simReady: '仿真引擎就绪',
  simReadyMd: '仿真引擎就绪 · MD 可用',
  simDegraded: '仿真引擎降级 · 解析层不可用',
  seatUnavailable: '专家席位暂不可用',
  fillFailed: '未能写入输入框 · 请直接粘贴任务描述',
  switched: (name: string) => `已切换专家：${name}`,
  filled: '已填入输入框，可继续修改',
})

/** English copy, checked complete against the zh key set. */
export const PM_STUDIO_EN: PmStudioCopy = Object.freeze({
  brandTag: 'STUDIO',
  consoleLabel: 'Research console',
  kicker: 'PolyMechanism · Research Workbench',
  protocol: 'PVA–OPTICAL / 01',
  headlineLead: 'From molecular chains to ',
  headlineAccent: 'verifiable mechanisms',
  headlineTail: '.',
  subLead: 'Propose hypotheses',
  subMid: 'design discriminating experiments',
  subTail: 'land every conclusion on evidence',
  stationLabel: 'EXPERT STATION',
  experts: Object.freeze({
    'polymer-scientist': Object.freeze({ label: 'Scientist', hint: 'Framing and evidence-backed conclusions' }),
    'polymer-physicist': Object.freeze({ label: 'Physicist', hint: 'Mechanisms, models and validity windows' }),
    'polymer-characterization': Object.freeze({ label: 'Characterization', hint: 'WAXS / FTIR / SAXS and fitting' }),
    'polymer-modeler': Object.freeze({ label: 'Modeler', hint: 'CAE solves and parameter sweeps' }),
    'polymer-literature': Object.freeze({ label: 'Literature', hint: 'Claim extraction and DOI evidence' }),
    'polymer-reviewer': Object.freeze({ label: 'Reviewer', hint: 'Independent review and card gates' }),
  }),
  ready: '6 experts ready',
  switching: 'Switching expert…',
  quick: Object.freeze([
    Object.freeze({
      id: 'design',
      title: 'Design a discriminating test',
      hint: 'Competing hypotheses → observable → minimum work',
      prompt: 'Design a discriminating experiment between orientation-induced crystallization and strain-induced chain extension: name the observable and its unit, the expected signal difference under each hypothesis, the samples required, the minimum-work protocol, and how results will be recorded as citable evidence.',
    }),
    Object.freeze({
      id: 'analyze',
      title: 'Analyze characterization data',
      hint: 'WAXS · FTIR · SAXS · record evidence',
      prompt: 'Analyze this WAXS / FTIR set: extract crystallinity, peak positions and hydrogen-bond indices, report fit residuals and validity conditions, and record every conclusion with its observable, unit and provenance as citable evidence.',
    }),
    Object.freeze({
      id: 'review',
      title: 'Review the mechanism graph',
      hint: 'Condition windows · evidence strength · promotion gate',
      prompt: 'Review the candidate edges in the mechanism graph: check conditions, theoretical basis and evidence strength per edge, cite evidence IDs or mark the gap explicitly, and state which edges may be promoted and which need more experiments.',
    }),
  ]),
  pulseLabel: 'PROJECT PULSE',
  pulseLoading: 'Loading research pulse…',
  pulseEmpty: 'No research project yet · start by framing a question',
  pulseUnavailable: 'Research pulse unavailable · check the Host /pm/overview',
  evidenceUnit: 'evidence',
  hypothesisUnit: 'hypotheses',
  knowledgeUnit: 'cards pending',
  projectUnit: 'projects',
  simReady: 'Simulation engine ready',
  simReadyMd: 'Simulation ready · MD available',
  simDegraded: 'Simulation degraded · analytic layer unavailable',
  seatUnavailable: 'Expert seat is not available',
  fillFailed: 'Could not fill the composer · paste the task instead',
  switched: (name: string) => `Expert selected: ${name}`,
  filled: 'Draft filled — review before sending',
})

/**
 * Resolve the copy set for one locale id.
 * @param active - active locale id from the host locale service.
 * @returns zh for Chinese locales, English otherwise.
 */
export function pmStudioCopy(active: string): PmStudioCopy {
  return active.toLowerCase().startsWith('zh') ? PM_STUDIO_ZH : PM_STUDIO_EN
}

/**
 * Subscribe one component to the active locale and return its copy set.
 * @param locale - injected locale face (getSnapshot/subscribe pair).
 * @returns the current copy set.
 */
export function usePmStudioCopy(locale: PmLocaleFace): PmStudioCopy {
  const active = useSyncExternalStore(locale.subscribe, locale.getSnapshot, locale.getSnapshot)
  return pmStudioCopy(active)
}
