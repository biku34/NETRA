import rules from '../../shared/extraction-rules.json' with { type: 'json' }
import type { ExtractedAccused, Match, NameMatch, Network, ProcessedFir, ScoringConfig, Verdict } from './types.ts'

export const DEFAULT_CONFIG: ScoringConfig = {
  weights: { name: 0.4, moTags: 0.25, moText: 0.2, temporal: 0.15 },
  nameGate: 0.8,
  threshold: 0.6,
  decayDays: 180,
}

// ---------- name similarity ----------

// Same measure as RapidFuzz `ratio`: 1 - indel_distance / (len_a + len_b), via LCS.
function ratio(a: string, b: string): number {
  if (!a.length && !b.length) return 1
  let prev = new Array<number>(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i++) {
    const cur = [0]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1])
    }
    prev = cur
  }
  return (2 * prev[b.length]) / (a.length + b.length)
}

const tokens = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean)
const tokenSort = (s: string[]) => [...s].sort().join(' ')

// Collapses common transliteration variants of Indian names (Mondal/Mandal, Hajra/Hazra,
// Gurprit/Gurpreet, Babloo/Bablu) so spelling differences do not hide the same person.
export function phonetic(token: string): string {
  return token
    .replace(/ee|ea/g, 'i')
    .replace(/oo|ou/g, 'u')
    .replace(/z/g, 'j')
    .replace(/ph/g, 'f')
    .replace(/w/g, 'v')
    .replace(/y/g, 'i')
    .replace(/o/g, 'a')
    .replace(/(.)\1+/g, '$1')
}

const FILLER = new Set(rules.nameFillers)
// Gujarati honorifics are written joined to the name: Vikrambhai, Vikramsinh, Hansaben.
const SUFFIX = new RegExp(`(?<=.{4})(${rules.nameSuffixes.join('|')})$`)
const core = (ts: string[]) => ts.filter((t) => !FILLER.has(t)).map((t) => phonetic(t.replace(SUFFIX, '')))

function compareNames(a: string, b: string): { similarity: number; method: string } {
  const ta = tokens(a)
  const tb = tokens(b)
  if (!ta.length || !tb.length) return { similarity: 0, method: 'no name' }

  const spelled = ratio(tokenSort(ta), tokenSort(tb))
  const sound = ratio(tokenSort(ta.map(phonetic)), tokenSort(tb.map(phonetic)))
  let best = spelled >= sound ? { similarity: spelled, method: 'spelling match' } : { similarity: sound, method: 'same pronunciation, different spelling' }

  // Drop fillers such as "Kr." and expand initials: "P. Mandal" vs "Pradeep Mandal".
  const ca = core(ta)
  const cb = core(tb)
  if (ca.length && cb.length) {
    const stripped = ratio(tokenSort(ca), tokenSort(cb))
    if (stripped > best.similarity) best = { similarity: stripped, method: 'match after removing titles and honorifics' }

    for (const [short, long] of [[ca, cb], [cb, ca]]) {
      const initials = short.filter((t) => t.length === 1)
      const full = short.filter((t) => t.length > 1)
      if (!initials.length || !full.length) continue
      const rest = [...long]
      const take = (pred: (r: string) => boolean) => {
        const i = rest.findIndex(pred)
        if (i >= 0) rest.splice(i, 1)
        return i >= 0
      }
      const ok = full.every((t) => take((r) => ratio(t, r) >= 0.85)) && initials.every((t) => take((r) => r.startsWith(t)))
      if (ok && best.similarity < 0.85) best = { similarity: 0.85, method: 'initial matches full name' }
    }
  }
  return best
}

