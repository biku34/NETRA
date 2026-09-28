import type { Match, ProcessedFir } from './types.ts'

export interface IdentityLink {
  a: { fir: string; name: string }
  b: { fir: string; name: string }
  similarity: number
  method: string
  score: number
}

export interface Person {
  id: string
  name: string
  aliases: string[]
  variants: string[]
  mentions: { fir: string; name: string }[]
  firs: string[]
  districts: string[]
  states: string[]
  crimeTypes: string[]
  moTags: string[]
  firstSeen: string
  lastSeen: string
  // why the FIRs above are treated as one person
  identityLinks: IdentityLink[]
  coAccused: { id: string; name: string; firs: string[] }[]
  sameNameNotLinked: { id: string; name: string; fir: string; score: number; sharedTags: number; daysApart: number }[]
}

const uniq = <T,>(xs: T[]) => [...new Set(xs)]
const times = (accused: { name: string }[], name: string) => accused.filter((a) => a.name === name).length

// Used when the service is unreachable. Mirrors backend/app/persons.py: two mentions are
// one person only when their FIRs are linked and the two names clear the name gate.
export function buildPersons(firs: ProcessedFir[], matches: Match[], nameGate: number): Person[] {
  const byId = new Map(firs.map((f) => [f.fir_reg_no, f]))
  const key = (fir: string, i: number) => `${fir}-${i}`
  const indexOf = (f: ProcessedFir, raw: string) => f.extraction.accused.findIndex((a) => a.identified && a.raw === raw)

  const mentions = firs.flatMap((f) => f.extraction.accused.flatMap((a, i) => (a.identified ? [{ fir: f, i, k: key(f.fir_reg_no, i) }] : [])))
  const parent = new Map(mentions.map((m) => [m.k, m.k]))
  const find = (x: string): string => {
    const p = parent.get(x)!
    if (p === x) return x
    const r = find(p)
    parent.set(x, r)
    return r
  }

  const links: (IdentityLink & { k: string })[] = []
  const sameName: { ka: string; kb: string; m: Match }[] = []
  for (const m of matches) {
    const a = byId.get(m.a)
    const b = byId.get(m.b)
    if (!a || !b) continue
    for (const n of [m.bestName, ...m.otherNames]) {
      if (n.similarity < nameGate) continue
      const ia = indexOf(a, n.a)
      const ib = indexOf(b, n.b)
      if (ia < 0 || ib < 0) continue
      const ka = key(m.a, ia)
      const kb = key(m.b, ib)
      if (m.verdict === 'linked') {
        parent.set(find(ka), find(kb))
        links.push({ a: { fir: m.a, name: n.a }, b: { fir: m.b, name: n.b }, similarity: n.similarity, method: n.method, score: m.score, k: ka })
      } else if (m.verdict === 'name_only') {
        sameName.push({ ka, kb, m })
      }
    }
  }

  const groups = new Map<string, typeof mentions>()
  for (const m of mentions) {
    const root = find(m.k)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root)!.push(m)
  }

  const personOf = new Map<string, string>()
  const persons = new Map<string, Person>()
  for (const members of groups.values()) {
    members.sort((x, y) => x.fir.occurrence.date.localeCompare(y.fir.occurrence.date) || x.fir.fir_reg_no.localeCompare(y.fir.fir_reg_no) || x.i - y.i)
    const id = members[0].k
    const accused = members.map((m) => m.fir.extraction.accused[m.i])
    const memberFirs = uniq(members.map((m) => m.fir))
    const aliases: string[] = []
    for (const alias of accused.flatMap((a) => a.aliases)) if (!aliases.some((x) => x.toLowerCase() === alias.toLowerCase())) aliases.push(alias)
    for (const m of members) personOf.set(m.k, id)
    persons.set(id, {
      id,
      // the spelling used most often is the display name; the longer one wins a tie
      name: accused.map((a) => a.name).reduce((best, n) => (times(accused, n) > times(accused, best) || (times(accused, n) === times(accused, best) && n.length > best.length) ? n : best)),
      aliases,
      variants: uniq(accused.map((a) => a.raw)),
      mentions: members.map((m) => ({ fir: m.fir.fir_reg_no, name: m.fir.extraction.accused[m.i].raw })),
      firs: memberFirs.map((f) => f.fir_reg_no),
      districts: uniq(memberFirs.map((f) => f.district)),
      states: uniq(memberFirs.map((f) => f.state)),
      crimeTypes: uniq(memberFirs.flatMap((f) => f.extraction.crime_types.map((c) => c.value))),
      moTags: uniq(memberFirs.flatMap((f) => f.extraction.mo_tags.map((t) => t.value))),
      firstSeen: memberFirs[0].occurrence.date,
      lastSeen: memberFirs[memberFirs.length - 1].occurrence.date,
      identityLinks: [],
      coAccused: [],
      sameNameNotLinked: [],
    })
  }

  for (const { k, ...link } of links) persons.get(personOf.get(k)!)!.identityLinks.push(link)

  const together = new Map<string, string[]>()
  for (const f of firs) {
    const here = uniq(f.extraction.accused.flatMap((a, i) => (a.identified ? [personOf.get(key(f.fir_reg_no, i))!] : [])))
    for (const p of here) for (const q of here) if (p !== q) together.set(`${p}|${q}`, [...(together.get(`${p}|${q}`) ?? []), f.fir_reg_no])
  }
  for (const [pair, shared] of together) {
    const [p, q] = pair.split('|')
    persons.get(p)!.coAccused.push({ id: q, name: persons.get(q)!.name, firs: shared })
  }
  for (const p of persons.values()) p.coAccused.sort((a, b) => b.firs.length - a.firs.length || a.name.localeCompare(b.name))

  for (const { ka, kb, m } of sameName) {
    const p = personOf.get(ka)!
    const q = personOf.get(kb)!
    if (p === q) continue
    for (const [x, y, fir] of [[p, q, m.b], [q, p, m.a]] as const) {
      const list = persons.get(x)!.sameNameNotLinked
      if (!list.some((s) => s.id === y)) list.push({ id: y, name: persons.get(y)!.name, fir, score: m.score, sharedTags: m.sharedTags.length, daysApart: m.daysApart })
    }
  }

  return [...persons.values()].sort((a, b) => b.firs.length - a.firs.length || a.name.localeCompare(b.name))
}
