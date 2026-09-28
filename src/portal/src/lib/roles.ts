import roles from '../../shared/roles.json' with { type: 'json' }
import type { Fir } from './types.ts'

export type RoleId = 'constable' | 'si' | 'sho' | 'dysp' | 'sp' | 'ig' | 'admin'

export type Scope =
  | { kind: 'none' }
  | { kind: 'beat'; station: string; beat: string }
  | { kind: 'assigned'; station: string; officer: string }
  | { kind: 'station'; station: string }
  | { kind: 'circle'; name: string; stations: string[] }
  | { kind: 'district'; district: string }
  | { kind: 'state'; state: string }

export interface Permissions {
  firDetails: boolean
  reviewMatch: boolean // confirm or reject an AI-flagged match
  addNotes: boolean
  escalate: boolean // escalate a flagged pattern to district
  approveLinkage: boolean // approve cross-station gang linkage
  approveTaskForce: boolean // approve inter-district task force alert
  ingest: boolean // upload new FIRs
  assistant: boolean // ask the records assistant
  editScoring: boolean
  viewAudit: boolean
}

export interface RoleDef {
  id: RoleId
  title: string
  short: string
  // demo officer shown in the header while this role is active
  persona: string
  posting: string
  scope: Scope
  access: string
  canView: string
  canDo: string
  cannot: string
  can: Permissions
}

const NONE: Permissions = { firDetails: false, reviewMatch: false, addNotes: false, escalate: false, approveLinkage: false, approveTaskForce: false, ingest: false, assistant: false, editScoring: false, viewAudit: false }

// Roles live in shared/roles.json so the backend enforces exactly what the UI shows.
export const ROLES: RoleDef[] = roles.map((r) => ({
  ...r,
  id: r.id as RoleId,
  scope: r.scope as Scope,
  can: { ...NONE, ...Object.fromEntries(r.can.map((p) => [p, true])) },
}))

export const roleById = (id: RoleId) => ROLES.find((r) => r.id === id) ?? ROLES[1]

export function inScope(scope: Scope, fir: Fir): boolean {
  switch (scope.kind) {
    case 'assigned':
      return fir.police_station === scope.station && fir.investigating_officer.name === scope.officer
    case 'station':
      return fir.police_station === scope.station
    case 'circle':
      return scope.stations.includes(fir.police_station)
    case 'district':
      return fir.district === scope.district
    case 'state':
      return fir.state === scope.state
    default:
      return false
  }
}

export function scopeLabel(scope: Scope): string {
  switch (scope.kind) {
    case 'beat':
      return `${scope.beat}, ${scope.station} PS`
    case 'assigned':
      return `Cases assigned to you at ${scope.station} PS`
    case 'station':
      return `${scope.station} PS`
    case 'circle':
      return `${scope.name} (${scope.stations.join(', ')})`
    case 'district':
      return `${scope.district} district`
    case 'state':
      return scope.state
    default:
      return 'No case data'
  }
}
