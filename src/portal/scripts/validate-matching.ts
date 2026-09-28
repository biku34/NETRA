// Checks that the scoring engine recovers the planted clusters and nothing else.
// Run with: npm run validate
import { readFileSync } from 'node:fs'
import { extractLocal } from '../src/lib/extract.ts'
import { buildNetworks, DEFAULT_CONFIG, findMatches } from '../src/lib/matching.ts'
import type { Fir, ProcessedFir } from '../src/lib/types.ts'

const firs: Fir[] = JSON.parse(readFileSync(new URL('../src/data/firs.json', import.meta.url), 'utf8'))
const processed: ProcessedFir[] = firs.map((f) => ({ ...f, extraction: extractLocal(f) }))
const byId = new Map(processed.map((f) => [f.fir_reg_no, f]))
const matches = findMatches(processed, DEFAULT_CONFIG)
const networks = buildNetworks(processed, matches, DEFAULT_CONFIG)

let failures = 0
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`)
  if (!ok) failures++
}

for (const group of ['cluster-A', 'cluster-B', 'cluster-C', 'cluster-D']) {
  const expected = processed.filter((f) => f.seed_group === group).map((f) => f.fir_reg_no).sort()
  const found = networks.find((n) => n.firs.some((id) => expected.includes(id)))
  const got = found ? [...found.firs].sort() : []
  check(JSON.stringify(got) === JSON.stringify(expected), `${group}: ${expected.length} planted FIRs, network has ${got.length} (${found?.districts.join(', ') ?? 'not found'})`)
}

const linked = matches.filter((m) => m.verdict === 'linked')
const wrong = linked.filter((m) => {
  const a = byId.get(m.a)!.seed_group
  const b = byId.get(m.b)!.seed_group
  return a !== b || !a?.startsWith('cluster')
})
check(wrong.length === 0, `false positives among linked pairs: ${wrong.length}`)
for (const m of wrong) console.log(`      ${m.bestName.a} <> ${m.bestName.b}  score ${m.score.toFixed(2)}`)

const control = matches.filter((m) => [m.a, m.b].some((id) => byId.get(id)!.seed_group === 'control'))
check(control.length > 0 && control.every((m) => m.verdict === 'name_only'), `control (same name, unrelated offence) stays unlinked: ${control.length} pairs`)

const decoy = matches.filter((m) => [m.a, m.b].some((id) => byId.get(id)!.seed_group === 'decoy'))
check(decoy.every((m) => m.verdict !== 'linked'), `decoys (same MO, different accused) stay unlinked: ${decoy.filter((m) => m.verdict === 'mo_only').length} MO-only pairs`)

const scores = linked.map((m) => m.score)
console.log(`\nlinked pairs: ${linked.length}, score range ${Math.min(...scores).toFixed(2)}-${Math.max(...scores).toFixed(2)}`)
const near = matches.filter((m) => m.verdict !== 'linked').sort((a, b) => b.score - a.score).slice(0, 3)
for (const m of near) console.log(`highest unlinked: ${m.verdict}  ${m.bestName.a} <> ${m.bestName.b}  name ${m.bestName.similarity.toFixed(2)}  score ${m.score.toFixed(2)}`)
const weakest = [...linked].sort((a, b) => a.score - b.score)[0]
console.log(`weakest linked: ${weakest.bestName.a} <> ${weakest.bestName.b} (${weakest.bestName.method})`, weakest.components)

console.log('\nTags per FIR:')
for (const f of processed) console.log(`  ${f.seed_group?.padEnd(10)} ${f.police_station.padEnd(22)} ${f.extraction.crime_types.map((c) => c.value).join(', ')}  |  ${f.extraction.mo_tags.map((t) => t.value).join(' ')}`)

process.exit(failures ? 1 : 0)
