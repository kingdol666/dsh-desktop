/** Small zh/en copy set for the Literature page. */

export type LiteratureLocale = 'zh' | 'en'

export interface LiteratureCopy {
  readonly title: string
  readonly subtitle: string
  readonly workspace: string
  readonly domain: string
  readonly papers: string
  readonly reports: string
  readonly notes: string
  readonly search: string
  readonly open: string
  readonly empty: string
  readonly loading: string
  readonly noWorkspace: string
  readonly noDomains: string
  readonly orphanScan: string
  readonly orphanHint: string
  readonly vector: string
  readonly keywordFallback: string
  readonly chunks: string
  readonly year: string
  readonly type: string
}

const ZH: LiteratureCopy = {
  title: '文献',
  subtitle: '按领域隔离的论文、报告与手记',
  workspace: '工作区',
  domain: '领域',
  papers: '论文 PDF',
  reports: '内部报告',
  notes: '手记',
  search: '搜索标题或 DOI',
  open: '打开',
  empty: '当前领域没有文档',
  loading: '加载中…',
  noWorkspace: '还没有可用的工作区；先打开一个会话。',
  noDomains: '当前工作区没有领域注册表；先运行 domain-migrate。',
  orphanScan: '扫描未入库 PDF',
  orphanHint: '只读扫描，不会自动入库',
  vector: '向量',
  keywordFallback: '关键词回退',
  chunks: '块',
  year: '年份',
  type: '类型',
}

const EN: LiteratureCopy = {
  title: 'Literature',
  subtitle: 'Domain-isolated papers, reports and notes',
  workspace: 'Workspace',
  domain: 'Domain',
  papers: 'Paper PDFs',
  reports: 'Reports',
  notes: 'Notes',
  search: 'Search title or DOI',
  open: 'Open',
  empty: 'No documents in this domain',
  loading: 'Loading…',
  noWorkspace: 'No workspace yet; open a session first.',
  noDomains: 'No domain registry in this workspace; run domain-migrate.',
  orphanScan: 'Scan unindexed PDFs',
  orphanHint: 'Read-only; does not ingest',
  vector: 'Vectors',
  keywordFallback: 'keyword fallback',
  chunks: 'chunks',
  year: 'Year',
  type: 'Type',
}

/** Pick the copy set for the active locale. */
export function literatureCopy(locale: string): LiteratureCopy {
  return locale.toLowerCase().startsWith('zh') ? ZH : EN
}
