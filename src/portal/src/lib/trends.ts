import type { Network, ProcessedFir } from './types.ts'

export interface StationTrend {
  station: string
  district: string
  total: number
  recent: number
  previous: number
  changePct: number | null
  monthly: { month: string; label: string; count: number }[]
  byCrimeType: { type: string; count: number; recent: number; previous: number }[]
  repeatPlaces: { place: string; count: number }[]
  topTags: { tag: string; count: number }[]
  linkedNetworks: Network[]
  summary: string[]
}

const DAY = 86_400_000
const WINDOW_DAYS = 90
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const count = <T,>(xs: T[], key: (x: T) => string) => {
  const m = new Map<string, number>()
  for (const x of xs) m.set(key(x), (m.get(key(x)) ?? 0) + 1)
  return [...m].sort((a, b) => b[1] - a[1])
}

export const tagLabel = (tag: string) => tag.replace(/_/g, ' ')

// asOf is the latest FIR date in the dataset, so the windows stay meaningful for demo data.
export function stationTrend(station: string, all: ProcessedFir[], networks: Network[], asOf: string): StationTrend {
  const firs = all.filter((f) => f.police_station === station)
  const end = Date.parse(asOf)
  const age = (f: ProcessedFir) => (end - Date.parse(f.occurrence.date)) / DAY
  const recentFirs = firs.filter((f) => age(f) <= WINDOW_DAYS)
  const previousFirs = firs.filter((f) => age(f) > WINDOW_DAYS && age(f) <= WINDOW_DAYS * 2)

  const monthly: StationTrend['monthly'] = []
  const cursor = new Date(end)
  cursor.setUTCDate(1)
  cursor.setUTCMonth(cursor.getUTCMonth() - 11)
  for (let i = 0; i < 12; i++) {
    const month = cursor.toISOString().slice(0, 7)
    monthly.push({
      month,
      label: `${MONTHS[cursor.getUTCMonth()]} ${String(cursor.getUTCFullYear()).slice(2)}`,
      count: firs.filter((f) => f.occurrence.date.startsWith(month)).length,
    })
    cursor.setUTCMonth(cursor.getUTCMonth() + 1)
  }

  const types = (xs: ProcessedFir[]) => xs.flatMap((f) => f.extraction.crime_types.map((c) => c.value))
  const recentTypes = new Map(count(types(recentFirs), (t) => t))
  const previousTypes = new Map(count(types(previousFirs), (t) => t))
  const byCrimeType = count(types(firs), (t) => t).map(([type, n]) => ({
    type,
    count: n,
    recent: recentTypes.get(type) ?? 0,
    previous: previousTypes.get(type) ?? 0,
  }))

  const repeatPlaces = count(firs, (f) => f.occurrence.place).filter(([, n]) => n > 1).map(([place, n]) => ({ place, count: n }))
  const topTags = count(firs.flatMap((f) => f.extraction.mo_tags.map((t) => t.value)), (t) => t).slice(0, 6).map(([tag, n]) => ({ tag, count: n }))
  const ids = new Set(firs.map((f) => f.fir_reg_no))
  const linkedNetworks = networks.filter((n) => n.firs.some((id) => ids.has(id)))

  const recent = recentFirs.length
  const previous = previousFirs.length
  const changePct = previous ? Math.round(((recent - previous) / previous) * 100) : null

  const summary: string[] = []
  if (!firs.length) {
    summary.push(`No FIRs on record for ${station} PS.`)
  } else {
    const direction = changePct === null ? 'no earlier period to compare against' : changePct > 0 ? `up ${changePct}% on the 90 days before` : changePct < 0 ? `down ${Math.abs(changePct)}% on the 90 days before` : 'unchanged from the 90 days before'
    summary.push(`${recent} FIRs registered in the last 90 days, ${direction} (${previous}).`)
    const top = byCrimeType[0]
    if (top) summary.push(`${top.type} is the most frequent offence: ${top.count} of ${firs.length} FIRs in the last 12 months.`)
    const rising = byCrimeType.filter((c) => c.recent > c.previous && c.recent >= 2)[0]
    if (rising) summary.push(`${rising.type} is rising: ${rising.recent} cases in the last 90 days against ${rising.previous} before.`)
    if (repeatPlaces[0]) summary.push(`${repeatPlaces[0].place} has ${repeatPlaces[0].count} FIRs. Consider a fixed evening picket or CCTV check there.`)
    for (const n of linkedNetworks) {
      summary.push(`One FIR here is linked to "${n.label}", a repeat-offender signature seen in ${n.districts.length} districts (${n.districts.join(', ')}). Coordinate with those stations before closing the case.`)
    }
  }

  return { station, district: firs[0]?.district ?? '', total: firs.length, recent, previous, changePct, monthly, byCrimeType, repeatPlaces, topTags, linkedNetworks, summary }
}
