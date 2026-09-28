export interface Accused {
  name: string
  relative_name: string
  address: string
}

export interface Fir {
  fir_id: string
  fir_reg_no: string
  state: string
  district: string
  police_station: string
  date_of_fir: string
  occurrence: { date: string; time_period: string; place: string }
  acts_sections: string[]
  complainant: { name: string; phone_masked: string }
  accused: Accused[]
  victim_profile: { gender: string; age_range: string; relation_to_accused: string }
  narrative: string
  language: 'en' | 'hi' | 'bn' | 'gu'
  mo_summary: string
  investigating_officer: { name: string; rank: string }
  status: string
  lat: number
  lng: number
  seed_group?: string
  // true when the record is outside the viewer's jurisdiction and shown by reference only
  redacted?: boolean
}

export type EngineId = 'local-rules' | 'watsonx-granite'

export interface ExtractedAccused {
  raw: string
  name: string
  aliases: string[]
  identified: boolean
}

export interface Evidence {
  value: string
  // the section or phrase in the FIR that produced this value
  because: string
}

export interface Extraction {
  engine: EngineId
  crime_types: Evidence[]
  mo_tags: Evidence[]
  accused: ExtractedAccused[]
}

export interface ProcessedFir extends Fir {
  extraction: Extraction
}

export interface Weights {
  name: number
  moTags: number
  moText: number
  temporal: number
}

export interface ScoringConfig {
  weights: Weights
  // minimum name similarity before two accused can be treated as the same person
  nameGate: number
  // minimum weighted score for a repeat-offender flag
  threshold: number
  // days after which the temporal component has decayed to ~37%
  decayDays: number
}

export type Verdict = 'linked' | 'name_only' | 'mo_only'

export interface NameMatch {
  a: string
  b: string
  similarity: number
  method: string
}

export interface Match {
  key: string
  a: string // fir_reg_no
  b: string
  components: { name: number; moTags: number; moText: number; temporal: number }
  score: number
  verdict: Verdict
  crossDistrict: boolean
  crossState: boolean
  bestName: NameMatch
  otherNames: NameMatch[]
  sharedTags: string[]
  daysApart: number
}

export interface Network {
  id: string
  label: string
  firs: string[]
  nameVariants: string[]
  districts: string[]
  states: string[]
  crimeTypes: string[]
  sharedTags: string[]
  matches: Match[]
  avgScore: number
  firstSeen: string
  lastSeen: string
}
