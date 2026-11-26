/** Deterministic local domain classifier: no model call, no network. */

import type { DomainAlternative, DomainConfig, DomainRouteResult } from './types.ts'

const CJK_RUN = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/gu
const ASCII_WORD = /[a-z0-9]+/gu
const ASCII_KEYWORD = /^[a-z0-9][a-z0-9 -]*$/u

function normalize(text: string): string {
  return text.normalize('NFKC').toLowerCase()
}

function tokenize(text: string): Set<string> {
  const normalized = normalize(text)
  const tokens = new Set<string>()
  for (const match of normalized.matchAll(ASCII_WORD)) tokens.add(match[0])
  for (const match of normalized.matchAll(CJK_RUN)) {
    const run = match[0]
    if (run.length === 1) {
      tokens.add(run)
      continue
    }
    for (let index = 0; index < run.length - 1; index += 1) tokens.add(run.slice(index, index + 2))
    if (run.length <= 8) tokens.add(run)
  }
  return tokens
}

function keywordScore(text: string, tokens: Set<string>, keyword: string): number {
  const normalized = normalize(keyword)
  if (normalized === '') return 0
  if (ASCII_KEYWORD.test(normalized)) {
    const textWords = new Set(text.match(ASCII_WORD) ?? [])
    const words = normalized.split(/[\s-]+/u).filter(word => word !== '')
    if (words.length > 0 && words.every(word => textWords.has(word))) return 3
  } else if (text.includes(normalized)) {
    return 3
  }
  const keywordTokens = tokenize(normalized)
  if (keywordTokens.size === 0) return 0
  let hits = 0
  for (const token of keywordTokens) if (tokens.has(token)) hits += 1
  return hits === 0 ? 0 : 1.5 * (hits / keywordTokens.size)
}

function unionTokens(...values: readonly string[]): Set<string> {
  const tokens = new Set<string>()
  for (const value of values) for (const token of tokenize(value)) tokens.add(token)
  return tokens
}

interface Scored {
  readonly domain: DomainConfig
  readonly score: number
  readonly evidence: readonly string[]
}

function scoreDomain(question: string, tokens: Set<string>, domain: DomainConfig): Scored {
  const text = normalize(question)
  let score = 0
  const evidence: string[] = []
  for (const keyword of domain.keywords) {
    const value = keywordScore(text, tokens, keyword)
    if (value > 0) {
      score += value
      evidence.push(`keyword:${keyword}`)
    }
  }
  const nameTokens = unionTokens(domain.name)
  let nameHits = 0
  for (const token of nameTokens) if (tokens.has(token)) nameHits += 1
  if (nameHits > 0) score += Math.min(2, nameHits * 0.5)
  const descriptionTokens = unionTokens(domain.description)
  let descriptionHits = 0
  for (const token of descriptionTokens) if (tokens.has(token)) descriptionHits += 1
  if (descriptionHits > 0) score += Math.min(1, descriptionHits * 0.25)
  return { domain, score: Math.round(score * 1000) / 1000, evidence }
}

function alternatives(scored: readonly Scored[]): DomainAlternative[] {
  return scored.slice(0, 3).map(entry => ({ id: entry.domain.id, name: entry.domain.name, score: entry.score }))
}

/** Rank domains and return an explicit confirmation request when the top is weak or close. */
export function routeDomains(input: string, domains: readonly DomainConfig[]): DomainRouteResult {
  if (domains.length === 0) {
    return {
      ok: true,
      domain: null,
      domainName: null,
      confidence: 0,
      evidence: [],
      alternatives: [],
      relatedDomains: [],
      kbRoot: null,
      collection: null,
      litProject: null,
      needsConfirmation: true,
      question: '没有可用的领域注册表。请先创建 domains/<id>/domain.json。',
    }
  }
  const trimmed = input.trim()
  if (trimmed === '') {
    return {
      ok: true,
      domain: null,
      domainName: null,
      confidence: 0,
      evidence: [],
      alternatives: alternatives(domains.map(domain => ({ domain, score: 0, evidence: [] }))),
      relatedDomains: [],
      kbRoot: null,
      collection: null,
      litProject: null,
      needsConfirmation: true,
      question: `请确认领域：${domains.map(domain => domain.name).join(' / ')}`,
    }
  }
  const tokens = tokenize(trimmed)
  const scored = domains
    .map(domain => scoreDomain(trimmed, tokens, domain))
    .sort((left, right) => right.score - left.score || left.domain.id.localeCompare(right.domain.id))
  const top = scored[0]
  const second = scored[1]
  if (top === undefined) {
    return {
      ok: true,
      domain: null,
      domainName: null,
      confidence: 0,
      evidence: [],
      alternatives: [],
      relatedDomains: [],
      kbRoot: null,
      collection: null,
      litProject: null,
      needsConfirmation: true,
      question: '没有可用的领域注册表。',
    }
  }
  const topScore = top.score
  const secondScore = second?.score ?? 0
  const confidence = topScore <= 0 ? 0 : Math.round((topScore / (topScore + secondScore + 1)) * 100) / 100
  const needsConfirmation = topScore < 3 || topScore - secondScore < 1.5
  const question = needsConfirmation
    ? second === undefined || secondScore === 0
      ? `请确认领域：「${top.domain.name}」还是其他？`
      : `这更像「${top.domain.name}」还是「${second.domain.name}」？`
    : undefined
  return {
    ok: true,
    domain: needsConfirmation ? null : top.domain.id,
    domainName: needsConfirmation ? null : top.domain.name,
    confidence,
    evidence: top.evidence,
    alternatives: alternatives(scored),
    relatedDomains: needsConfirmation ? [] : top.domain.relatedDomains,
    kbRoot: needsConfirmation ? null : top.domain.kbRoot,
    collection: needsConfirmation ? null : top.domain.zoteroCollection ?? null,
    litProject: needsConfirmation ? null : top.domain.litProject ?? null,
    needsConfirmation,
    ...(question === undefined ? {} : { question }),
  }
}
