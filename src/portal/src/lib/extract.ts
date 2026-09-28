import rules from '../../shared/extraction-rules.json' with { type: 'json' }
import type { EngineId, Evidence, ExtractedAccused, Extraction, Fir } from './types.ts'

// One interface, two engines. The local rule engine is the working default and the
// live-demo fallback; Granite plugs in behind the same interface once credentials exist.
export interface Extractor {
  id: EngineId
  label: string
  extract(fir: Fir): Promise<Extraction>
}

// Rules live in shared/extraction-rules.json so the browser fallback and the Python
// backend read FIRs the same way.
const SECTION_RULES = rules.sections.map((r) => [new RegExp(r.pattern), r.type] as const)
const TEXT_CRIME_RULES = rules.text.map((r) => [new RegExp(r.pattern, r.flags), r.type] as const)
const MO_RULES = rules.mo.map((r) => [r.tag, new RegExp(r.pattern, r.flags), r.indic] as const)

const MARKERS = rules.aliasMarkers.map((m) => (/^[a-z]+$/.test(m) ? String.raw`\b${m}\b` : m)).join('|')
const ALIAS_SPLIT = new RegExp(String.raw`\s*(?:${MARKERS})\s*`, 'i')
const ALIAS_AFTER_NAME = new RegExp(String.raw`^\s*(?:${MARKERS})\s+([^\s,.।]+(?:\s[^\s,.।]+)?)`, 'i')
const UNIDENTIFIED = new RegExp(rules.unidentified, 'i')
const ALIAS_TRAILING = new Set(rules.aliasTrailingWords.map((w) => w.toLowerCase()))

function aliasOf(found: string): string {
  const words = found.split(/\s+/)
  return words.length > 1 && ALIAS_TRAILING.has(words[words.length - 1].toLowerCase()) ? words.slice(0, -1).join(' ') : found
}

export function parseAccused(raw: string): ExtractedAccused {
  const [name, ...aliases] = raw.split(ALIAS_SPLIT).map((s) => s.trim()).filter(Boolean)
  return { raw, name: name ?? raw, aliases, identified: !UNIDENTIFIED.test(raw) }
}

function snippet(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 24)
  const end = Math.min(text.length, index + length + 24)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
}

export function extractLocal(fir: Fir): Extraction {
  const text = `${fir.narrative}\n${fir.mo_summary}`

  const crime = new Map<string, string>()
  for (const section of fir.acts_sections) {
    for (const [re, type] of SECTION_RULES) {
      if (re.test(section) && !crime.has(type)) crime.set(type, `Section ${section}`)
    }
  }
  for (const [re, type] of TEXT_CRIME_RULES) {
    const m = re.exec(text)
    if (m && !crime.has(type)) crime.set(type, `Text: "${snippet(text, m.index, m[0].length)}"`)
  }

  const tags = new Map<string, string>()
  for (const [tag, re, indic] of MO_RULES) {
    const m = re.exec(text)
    if (m) {
      tags.set(tag, `Text: "${snippet(text, m.index, m[0].length)}"`)
      continue
    }
    const term = indic.find((t) => text.includes(t))
    if (term) tags.set(tag, `Text: "${snippet(text, text.indexOf(term), term.length)}"`)
  }
  if (fir.victim_profile.age_range === '60+' && !tags.has('elderly_victim')) {
    tags.set('elderly_victim', 'Victim profile: age 60+')
  }

  // Aliases written only in the narrative ("… ওরফে কালা বাবলু") are attached to the
  // accused whose name appears just before the alias marker.
  const accused = fir.accused.map((a) => parseAccused(a.name))
  for (const person of accused) {
    if (!person.identified) continue
    const at = fir.narrative.indexOf(person.name)
    if (at < 0) continue
    const tail = fir.narrative.slice(at + person.name.length, at + person.name.length + 40)
    const m = ALIAS_AFTER_NAME.exec(tail)
    if (m && !person.aliases.some((x) => x.toLowerCase() === aliasOf(m[1]).toLowerCase())) person.aliases.push(aliasOf(m[1]))
  }

  const toEvidence = (m: Map<string, string>): Evidence[] => [...m].map(([value, because]) => ({ value, because }))
  return { engine: 'local-rules', crime_types: toEvidence(crime), mo_tags: toEvidence(tags), accused }
}

export const localExtractor: Extractor = {
  id: 'local-rules',
  label: 'Local rule engine',
  extract: async (fir) => extractLocal(fir),
}

// Placeholder until watsonx.ai credentials are configured. The call will go through the
// FastAPI backend (never from the browser) so the API key stays server-side.
export const granite = {
  id: 'watsonx-granite' as EngineId,
  label: 'IBM watsonx.ai Granite',
  connected: false,
}

export const activeExtractor: Extractor = localExtractor
