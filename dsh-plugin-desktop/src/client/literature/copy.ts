/** Small zh/en copy set for the Literature page. */

export type LiteratureLocale = 'zh' | 'en'

export interface LiteratureCopy {
  readonly eyebrow: string
  readonly title: string
  readonly subtitle: string
  readonly scopeTitle: string
  readonly scopeHint: string
  readonly workspace: string
  readonly domain: string
  readonly collections: string
  readonly papers: string
  readonly reportsNotes: string
  readonly reports: string
  readonly notes: string
  readonly inventory: string
  readonly vector: string
  readonly chunks: string
  readonly keywordFallback: string
  readonly search: string
  readonly searchLabel: string
  readonly kind: string
  readonly allKinds: string
  readonly documents: string
  readonly open: string
  readonly documentTitle: string
  readonly year: string
  readonly doi: string
  readonly type: string
  readonly path: string
  readonly noWorkspace: string
  readonly noWorkspaceDetail: string
  readonly noDomains: string
  readonly noDomainsDetail: string
  readonly noDescription: string
  readonly noDomain: string
  readonly empty: string
  readonly emptyDetail: string
  readonly noMatches: string
  readonly clearFilters: string
  readonly loading: string
  readonly retry: string
  readonly errorTitle: string
  readonly errorNextStep: string
  readonly pdfErrorTitle: string
  readonly pdfErrorMessage: string
  readonly pdfNoSession: string
  readonly pdfPreviewUnavailable: string
  readonly pdfSessionMismatch: string
  readonly pdfErrorNextStep: string
  readonly zoteroCollection: string
  readonly literatureProject: string
  readonly relatedDomains: string
  readonly orphanScan: string
  readonly orphanScanning: string
  readonly orphanHint: string
  readonly orphanResults: string
  readonly orphanFiles: string
}

const ZH: LiteratureCopy = Object.freeze({
  eyebrow: '研究资源 / 文献库',
  title: '文献',
  subtitle: '按工作区与领域整理论文、报告和研究手记。',
  scopeTitle: '当前范围',
  scopeHint: '选择工作区与领域；下方集合只显示该范围内已索引的资料。',
  workspace: '工作区',
  domain: '领域',
  collections: '资料集合',
  papers: '论文 PDF',
  reportsNotes: '报告与手记',
  reports: '报告',
  notes: '手记',
  inventory: '索引概览',
  vector: '向量',
  chunks: '文本块',
  keywordFallback: '当前使用关键词检索',
  search: '按标题、DOI 或路径搜索',
  searchLabel: '搜索文献标题、DOI 或文件路径',
  kind: '类型',
  allKinds: '所有类型',
  documents: '篇资料',
  open: '在阅读器中打开',
  documentTitle: '标题',
  year: '年份',
  doi: 'DOI',
  type: '资料类型',
  path: '文件路径',
  noWorkspace: '没有可用的工作区',
  noWorkspaceDetail: '先打开一个会话，再从该工作区浏览已索引的资料。',
  noDomains: '此工作区尚未配置领域',
  noDomainsDetail: '在此工作区运行 domain-migrate 注册领域，然后重新加载文献库。',
  noDescription: '此领域尚未提供说明。',
  noDomain: '请先选择一个领域。',
  empty: '此集合暂无已索引资料',
  emptyDetail: '切换另一个集合，或确认资料已添加到当前领域。',
  noMatches: '没有符合筛选条件的资料',
  clearFilters: '清除筛选',
  loading: '正在加载文献资料…',
  retry: '重试',
  errorTitle: '无法载入文献资料',
  errorNextStep: '检查工作区是否可用，然后重试。',
  pdfErrorTitle: '无法打开 PDF',
  pdfErrorMessage: '未能在当前阅读器中打开这份 PDF。',
  pdfNoSession: '找不到该工作区对应的会话。',
  pdfPreviewUnavailable: '右侧预览服务尚未就绪。',
  pdfSessionMismatch: '当前显示的会话与文献工作区不一致。',
  pdfErrorNextStep: '打开该工作区对应的会话后，再试一次。',
  zoteroCollection: 'Zotero 集合',
  literatureProject: '文献项目',
  relatedDomains: '相关领域',
  orphanScan: '扫描未入库 PDF',
  orphanScanning: '正在扫描…',
  orphanHint: '只读检查，不会自动入库。',
  orphanResults: '未入库扫描',
  orphanFiles: '个文件',
})

const EN: LiteratureCopy = Object.freeze({
  eyebrow: 'RESEARCH RESOURCES / LITERATURE',
  title: 'Literature',
  subtitle: 'Browse papers, reports, and research notes by workspace and domain.',
  scopeTitle: 'Current scope',
  scopeHint: 'Choose a workspace and domain. Collections below show indexed material in that scope.',
  workspace: 'Workspace',
  domain: 'Domain',
  collections: 'Collections',
  papers: 'Paper PDFs',
  reportsNotes: 'Reports & notes',
  reports: 'Reports',
  notes: 'Notes',
  inventory: 'Indexed inventory',
  vector: 'Vectors',
  chunks: 'text chunks',
  keywordFallback: 'Keyword search is active',
  search: 'Search title, DOI, or path',
  searchLabel: 'Search literature by title, DOI, or file path',
  kind: 'Type',
  allKinds: 'All types',
  documents: 'documents',
  open: 'Open in reader',
  documentTitle: 'Title',
  year: 'Year',
  doi: 'DOI',
  type: 'Type',
  path: 'File path',
  noWorkspace: 'No workspace is available',
  noWorkspaceDetail: 'Open a session first, then browse the material indexed for that workspace.',
  noDomains: 'No domains are configured for this workspace',
  noDomainsDetail: 'Run domain-migrate in this workspace to register domains, then reload Literature.',
  noDescription: 'No description is available for this domain.',
  noDomain: 'Choose a domain to continue.',
  empty: 'No indexed material in this collection',
  emptyDetail: 'Try another collection or confirm that material has been added to this domain.',
  noMatches: 'No material matches these filters',
  clearFilters: 'Clear filters',
  loading: 'Loading literature…',
  retry: 'Retry',
  errorTitle: 'Could not load literature',
  errorNextStep: 'Check that the workspace is available, then try again.',
  pdfErrorTitle: 'Could not open PDF',
  pdfErrorMessage: 'This PDF could not be opened in the current reader.',
  pdfNoSession: 'No session was found for this workspace.',
  pdfPreviewUnavailable: 'The right-side preview service is not ready.',
  pdfSessionMismatch: 'The visible session does not match the Literature workspace.',
  pdfErrorNextStep: 'Open the session for this workspace, then try again.',
  zoteroCollection: 'Zotero collection',
  literatureProject: 'Literature project',
  relatedDomains: 'Related domains',
  orphanScan: 'Scan unindexed PDFs',
  orphanScanning: 'Scanning…',
  orphanHint: 'Read-only check; files are not ingested.',
  orphanResults: 'Unindexed scan',
  orphanFiles: 'files',
})

/** Pick the copy set for the active locale. */
export function literatureCopy(locale: string): LiteratureCopy {
  return locale.toLowerCase().startsWith('zh') ? ZH : EN
}