export function nameSimilarity(a: ExtractedAccused, b: ExtractedAccused): NameMatch {
  let best = compareNames(a.name, b.name)
  // An alias can also be recorded as the main name in another station's FIR.
  for (const alias of a.aliases) {
    const r = compareNames(alias, b.name)
    if (r.similarity > best.similarity) best = { similarity: r.similarity, method: `alias "${alias}" matches name` }
  }
  for (const alias of b.aliases) {
    const r = compareNames(a.name, alias)
    if (r.similarity > best.similarity) best = { similarity: r.similarity, method: `alias "${alias}" matches name` }
  }
  const sharedAlias = a.aliases.find((x) => b.aliases.some((y) => ratio(tokenSort(tokens(x).map(phonetic)), tokenSort(tokens(y).map(phonetic))) >= 0.9))
  if (sharedAlias && best.similarity >= 0.5) {
    best = { similarity: Math.min(1, best.similarity + 0.1), method: `${best.method} + shared alias "${sharedAlias}"` }
  }
  return { a: a.raw, b: b.raw, similarity: best.similarity, method: best.method }
}

// ---------- MO similarity ----------

export function jaccard(a: string[], b: string[]): { value: number; shared: string[] } {
  const sb = new Set(b)
  const shared = a.filter((t) => sb.has(t))
  const union = new Set([...a, ...b]).size
  return { value: union ? shared.length / union : 0, shared }
}

const STOP = new Set('a an the and or of to in on at by for from with was were is are be been as his her he she it they them their its that this who which while had has have not into out over after before about up down off same also then than one two'.split(' '))

const words = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w))

// TF-IDF cosine over the English MO summaries. This stands in for sentence-transformer
// embeddings, which need the Python backend; the component keeps the same weight and role.
export function buildTextVectors(docs: { id: string; text: string }[]): Map<string, Map<string, number>> {
  const df = new Map<string, number>()
  const tokenised = docs.map((d) => ({ id: d.id, w: words(d.text) }))
  for (const d of tokenised) for (const w of new Set(d.w)) df.set(w, (df.get(w) ?? 0) + 1)
  const out = new Map<string, Map<string, number>>()
  for (const d of tokenised) {
    const v = new Map<string, number>()
    for (const w of d.w) v.set(w, (v.get(w) ?? 0) + 1)
    let norm = 0
    for (const [w, tf] of v) {
      const x = tf * (Math.log((1 + docs.length) / (1 + (df.get(w) ?? 0))) + 1)
      v.set(w, x)
      norm += x * x
    }
    norm = Math.sqrt(norm) || 1
    for (const [w, x] of v) v.set(w, x / norm)
    out.set(d.id, v)
  }
  return out
}

function cosine(a?: Map<string, number>, b?: Map<string, number>): number {
  if (!a || !b) return 0
  let dot = 0
  for (const [w, x] of a) dot += x * (b.get(w) ?? 0)
  return dot
}

// ---------- pair scoring ----------

const DAY = 86_400_000
const daysBetween = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / DAY

export const pairKey = (a: string, b: string) => (a < b ? `${a}~${b}` : `${b}~${a}`)

export function scorePair(a: ProcessedFir, b: ProcessedFir, vectors: Map<string, Map<string, number>>, cfg: ScoringConfig): Match | null {
  const names: NameMatch[] = []
  for (const pa of a.extraction.accused) {
    if (!pa.identified) continue
    for (const pb of b.extraction.accused) {
      if (pb.identified) names.push(nameSimilarity(pa, pb))
    }
  }
  names.sort((x, y) => y.similarity - x.similarity)
  const bestName: NameMatch = names[0] ?? { a: '—', b: '—', similarity: 0, method: 'no identified accused to compare' }

  const tags = jaccard(a.extraction.mo_tags.map((t) => t.value), b.extraction.mo_tags.map((t) => t.value))
  const days = daysBetween(a.occurrence.date, b.occurrence.date)
  const components = {
    name: bestName.similarity,
    moTags: tags.value,
    moText: cosine(vectors.get(a.fir_reg_no), vectors.get(b.fir_reg_no)),
    temporal: Math.exp(-days / cfg.decayDays),
  }
  const w = cfg.weights
  const score = w.name * components.name + w.moTags * components.moTags + w.moText * components.moText + w.temporal * components.temporal

  const sameName = components.name >= cfg.nameGate
  let verdict: Verdict
  if (sameName && score >= cfg.threshold) verdict = 'linked'
  else if (sameName) verdict = 'name_only'
  else if (components.moTags >= 0.5) verdict = 'mo_only'
  else return null

  return {
    key: pairKey(a.fir_reg_no, b.fir_reg_no),
    a: a.fir_reg_no,
    b: b.fir_reg_no,
    components,
    score,
    verdict,
    crossDistrict: a.district !== b.district,
    crossState: a.state !== b.state,
    bestName,
    otherNames: names.slice(1).filter((n) => n.similarity >= cfg.nameGate),
    sharedTags: tags.shared,
    daysApart: Math.round(days),
  }
}

