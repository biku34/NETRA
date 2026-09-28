import { Link } from 'react-router-dom'
import { networkRisk } from '../lib/matching.ts'
import { scopeLabel } from '../lib/roles.ts'
import { tagLabel } from '../lib/trends.ts'
import type { Evidence, Network, ProcessedFir } from '../lib/types.ts'
import { REVIEW_LABEL, useStore, type ReviewAction } from '../state/store.tsx'
import { Badge, Empty, formatDate, RiskBadge } from './ui.tsx'

export function Restricted({ what }: { what: string }) {
  const { role } = useStore()
  return (
    <Empty title={`${what} is not available to the ${role.short} role`}>
      Your access: {role.access.toLowerCase()}. You can view: {role.canView.toLowerCase()}. Switch role from the account menu at the top right to see this page.
    </Empty>
  )
}

export function EvidenceBadges({ items, tone = 'neutral', label = (s: string) => s }: { items: Evidence[]; tone?: 'neutral' | 'accent'; label?: (s: string) => string }) {
  if (!items.length) return <span className="text-muted">None found</span>
  return (
    <span className="flex flex-wrap gap-1.5">
      {items.map((e) => (
        <Badge key={e.value} tone={tone} title={e.because}>
          {label(e.value)}
        </Badge>
      ))}
    </span>
  )
}

export const TagBadges = ({ items }: { items: Evidence[] }) => <EvidenceBadges items={items} label={tagLabel} />

export function riskReason(n: Network): string {
  return `${n.firs.length} linked FIRs across ${n.districts.length} district${n.districts.length === 1 ? '' : 's'} and ${n.states.length} state${n.states.length === 1 ? '' : 's'}. High: 3 or more districts, or more than one state. Medium: 2 districts. Low: 1 district.`
}

export function NetworkBadge({ network }: { network: Network }) {
  return <RiskBadge level={networkRisk(network)} reason={riskReason(network)} />
}

const REVIEW_TONE: Record<ReviewAction, 'low' | 'high' | 'medium' | 'accent'> = {
  confirmed: 'low',
  rejected: 'high',
  escalated: 'medium',
  linkage_approved: 'low',
  task_force_approved: 'low',
}

export function ReviewStatus({ target }: { target: string }) {
  const { reviews } = useStore()
  const r = reviews[target]
  if (!r) return <Badge title="No officer has reviewed this flag yet. It is a lead, not a finding.">Awaiting review</Badge>
  return (
    <Badge tone={REVIEW_TONE[r.action]} title={`${r.by}, ${formatDate(r.at.slice(0, 10))}`}>
      {REVIEW_LABEL[r.action]}
    </Badge>
  )
}

// A FIR outside the officer's jurisdiction is shown by reference only: enough to act on
// the link, without the narrative or any complainant details.
export function FirReference({ fir }: { fir: ProcessedFir }) {
  const { canOpen, role } = useStore()
  const open = canOpen(fir)
  const heading = (
    <span className="num font-semibold">
      FIR {fir.fir_id}, {fir.police_station} PS
    </span>
  )
  return (
    <div>
      {open ? (
        <Link to={`/fir/case/${fir.fir_reg_no}`} className="text-accent underline underline-offset-2">
          {heading}
        </Link>
      ) : (
        heading
      )}
      <p className="text-sm text-muted">
        {fir.district}, {fir.state}. Occurred {formatDate(fir.occurrence.date)}.
      </p>
      {!open && (
        <p className="mt-1 text-sm text-muted">
          Outside your jurisdiction ({scopeLabel(role.scope)}). Shown by reference only.
        </p>
      )}
    </div>
  )
}
