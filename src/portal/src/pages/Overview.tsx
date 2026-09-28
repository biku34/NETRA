import { Link } from 'react-router-dom'
import { PageTitle } from '../components/Layout.tsx'
import { NetworkBadge, ReviewStatus } from '../components/shared.tsx'
import { Empty, formatDate, Panel, SkeletonRows } from '../components/ui.tsx'
import { scopeLabel } from '../lib/roles.ts'
import { networkKey, useStore } from '../state/store.tsx'
import { StatePicture } from './StatePicture.tsx'

export function Overview() {
  const { role, visible, visibleNetworks, loading, asOf } = useStore()

  // state-level command sees outcomes and connections, not case lists
  if (role.can.firDetails && role.scope.kind === 'state') return <StatePicture />

  if (!role.can.firDetails) {
    return (
      <>
        <PageTitle title={`Welcome, ${role.persona}`}>{role.posting}</PageTitle>
        <Empty title={role.id === 'admin' ? 'Case data is hidden from the System Admin role' : 'Your patrol brief will appear here'}>
          {role.id === 'admin' ? 'Open Settings to manage scoring thresholds and review the audit trail.' : 'Beat hotspots and patrol briefs are in the Hotspots module. FIR details are not available to this role.'}
        </Empty>
      </>
    )
  }

  const types = new Map<string, number>()
  for (const f of visible) for (const c of f.extraction.crime_types) types.set(c.value, (types.get(c.value) ?? 0) + 1)
  const top = [...types].sort((a, b) => b[1] - a[1]).slice(0, 6)
  const max = top[0]?.[1] ?? 1
  const flagged = new Set(visibleNetworks.flatMap((n) => n.firs))

  return (
    <>
      <PageTitle title={`Welcome, ${role.persona}`}>
        {scopeLabel(role.scope)}. {loading ? 'Reading FIRs.' : `${visible.length} FIRs on record up to ${formatDate(asOf)}, ${visible.filter((f) => flagged.has(f.fir_reg_no)).length} of them linked to a repeat offender.`}
      </PageTitle>

      <div className="space-y-6">
        <Panel title="Needs your attention" note="Accused who appear again in other stations">
          {loading ? (
            <SkeletonRows rows={3} />
          ) : visibleNetworks.length ? (
            <ul className="divide-y divide-line">
              {visibleNetworks.map((n) => (
                <li key={n.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="font-semibold">{n.label}</p>
                    <p className="text-[0.9375rem] text-muted">
                      {n.firs.length} FIRs in {n.districts.join(', ')}. {n.crimeTypes.slice(0, 2).join(', ')}. Latest {formatDate(n.lastSeen)}.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <NetworkBadge network={n} />
                    <ReviewStatus target={networkKey(n)} />
                    <Link to="/fir/networks" className="ml-2 font-semibold text-accent underline underline-offset-2">
                      Review
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">No repeat offenders found in your jurisdiction.</p>
          )}
        </Panel>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Offence types" note="FIRs in your jurisdiction. One FIR can have several types.">
            {loading ? (
              <SkeletonRows rows={5} />
            ) : (
              <ul className="space-y-3">
                {top.map(([type, n]) => (
                  <li key={type}>
                    <div className="flex justify-between gap-4 text-[0.9375rem]">
                      <span>{type}</span>
                      <span className="num font-semibold">{n}</span>
                    </div>
                    <div className="mt-1 h-2 rounded-sm bg-canvas">
                      <div className="h-full rounded-sm bg-accent" style={{ width: `${(n / max) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Latest FIRs" action={<Link to="/fir" className="font-semibold text-accent underline underline-offset-2">All cases</Link>}>
            {loading ? (
              <SkeletonRows rows={5} />
            ) : (
              <ul className="divide-y divide-line">
                {visible.slice(0, 5).map((f) => (
                  <li key={f.fir_reg_no} className="py-2.5 first:pt-0 last:pb-0">
                    <Link to={`/fir/case/${f.fir_reg_no}`} className="block hover:text-accent">
                      <span className="num font-semibold">FIR {f.fir_id}</span> <span className="text-muted">{f.police_station} PS, {formatDate(f.date_of_fir)}</span>
                      <span className="block text-[0.9375rem]">{f.extraction.crime_types.map((c) => c.value).join(', ')}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  )
}

export function ComingSoon({ title, children }: { title: string; children: string }) {
  return (
    <>
      <PageTitle title={title} />
      <Empty title="This module is not built yet">{children}</Empty>
    </>
  )
}
