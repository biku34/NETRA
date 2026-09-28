import clsx from 'clsx'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { PageTitle } from '../components/Layout.tsx'
import { NetworkBadge, Restricted } from '../components/shared.tsx'
import { Badge, Empty, formatDate, Panel, SkeletonRows } from '../components/ui.tsx'
import { scopeLabel } from '../lib/roles.ts'
import { useStore } from '../state/store.tsx'

const TABS = [
  { to: '/fir', label: 'Cases', end: true },
  { to: '/fir/networks', label: 'Linked offenders', end: false },
  { to: '/fir/trends', label: 'Station trends', end: false },
]

export function FirPage() {
  const { role } = useStore()
  if (!role.can.firDetails) {
    return (
      <>
        <PageTitle title="FIR intelligence" />
        <Restricted what="FIR intelligence" />
      </>
    )
  }
  return (
    <>
      <PageTitle title="FIR intelligence">Offence types, people and methods read from each FIR, and accused who appear again in other stations.</PageTitle>
      <nav aria-label="FIR sections" className="mb-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => clsx('-mb-px min-h-11 whitespace-nowrap border-b-2 px-3 py-2.5 text-base sm:px-4', isActive ? 'border-accent font-semibold text-accent' : 'border-transparent text-muted hover:text-ink')}>
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  )
}

const LANGUAGE = { en: 'English', hi: 'Hindi', bn: 'Bengali', gu: 'Gujarati' }

export function FirList() {
  const { visible, visibleNetworks, loading, role } = useStore()
  const [query, setQuery] = useState('')
  const [type, setType] = useState('')
  const [flaggedOnly, setFlaggedOnly] = useState(false)

  const networkOf = useMemo(() => new Map(visibleNetworks.flatMap((n) => n.firs.map((id) => [id, n] as const))), [visibleNetworks])
  const types = useMemo(() => [...new Set(visible.flatMap((f) => f.extraction.crime_types.map((c) => c.value)))].sort(), [visible])

  const q = query.trim().toLowerCase()
  const rows = visible.filter((f) => {
    if (type && !f.extraction.crime_types.some((c) => c.value === type)) return false
    if (flaggedOnly && !networkOf.has(f.fir_reg_no)) return false
    if (!q) return true
    return [f.fir_id, f.police_station, f.district, f.occurrence.place, ...f.accused.map((a) => a.name)].some((s) => s.toLowerCase().includes(q))
  })

  const control = 'min-h-11 rounded-md border border-line bg-surface px-3 text-base'
  return (
    <Panel title={`${rows.length} of ${visible.length} FIRs`} note={scopeLabel(role.scope)}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="relative min-w-56 flex-1">
          <span className="sr-only">Search FIRs</span>
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input className={clsx(control, 'w-full pl-10')} placeholder="Search FIR number, accused or place" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label>
          <span className="sr-only">Offence type</span>
          <select className={control} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All offence types</option>
            {types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-base">
          <input type="checkbox" className="h-5 w-5 accent-accent" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} />
          Repeat offenders only
        </label>
      </div>

      {loading ? (
        <SkeletonRows rows={6} />
      ) : !rows.length ? (
        <Empty title={visible.length ? 'No FIRs match these filters' : 'No FIRs in your jurisdiction yet'}>{visible.length ? 'Clear the search or choose a different offence type.' : undefined}</Empty>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {rows.map((f) => {
            const network = networkOf.get(f.fir_reg_no)
            const named = f.extraction.accused.filter((a) => a.identified)
            return (
              <li key={f.fir_reg_no}>
                <Link to={`/fir/case/${f.fir_reg_no}`} className="grid gap-x-6 gap-y-1.5 px-2 py-3.5 hover:bg-canvas sm:grid-cols-[9rem_1fr_auto]">
                  <div>
                    <p className="num font-semibold text-accent">FIR {f.fir_id}</p>
                    <p className="num text-sm text-muted">{formatDate(f.date_of_fir)}</p>
                  </div>
                  <div className="min-w-0">
                    <p>
                      {f.extraction.crime_types.map((c) => c.value).join(', ') || 'Unclassified'}
                      <span className="text-muted">
                        {' '}
                        at {f.police_station} PS, {f.district}
                      </span>
                    </p>
                    <p className="truncate text-sm text-muted">Accused: {named.length ? named.map((a) => a.name).join(', ') : 'not identified'}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                    {f.language !== 'en' && <Badge title={`FIR text is written in ${LANGUAGE[f.language]}`}>{LANGUAGE[f.language]}</Badge>}
                    {network && (
                      <>
                        <Badge tone="accent" title={`Accused matches ${network.firs.length - 1} other FIR${network.firs.length > 2 ? 's' : ''}: ${network.districts.join(', ')}`}>
                          Repeat offender
                        </Badge>
                        <NetworkBadge network={network} />
                      </>
                    )}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
