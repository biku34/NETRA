import type { Match, Network, ProcessedFir } from './types.ts'

// Series colours for the map, in fixed order: a gang keeps its colour whichever other
// gangs are on screen. Three is the limit that stays distinguishable when any two marks
// can sit side by side; further gangs are drawn in the neutral colour and labelled.
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a']
export const NEUTRAL = '#6b7686'

export const seriesColour = (index: number) => SERIES[index] ?? NEUTRAL

export interface RelatedFir {
  fir: ProcessedFir
  match: Match
}

// FIRs outside a gang that were committed the same way by a different accused.
// Three shared method tags is the bar: one or two ("night", "motorcycle") is coincidence.
export function relatedByMethod(network: Network, matches: Match[], byId: Map<string, ProcessedFir>): RelatedFir[] {
  const members = new Set(network.firs)
  const best = new Map<string, Match>()
  for (const m of matches) {
    if (m.verdict !== 'mo_only' || m.sharedTags.length < 3) continue
    const outside = members.has(m.a) && !members.has(m.b) ? m.b : members.has(m.b) && !members.has(m.a) ? m.a : null
    if (!outside) continue
    const seen = best.get(outside)
    if (!seen || m.sharedTags.length > seen.sharedTags.length) best.set(outside, m)
  }
  return [...best].flatMap(([id, match]) => (byId.has(id) ? [{ fir: byId.get(id)!, match }] : []))
}

export interface MethodPattern {
  id: string
  tags: string[]
  firs: ProcessedFir[]
  districts: string[]
  lastSeen: string
}

// Repeated methods with no repeat accused: usually unidentified offenders.
// Groups FIRs that share at least two method tags, outside any gang, three FIRs or more.
export function methodPatterns(firs: ProcessedFir[], matches: Match[], networks: Network[]): MethodPattern[] {
  const inGang = new Set(networks.flatMap((n) => n.firs))
  const ids = new Set(firs.filter((f) => !inGang.has(f.fir_reg_no)).map((f) => f.fir_reg_no))
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    const p = parent.get(x) ?? x
    if (p === x) return x
    const r = find(p)
    parent.set(x, r)
    return r
  }
  const pairs = matches.filter((m) => m.verdict === 'mo_only' && m.sharedTags.length >= 2 && ids.has(m.a) && ids.has(m.b))
  for (const m of pairs) parent.set(find(m.a), find(m.b))

  const groups = new Map<string, Set<string>>()
  for (const m of pairs) {
    const root = find(m.a)
    if (!groups.has(root)) groups.set(root, new Set())
    groups.get(root)!.add(m.a).add(m.b)
  }
  const byId = new Map(firs.map((f) => [f.fir_reg_no, f]))
  return [...groups.values()]
    .filter((g) => g.size >= 3)
    .map((g) => {
      const members = [...g].map((id) => byId.get(id)!).sort((a, b) => a.occurrence.date.localeCompare(b.occurrence.date))
      const tags = members.map((f) => new Set(f.extraction.mo_tags.map((t) => t.value)))
      return {
        id: members[0].fir_reg_no,
        tags: [...tags[0]].filter((t) => tags.every((s) => s.has(t))),
        firs: members,
        districts: [...new Set(members.map((f) => f.district))],
        lastSeen: members[members.length - 1].occurrence.date,
      }
    })
    .filter((p) => p.tags.length >= 2)
    .sort((a, b) => b.firs.length - a.firs.length)
}
