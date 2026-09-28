import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge, Empty, formatDate, SkeletonRows, Tip } from '../components/ui.tsx'
import { stationTrend, tagLabel, type StationTrend } from '../lib/trends.ts'
import { useStore } from '../state/store.tsx'

const clock = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
const firs = (n: number) => `${n} ${n === 1 ? 'FIR' : 'FIRs'}`

function TrendPanel({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  const { updatedAt } = useStore()
  return (
    <section className={`rounded-lg border border-line bg-surface ${className}`}>
      <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-3.5">
        <h2 className="text-base">{title}</h2>
        {updatedAt && <span className="num text-sm text-muted">Updated {clock.format(updatedAt)}</span>}
      </header>
      <div className="p-5">{children}</div>
    </section>
  )
}

function Change({ trend }: { trend: StationTrend }) {
  const { changePct, previous } = trend
  if (changePct === null) return <p className="mt-1.5 text-[0.9375rem] text-muted">No earlier 90 days to compare against</p>
  // more FIRs is the bad direction, so a rise wears the high-risk colour
  const [Icon, tone, text] = changePct > 0 ? [TrendingUp, 'text-high', `Up ${changePct}%`] : changePct < 0 ? [TrendingDown, 'text-low', `Down ${Math.abs(changePct)}%`] : [Minus, 'text-muted', 'No change']
  return (
    <p className="mt-1.5 flex items-center gap-1.5 text-[0.9375rem]">
      <Icon size={18} className={tone} aria-hidden="true" />
      <span className={`font-semibold ${tone}`}>{text}</span>
      <span className="text-muted">from {previous}</span>
    </p>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  )
}

// One row per item: name, a bar scaled to the largest count, and the count.
function Bars({ rows, empty }: { rows: { key: string; label: ReactNode; count: number; detail: string }[]; empty: string }) {
  if (!rows.length) return <p className="text-muted">{empty}</p>
  const max = Math.max(...rows.map((r) => r.count))
  return (
    <ul className="space-y-3.5">
      {rows.map((r) => (
        <Tip key={r.key} text={r.detail}>
          <li className="grid grid-cols-[minmax(0,10.5rem)_minmax(0,1fr)_2rem] items-center gap-3">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">{r.label}</span>
            <span className="h-3">
              <span className="block h-full min-w-1.5 rounded-full bg-accent" style={{ width: `${(r.count / max) * 100}%` }} />
            </span>
            <span className="num text-right font-semibold">{r.count}</span>
          </li>
        </Tip>
      ))}
    </ul>
  )
}

export function Trends() {
  const { visible, visibleNetworks, asOf, loading } = useStore()
  const stations = useMemo(() => [...new Set(visible.map((f) => f.police_station))].sort(), [visible])
  const [picked, setPicked] = useState('')
  const station = stations.includes(picked) ? picked : stations[0]
  const trend = useMemo(() => (station ? stationTrend(station, visible, visibleNetworks, asOf) : null), [station, visible, visibleNetworks, asOf])

  if (loading) return <SkeletonRows rows={8} />
  if (!trend) return <Empty title="No FIRs in your jurisdiction yet">Station trends appear once FIRs are on record.</Empty>

  const top = trend.byCrimeType[0]
  const isRising = (c: StationTrend['byCrimeType'][number]) => c.recent > c.previous && c.recent >= 2
  const rising = trend.byCrimeType.find(isRising)

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <TrendPanel title="Summary">
        <label className="block">
          <span className="text-[0.9375rem]">Police station</span>
          {stations.length > 1 ? (
            <select className="mt-2 min-h-11 w-full rounded-md border border-line bg-surface px-3 text-base" value={station} onChange={(e) => setPicked(e.target.value)}>
              {stations.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          ) : (
            <span className="mt-1 block text-base font-semibold">{trend.station}</span>
          )}
        </label>

        <p className="num mt-5 text-[2.5rem] font-semibold leading-none">{trend.recent}</p>
        <p className="mt-2 text-[0.9375rem] text-muted">FIRs in the last 90 days</p>
        <Change trend={trend} />

        <dl className="mt-5 space-y-4 border-t border-line pt-5">
          {top && (
            <Fact label="Most frequent">
              {top.type}, {top.count} of {firs(trend.total)}
            </Fact>
          )}
          {rising && (
            <Fact label="Rising">
              {rising.type}, {rising.recent} against {rising.previous}
            </Fact>
          )}
          {trend.repeatPlaces.map((p) => (
            <Fact key={p.place} label="Repeat place">
              {p.place}, {firs(p.count)}
            </Fact>
          ))}
          {trend.linkedNetworks.map((n) => (
            <Fact key={n.id} label="Gang link">
              <Tip text={`A repeat-offender signature seen in ${n.districts.join(', ')}. Coordinate with those stations before closing the case.`}>
                <span>
                  {n.label}, {n.districts.length} {n.districts.length === 1 ? 'district' : 'districts'}
                </span>
              </Tip>
            </Fact>
          ))}
        </dl>

        <p className="mt-5 border-t border-line pt-4 text-sm text-muted">
          {trend.district} district. Based on {firs(trend.total)} up to {formatDate(asOf)}. Written by fixed rules, not a language model.
        </p>
      </TrendPanel>

      <div className="min-w-0 space-y-6">
        <TrendPanel title="FIRs by month">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend.monthly} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--color-line)" />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--color-line)' }} tick={{ fill: 'var(--color-muted)', fontSize: 13 }} interval={1} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: 'var(--color-muted)', fontSize: 13 }} />
                <Tooltip cursor={{ fill: 'var(--color-canvas)' }} formatter={(v) => [`${v} ${v === 1 ? 'FIR' : 'FIRs'}`, 'Occurred']} contentStyle={{ borderRadius: 6, border: '1px solid var(--color-line)' }} />
                <Bar dataKey="count" fill="var(--color-accent)" radius={[3, 3, 0, 0]} maxBarSize={32} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </TrendPanel>

        <div className="grid gap-6 xl:grid-cols-2">
          <TrendPanel title="Offences">
            <Bars
              empty="No offence types read from these FIRs."
              rows={trend.byCrimeType.map((c) => ({
                key: c.type,
                count: c.count,
                detail: `${c.count} in the last 12 months. ${c.recent} in the last 90 days, ${c.previous} in the 90 days before.`,
                label: (
                  <>
                    {c.type}
                    {isRising(c) && <Badge tone="medium">Rising</Badge>}
                  </>
                ),
              }))}
            />
          </TrendPanel>

          <TrendPanel title="Methods">
            <Bars
              empty="No method tags found in these FIRs."
              rows={trend.topTags.map((t) => ({
                key: t.tag,
                count: t.count,
                detail: `${firs(t.count)} mention this method`,
                label: <span className="first-letter:uppercase">{tagLabel(t.tag)}</span>,
              }))}
            />
          </TrendPanel>
        </div>
      </div>
    </div>
  )
}