export function findMatches(firs: ProcessedFir[], cfg: ScoringConfig): Match[] {
  const vectors = buildTextVectors(firs.map((f) => ({ id: f.fir_reg_no, text: f.mo_summary })))
  const out: Match[] = []
  for (let i = 0; i < firs.length; i++) {
    for (let j = i + 1; j < firs.length; j++) {
      const m = scorePair(firs[i], firs[j], vectors, cfg)
      if (m) out.push(m)
    }
  }
  return out.sort((x, y) => y.score - x.score)
}

// ---------- networks ----------

export function buildNetworks(firs: ProcessedFir[], matches: Match[], cfg: ScoringConfig): Network[] {
  const byId = new Map(firs.map((f) => [f.fir_reg_no, f]))
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    const p = parent.get(x) ?? x
    if (p === x) return x
    const r = find(p)
    parent.set(x, r)
    return r
  }
  const linked = matches.filter((m) => m.verdict === 'linked')
  for (const m of linked) parent.set(find(m.a), find(m.b))

  const groups = new Map<string, Set<string>>()
  for (const m of linked) {
    const root = find(m.a)
    if (!groups.has(root)) groups.set(root, new Set())
    groups.get(root)!.add(m.a).add(m.b)
  }

  const uniq = <T,>(xs: T[]) => [...new Set(xs)]
  const networks = [...groups.values()].map((ids) => {
    const members = [...ids].map((id) => byId.get(id)!).sort((a, b) => a.occurrence.date.localeCompare(b.occurrence.date))
    const ms = linked.filter((m) => ids.has(m.a))
    const variants = uniq(ms.flatMap((m) => [m.bestName, ...m.otherNames]).filter((n) => n.similarity >= cfg.nameGate).flatMap((n) => [n.a, n.b]))
    const tagCount = new Map<string, number>()
    for (const f of members) for (const t of f.extraction.mo_tags) tagCount.set(t.value, (tagCount.get(t.value) ?? 0) + 1)
    return {
      id: '',
      label: variants.slice().sort((a, b) => b.length - a.length)[0] ?? 'Unnamed',
      firs: members.map((f) => f.fir_reg_no),
      nameVariants: variants,
      districts: uniq(members.map((f) => f.district)),
      states: uniq(members.map((f) => f.state)),
      crimeTypes: uniq(members.flatMap((f) => f.extraction.crime_types.map((c) => c.value))),
      sharedTags: [...tagCount].filter(([, n]) => n >= Math.ceil(members.length * 0.75)).map(([t]) => t),
      matches: ms,
      avgScore: ms.reduce((s, m) => s + m.score, 0) / ms.length,
      firstSeen: members[0].occurrence.date,
      lastSeen: members[members.length - 1].occurrence.date,
    }
  })
  networks.sort((a, b) => b.firs.length - a.firs.length || b.avgScore - a.avgScore)
  networks.forEach((n, i) => (n.id = `N${i + 1}`))
  return networks
}

export type RiskLevel = 'high' | 'medium' | 'low'

export function networkRisk(n: Network): RiskLevel {
  if (n.districts.length >= 3 || n.states.length >= 2) return 'high'
  if (n.districts.length === 2) return 'medium'
  return 'low'
}
