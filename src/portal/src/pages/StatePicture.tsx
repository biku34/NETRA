import clsx from 'clsx'
import { Check } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { GangMap, MapLegend, type MapGang } from '../components/GangMap.tsx'
import { NetworkBadge } from '../components/shared.tsx'
import { Badge, Button, formatDate, Panel, Skeleton, Tip } from '../components/ui.tsx'
import { methodPatterns, relatedByMethod, seriesColour } from '../lib/patterns.ts'
import { tagLabel } from '../lib/trends.ts'
import type { ProcessedFir } from '../lib/types.ts'
import { networkKey, useStore, type ReviewAction, type Step } from '../state/store.tsx'
import { PersonLink } from './PersonProfile.tsx'

const DAY = 86_400_000
const short = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const day = (iso: string) => short.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`))

function Tile({ label, value, note, tone }: { label: string; value: number; note: string; tone?: 'high' }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-5 py-4">
      <p className="text-[0.9375rem] text-muted">{label}</p>
      <p className={clsx('num mt-1 text-4xl font-semibold leading-none', tone === 'high' && value > 0 && 'text-high')}>{value}</p>
      <p className="mt-2 text-sm text-muted">{note}</p>
    </div>
  )
}

const STAGES: { action: ReviewAction | 'detected' | 'confirmed_links'; label: string; who: string }[] = [
  { action: 'detected', label: 'Detected', who: 'System' },
  { action: 'confirmed_links', label: 'Links confirmed', who: 'Investigating officers' },
  { action: 'escalated', label: 'Escalated', who: 'SHO' },
  { action: 'linkage_approved', label: 'Linkage approved', who: 'DySP' },
  { action: 'task_force_approved', label: 'Task force', who: 'IG' },
]

// The chain of decisions on one gang. A filled step shows who took it and when on hover.
function Pipeline({ done }: { done: Map<string, string> }) {
  return (
    <ol className="grid grid-cols-5 gap-1">
      {STAGES.map((s, i) => {
        const detail = done.get(s.action)
        return (
          <Tip key={s.action} text={detail ?? `Waiting for: ${s.who}`}>
            <li className="min-w-0" tabIndex={0}>
              <div className="flex items-center">
                <span className={clsx('grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 text-white', detail ? 'border-low bg-low' : 'border-line bg-surface')}>{detail && <Check size={14} strokeWidth={3} aria-hidden="true" />}</span>
                {i < STAGES.length - 1 && <span className={clsx('h-0.5 flex-1', done.get(STAGES[i + 1].action) ? 'bg-low' : 'bg-line')} />}
              </div>
              <p className={clsx('mt-1.5 pr-1 text-sm leading-tight', detail ? 'text-ink' : 'text-muted')}>{s.label}</p>
            </li>
          </Tip>
        )
      })}
    </ol>
  )
}

// One dot per FIR along the gang's active period, so the tempo is visible at a glance.
function Tempo({ firs, colour }: { firs: ProcessedFir[]; colour: string }) {
  const start = Date.parse(firs[0].occurrence.date)
  const span = Math.max(DAY, Date.parse(firs[firs.length - 1].occurrence.date) - start)
  return (
    <div>
      <div className="relative mx-2 h-6">
        <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-line" />
        {firs.map((f) => (
          <Tip key={f.fir_reg_no} text={`${f.police_station} PS, ${f.district}. ${formatDate(f.occurrence.date)}`}>
            <span tabIndex={0} className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface" style={{ left: `${((Date.parse(f.occurrence.date) - start) / span) * 100}%`, background: colour }} />
          </Tip>
        ))}
      </div>
      <div className="num flex justify-between text-sm text-muted">
        <span>{day(firs[0].occurrence.date)}</span>
        <span>{day(firs[firs.length - 1].occurrence.date)}</span>
      </div>
    </div>
  )
}

function GangCard({ gang, index, selected, onSelect }: { gang: MapGang; index: number; selected: boolean; onSelect: () => void }) {
  const { byId, steps, review, asOf, persons } = useStore()
  const { network, related } = gang
  const key = networkKey(network)
  const firs = network.firs.map((id) => byId.get(id)!).filter(Boolean)
  const colour = seriesColour(index)

  const done = new Map<string, string>([['detected', `${network.firs.length} FIRs linked by the scoring engine, average score ${network.avgScore.toFixed(2)}`]])
  const confirmed = network.matches.filter((m) => steps[m.key]?.some((s) => s.action === 'confirmed'))
  if (confirmed.length) done.set('confirmed_links', `${confirmed.length} of ${network.matches.length} links confirmed by investigating officers`)
  for (const s of steps[key] ?? []) done.set(s.action, `${s.by}, ${formatDate(s.at.slice(0, 10))}`)
  const approved: Step | undefined = steps[key]?.find((s) => s.action === 'task_force_approved')

  const idle = Math.round((Date.parse(asOf) - Date.parse(network.lastSeen)) / DAY)
  const stations = [...new Set(firs.map((f) => `${f.police_station} PS`))]
  const facts = [
    [network.firs.length, 'FIRs'],
    [network.districts.length, 'districts'],
    [network.states.length, network.states.length === 1 ? 'state' : 'states'],
    [related.length, 'same-method FIRs'],
  ] as const

  return (
    <article className={clsx('rounded-lg border bg-surface p-5', selected ? 'border-accent ring-1 ring-accent' : 'border-line')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button type="button" onClick={onSelect} className="flex items-center gap-2.5 text-left" aria-pressed={selected}>
          <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: colour }} />
          <span className="text-lg font-semibold leading-tight">{network.label}</span>
        </button>
        <NetworkBadge network={network} />
      </div>
      <p className="mt-1 text-[0.9375rem] text-muted">
        {network.crimeTypes.slice(0, 2).join(', ')}. Last offence {idle} days ago.
      </p>

      <dl className="mt-4 grid grid-cols-4 gap-2">
        {facts.map(([n, label]) => (
          <div key={label}>
            <dd className="num text-2xl font-semibold leading-none">{n}</dd>
            <dt className="mt-1 text-sm leading-tight text-muted">{label}</dt>
          </div>
        ))}
      </dl>

      <div className="mt-5">
        <Tempo firs={firs} colour={colour} />
      </div>

      <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.9375rem]">
        <span className="text-muted">People:</span>
        {persons
          .filter((p) => p.firs.some((id) => network.firs.includes(id)))
          .map((p) => (
            <PersonLink key={p.id} person={p}>
              {p.name} ({p.firs.length})
            </PersonLink>
          ))}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {network.sharedTags.slice(0, 5).map((t) => (
          <Badge key={t}>{tagLabel(t)}</Badge>
        ))}
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <Pipeline done={done} />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        {approved ? (
          <div>
            <p className="flex items-center gap-2 font-semibold text-low">
              <Check size={18} strokeWidth={3} aria-hidden="true" />
              Task force alert approved
            </p>
            <p className="mt-1 text-sm text-muted">Stations to coordinate: {stations.join(', ')}</p>
          </div>
        ) : (
          <Button variant="primary" onClick={() => review(key, 'task_force_approved', `${network.label} (${network.districts.join(', ')})`)}>
            Approve task force alert
          </Button>
        )}
        <Link to="/fir/networks" className="font-semibold text-accent underline underline-offset-2">
          Evidence
        </Link>
      </div>
    </article>
  )
}

// Every note written on a FIR in the state, by any rank, newest first.
function FieldNotes() {
  const { notes, byId, visibleNetworks } = useStore()
  const [all, setAll] = useState(false)
  const gangOf = new Map(visibleNetworks.flatMap((n) => n.firs.map((id) => [id, n.label] as const)))
  const flat = Object.entries(notes)
    .flatMap(([reg, list]) => list.map((n) => ({ ...n, reg })))
    .sort((a, b) => b.at.localeCompare(a.at))
  const shown = all ? flat : flat.slice(0, 5)
  return (
    <Panel title="Notes from officers" note={`${flat.length} ${flat.length === 1 ? 'note' : 'notes'} across all ranks, newest first`}>
      {flat.length ? (
        <>
          <ul className="divide-y divide-line">
            {shown.map((n) => {
              const f = byId.get(n.reg)
              return (
                <li key={`${n.reg}-${n.at}-${n.by}`} className="grid gap-x-6 gap-y-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[13rem_1fr]">
                  <div>
                    <p className="font-semibold leading-tight">{n.by}</p>
                    <p className="text-sm text-muted">
                      {n.role && `${n.role}, `}
                      {day(n.at)}
                    </p>
                  </div>
                  <div>
                    <p>{n.text}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                      {f && (
                        <Link to={`/fir/case/${n.reg}`} className="num text-accent underline underline-offset-2">
                          FIR {f.fir_id}, {f.police_station} PS
                        </Link>
                      )}
                      {gangOf.has(n.reg) && <Badge tone="accent">{gangOf.get(n.reg)}</Badge>}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
          {flat.length > 5 && (
            <Button className="mt-4" onClick={() => setAll(!all)} aria-expanded={all}>
              {all ? 'Show latest 5' : `Show all ${flat.length} notes`}
            </Button>
          )}
        </>
      ) : (
        <p className="text-muted">No notes yet. Notes added on any FIR by any rank appear here.</p>
      )}
    </Panel>
  )
}

function DistrictBars({ firs, linked }: { firs: ProcessedFir[]; linked: Set<string> }) {
  const rows = useMemo(() => {
    const m = new Map<string, { total: number; linked: number }>()
    for (const f of firs) {
      const r = m.get(f.district) ?? { total: 0, linked: 0 }
      r.total++
      if (linked.has(f.fir_reg_no)) r.linked++
      m.set(f.district, r)
    }
    return [...m].map(([district, r]) => ({ district, ...r })).sort((a, b) => b.total - a.total).slice(0, 8)
  }, [firs, linked])
  const max = Math.max(1, ...rows.map((r) => r.total))
  return (
    <div>
      <ul className="mb-4 flex gap-5 text-sm text-muted">
        <li className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-accent" />
          Linked to a gang
        </li>
        <li className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-seg-3" />
          Other FIRs
        </li>
      </ul>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <Tip key={r.district} text={`${r.district}: ${r.total} FIRs, ${r.linked} linked to a gang`}>
            <li className="grid grid-cols-[8.5rem_1fr_1.5rem] items-center gap-3 text-[0.9375rem]" tabIndex={0}>
              <span className="truncate">{r.district}</span>
              <span className="flex h-3.5 gap-0.5">
                {r.linked > 0 && <span className="rounded-sm bg-accent" style={{ width: `${(r.linked / max) * 100}%` }} />}
                {r.total > r.linked && <span className="rounded-sm bg-seg-3" style={{ width: `${((r.total - r.linked) / max) * 100}%` }} />}
              </span>
              <span className="num text-right font-semibold">{r.total}</span>
            </li>
          </Tip>
        ))}
      </ul>
    </div>
  )
}

export function StatePicture() {
  const { visible, visibleNetworks, matches, byId, steps, loading } = useStore()
  const [picked, setPicked] = useState<string | null>(null)
  const select = useCallback((id: string | null) => setPicked((now) => (now === id ? null : id)), [])

  const gangs = useMemo<MapGang[]>(() => visibleNetworks.map((network) => ({ network, related: relatedByMethod(network, matches, byId) })), [visibleNetworks, matches, byId])
  const patterns = useMemo(() => methodPatterns(visible, matches, visibleNetworks), [visible, matches, visibleNetworks])
  const linked = useMemo(() => new Set(visibleNetworks.flatMap((n) => n.firs)), [visibleNetworks])
  const others = useMemo(() => {
    const drawn = new Set([...linked, ...gangs.flatMap((g) => g.related.map((r) => r.fir.fir_reg_no)), ...patterns.flatMap((p) => p.firs.map((f) => f.fir_reg_no))])
    return visible.filter((f) => !drawn.has(f.fir_reg_no))
  }, [visible, linked, gangs, patterns])

  const waiting = visibleNetworks.filter((n) => !steps[networkKey(n)]?.some((s) => s.action === 'task_force_approved')).length
  const districts = new Set(visibleNetworks.flatMap((n) => n.districts)).size
  const selected = gangs.some((g) => g.network.id === picked) ? picked : null

  return (
    <>
      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
          <Skeleton className="h-[26rem]" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Tile label="Waiting for your decision" value={waiting} note="Gangs without a task force alert" tone="high" />
            <Tile label="Gangs detected" value={visibleNetworks.length} note="Same accused in several stations" />
            <Tile label="Districts affected" value={districts} note="Including other states" />
            <Tile label="FIRs linked to a gang" value={visible.filter((f) => linked.has(f.fir_reg_no)).length} note={`Of ${visible.length} FIRs in the state`} />
          </div>

          <Panel title="Where the gangs operate" note="Select a gang to highlight it. Hover a point for the FIR.">
            <GangMap gangs={gangs} patterns={patterns} others={others} byId={byId} selected={selected} onSelect={select} />
            <MapLegend gangs={gangs} hasPatterns={patterns.length > 0} />
          </Panel>

          {gangs.length > 0 && (
            <div className="grid gap-6 lg:grid-cols-2">
              {gangs.map((g, i) => (
                <GangCard key={g.network.id} gang={g} index={i} selected={selected === g.network.id} onSelect={() => select(g.network.id)} />
              ))}
            </div>
          )}

          <FieldNotes />

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="FIRs by district">
              <DistrictBars firs={visible} linked={linked} />
            </Panel>

            <Panel title="Repeated methods" note="Same method in three or more FIRs, accused not identified">
              {patterns.length ? (
                <ul className="divide-y divide-line">
                  {patterns.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
                      <span className="flex flex-wrap gap-1.5">
                        {p.tags.map((t) => (
                          <Badge key={t} tone="accent">
                            {tagLabel(t)}
                          </Badge>
                        ))}
                      </span>
                      <span className="text-[0.9375rem]">
                        <span className="num font-semibold">{p.firs.length} FIRs</span>
                        <span className="text-muted">
                          {' '}
                          in {p.districts.join(', ')}. Latest {day(p.lastSeen)}.
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">No method repeats three times without an identified accused.</p>
              )}
            </Panel>
          </div>
        </div>
      )}
    </>
  )
}
