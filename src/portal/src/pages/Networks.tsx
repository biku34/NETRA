import { ScoreBar } from '../components/ScoreBreakdown.tsx'
import { FirReference, NetworkBadge, ReviewStatus } from '../components/shared.tsx'
import { Badge, Button, Empty, Field, formatDate, Panel, SkeletonRows } from '../components/ui.tsx'
import { tagLabel } from '../lib/trends.ts'
import type { Network } from '../lib/types.ts'
import { networkKey, useStore, type ReviewAction } from '../state/store.tsx'

// FIRs placed on a circle; line thickness is the match score between the two FIRs.
function Graph({ network }: { network: Network }) {
  const { byId, visible } = useStore()
  const mine = new Set(visible.map((f) => f.fir_reg_no))
  const W = 520
  const H = 300
  const pos = new Map(
    network.firs.map((id, i) => {
      const a = (i / network.firs.length) * Math.PI * 2 - Math.PI / 2
      return [id, { x: W / 2 + Math.cos(a) * 100, y: H / 2 + Math.sin(a) * 100, a }] as const
    }),
  )
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${network.firs.length} linked FIRs across ${network.districts.join(', ')}`}>
      {network.matches.map((m) => {
        const p = pos.get(m.a)!
        const q = pos.get(m.b)!
        return <line key={m.key} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke="var(--color-seg-3)" strokeWidth={1 + (m.score - 0.6) * 10} strokeLinecap="round" />
      })}
      {network.firs.map((id) => {
        const p = pos.get(id)!
        const f = byId.get(id)!
        const right = Math.cos(p.a) > 0.3
        const left = Math.cos(p.a) < -0.3
        const dy = Math.sin(p.a) > 0.3 ? 30 : Math.sin(p.a) < -0.3 ? -34 : 0
        return (
          <g key={id}>
            <circle cx={p.x} cy={p.y} r={11} fill={mine.has(id) ? 'var(--color-accent)' : 'var(--color-surface)'} stroke="var(--color-accent)" strokeWidth={2.5} />
            <text x={p.x + (right ? 18 : left ? -18 : 0)} y={p.y + dy} textAnchor={right ? 'start' : left ? 'end' : 'middle'} fontSize={13} fill="var(--color-ink)">
              <tspan fontWeight={600}>{f.police_station}</tspan>
              <tspan x={p.x + (right ? 18 : left ? -18 : 0)} dy={15} fill="var(--color-muted)">
                {f.district}
              </tspan>
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function Actions({ network }: { network: Network }) {
  const { role, review, reviews } = useStore()
  const key = networkKey(network)
  const done = reviews[key]?.action
  const label = `${network.label} (${network.districts.join(', ')})`
  const options: [boolean, ReviewAction, string][] = [
    [role.can.escalate, 'escalated', 'Escalate to district'],
    [role.can.approveLinkage, 'linkage_approved', 'Approve cross-station linkage'],
    [role.can.approveTaskForce, 'task_force_approved', 'Approve task force alert'],
  ]
  const allowed = options.filter(([can]) => can)
  if (!allowed.length) return null
  return (
    <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
      {allowed.map(([, action, text]) => (
        <Button key={action} variant="primary" disabled={done === action} onClick={() => review(key, action, label)}>
          {text}
        </Button>
      ))}
    </div>
  )
}

export function Networks() {
  const { visibleNetworks, byId, config, loading } = useStore()
  if (loading) return <SkeletonRows rows={6} />
  if (!visibleNetworks.length) {
    return <Empty title="No repeat offenders found in your jurisdiction">The system compares every identified accused against FIRs from all stations. Matches will appear here.</Empty>
  }
  return (
    <div className="space-y-6">
      {visibleNetworks.map((n) => (
        <Panel
          key={n.id}
          title={n.label}
          note={`${n.firs.length} FIRs, ${formatDate(n.firstSeen)} to ${formatDate(n.lastSeen)}`}
          action={
            <span className="flex flex-wrap gap-1.5">
              <NetworkBadge network={n} />
              <ReviewStatus target={networkKey(n)} />
            </span>
          }
        >
          <div className="grid gap-6 lg:grid-cols-[1fr_27rem]">
            <dl className="space-y-4">
              <Field label="Why these FIRs are linked">
                The same accused name appears in {n.firs.length} FIRs in {n.districts.join(', ')}, each time with the same method. Average match score {n.avgScore.toFixed(2)}, threshold {config.threshold.toFixed(2)}.
              </Field>
              <Field label="Names matched across the FIRs (accused and co-accused)">
                <span className="flex flex-wrap gap-1.5">
                  {n.nameVariants.map((v) => (
                    <Badge key={v}>{v}</Badge>
                  ))}
                </span>
              </Field>
              <Field label="Method common to the FIRs">
                <span className="flex flex-wrap gap-1.5">
                  {n.sharedTags.map((t) => (
                    <Badge key={t} tone="accent">
                      {tagLabel(t)}
                    </Badge>
                  ))}
                </span>
              </Field>
              <Field label="Offence types">{n.crimeTypes.join(', ')}</Field>
            </dl>
            <figure>
              <Graph network={n} />
              <figcaption className="text-sm text-muted">Filled circles are FIRs in your jurisdiction. Thicker lines are stronger matches.</figcaption>
            </figure>
          </div>

          <h3 className="mt-6 text-base">FIRs in date order</h3>
          <ol className="mt-2 divide-y divide-line border-y border-line">
            {n.firs.map((id, i) => {
              const f = byId.get(id)!
              // strongest link from this FIR to any earlier FIR in the network
              const link = n.matches.filter((m) => (m.a === id && n.firs.indexOf(m.b) < i) || (m.b === id && n.firs.indexOf(m.a) < i)).sort((a, b) => b.score - a.score)[0]
              return (
                <li key={id} className="grid gap-x-6 gap-y-2 py-3 sm:grid-cols-[1fr_1fr_8rem]">
                  <FirReference fir={f} />
                  <p className="text-[0.9375rem]">{link ? `Matches an earlier FIR with score ${link.score.toFixed(2)}: ${link.bestName.method}.` : 'First FIR in this series.'}</p>
                  <div className="self-center">{link && <ScoreBar match={link} config={config} />}</div>
                </li>
              )
            })}
          </ol>
          <Actions network={n} />
        </Panel>
      ))}
    </div>
  )
}
