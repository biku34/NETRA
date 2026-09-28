import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import rawFirs from '../data/firs.json'
import { api, ApiError, Unreachable, type EngineInfo, type Snapshot } from '../lib/api.ts'
import { activeExtractor } from '../lib/extract.ts'
import { buildNetworks, DEFAULT_CONFIG, findMatches } from '../lib/matching.ts'
import { buildPersons, type Person } from '../lib/persons.ts'
import { inScope, roleById, type RoleDef, type RoleId } from '../lib/roles.ts'
import type { Fir, Match, Network, ProcessedFir, ScoringConfig } from '../lib/types.ts'

export type ReviewAction = 'confirmed' | 'rejected' | 'escalated' | 'linkage_approved' | 'task_force_approved'

export interface AuditEntry {
  at: string
  by: string
  role: string
  action: string
  target: string
}

export interface Note {
  at: string
  by: string
  // rank of the officer who wrote it
  role: string
  text: string
}

export interface Step {
  action: ReviewAction
  by: string
  role: string
  at: string
}

type Reviews = Record<string, { action: ReviewAction; by: string; at: string }>
type Steps = Record<string, Step[]>

const OPPOSITE: Partial<Record<ReviewAction, ReviewAction>> = { confirmed: 'rejected', rejected: 'confirmed' }

interface Persisted {
  signedIn: boolean
  // null while working on this device without the service
  token: string | null
  roleId: RoleId
  config: ScoringConfig
  // every decision taken on each flag, oldest first
  steps: Steps
  notes: Record<string, Note[]>
  audit: AuditEntry[]
}

export type Source = 'service' | 'device'

interface Store extends Persisted {
  // latest decision on each flag
  reviews: Reviews
  role: RoleDef
  loading: boolean
  updatedAt: Date | null
  asOf: string
  source: Source
  engine: EngineInfo
  error: string
  firs: ProcessedFir[]
  matches: Match[]
  networks: Network[]
  persons: Person[]
  visible: ProcessedFir[]
  visibleNetworks: Network[]
  byId: Map<string, ProcessedFir>
  canOpen: (fir: Fir) => boolean
  signIn: (id: string, password: string) => Promise<boolean>
  signOut: () => void
  setRole: (id: RoleId) => void
  setConfig: (c: ScoringConfig) => void
  review: (target: string, action: ReviewAction, label: string) => void
  addNote: (firId: string, text: string) => void
  refresh: () => void
}

const KEY = 'netra.state.v3'
const DEFAULTS: Persisted = { signedIn: false, token: null, roleId: 'sho', config: DEFAULT_CONFIG, steps: {}, notes: {}, audit: [] }

function load(): Persisted {
  try {
    const saved = localStorage.getItem(KEY)
    return saved ? { ...DEFAULTS, ...JSON.parse(saved) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

// Used only when the service cannot be reached, so the demo still opens offline.
const DEV_ID = '123'
const DEV_PASSWORD = '123'

const DEVICE_ENGINE: EngineInfo = {
  extraction: 'local-rules',
  graniteConnected: false,
  graniteModel: '',
  textSimilarity: 'tfidf',
  textSimilarityLabel: 'Word overlap between the two MO summaries (TF-IDF cosine)',
}

export const REVIEW_LABEL: Record<ReviewAction, string> = {
  confirmed: 'Match confirmed',
  rejected: 'Match rejected',
  escalated: 'Escalated to district',
  linkage_approved: 'Cross-station linkage approved',
  task_force_approved: 'Task force alert approved',
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [p, setP] = useState<Persisted>(load)
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [deviceFirs, setDeviceFirs] = useState<ProcessedFir[]>([])
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [error, setError] = useState('')
  const [run, setRun] = useState(0)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(p))
    } catch {
      // storage unavailable (private window): the session still works, it just is not remembered
    }
  }, [p])

  const runOnDevice = useCallback(async () => {
    const source = rawFirs as Fir[]
    const processed = await Promise.all(source.map(async (f) => ({ ...f, extraction: await activeExtractor.extract(f) })))
    setDeviceFirs(processed)
    setSnap(null)
    setUpdatedAt(new Date())
  }, [])

  const { signedIn, token } = p
  useEffect(() => {
    if (!signedIn) return
    let cancelled = false
    setLoading(true)
    const work = token
      ? api.snapshot(token).then(
          (s) => {
            if (cancelled) return
            setSnap(s)
            setUpdatedAt(new Date(s.updatedAt))
            setError('')
          },
          (e) => {
            if (cancelled) return
            if (e instanceof ApiError && e.status === 401) {
              setP((s) => ({ ...s, signedIn: false, token: null }))
              return
            }
            if (!(e instanceof Unreachable)) setError(e.message)
            return runOnDevice()
          },
        )
      : runOnDevice()
    work.finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [signedIn, token, run, runOnDevice])

  const onService = snap !== null
  const config = onService ? snap.config : p.config
  const firs = onService ? snap.firs : deviceFirs
  const deviceMatches = useMemo(() => (onService ? [] : findMatches(deviceFirs, p.config)), [onService, deviceFirs, p.config])
  const deviceNetworks = useMemo(() => (onService ? [] : buildNetworks(deviceFirs, deviceMatches, p.config)), [onService, deviceFirs, deviceMatches, p.config])
  const matches = onService ? snap.matches : deviceMatches
  const networks = onService ? snap.networks : deviceNetworks
  const devicePersons = useMemo(() => (onService ? [] : buildPersons(deviceFirs, deviceMatches, p.config.nameGate)), [onService, deviceFirs, deviceMatches, p.config.nameGate])
  const persons = onService ? (snap.persons ?? []) : devicePersons
  const role = roleById(p.roleId)

  const value = useMemo<Store>(() => {
    const log = (prev: Persisted, action: string, target: string): AuditEntry[] => {
      const r = roleById(prev.roleId)
      return [{ at: new Date().toISOString(), by: r.persona, role: r.short, action, target }, ...prev.audit].slice(0, 200)
    }
    // Sends a change to the service and reloads; applies it on this device when there is no service.
    const change = (remote: (token: string) => Promise<unknown>, local: (s: Persisted) => Persisted) => {
      if (onService && p.token) {
        remote(p.token).then(
          () => setRun((n) => n + 1),
          (e) => setError(e.message),
        )
      } else {
        setP(local)
      }
    }

    const steps = (onService ? (snap.steps as Steps) : p.steps) ?? {}
    const reviews: Reviews = Object.fromEntries(Object.entries(steps).filter(([, s]) => s.length).map(([k, s]) => [k, s[s.length - 1]]))

    const canOpen = (fir: Fir) => role.can.firDetails && !(fir as ProcessedFir).redacted && inScope(role.scope, fir)
    const visible = firs.filter(canOpen).sort((a, b) => b.date_of_fir.localeCompare(a.date_of_fir))
    const ids = new Set(visible.map((f) => f.fir_reg_no))

    return {
      ...p,
      config,
      steps,
      reviews,
      notes: onService ? snap.notes : p.notes,
      audit: onService ? snap.audit : p.audit,
      role,
      loading,
      updatedAt,
      asOf: onService ? snap.asOf : firs.reduce((max, f) => (f.date_of_fir > max ? f.date_of_fir : max), '').slice(0, 10),
      source: onService ? 'service' : 'device',
      engine: onService ? snap.engine : DEVICE_ENGINE,
      error,
      firs,
      matches,
      networks,
      persons,
      visible,
      visibleNetworks: networks.filter((n) => n.firs.some((id) => ids.has(id))),
      byId: new Map(firs.map((f) => [f.fir_reg_no, f])),
      canOpen,
      signIn: async (id, password) => {
        try {
          const session = await api.login(id, password)
          setP((s) => ({ ...s, signedIn: true, token: session.token, roleId: session.role }))
          return true
        } catch (e) {
          if (!(e instanceof Unreachable)) return false
          if (id !== DEV_ID || password !== DEV_PASSWORD) return false
          setP((s) => ({ ...s, signedIn: true, token: null, audit: log(s, 'Signed in on this device', 'Session') }))
          return true
        }
      },
      signOut: () => {
        setSnap(null)
        setP((s) => ({ ...s, signedIn: false, token: null }))
      },
      setRole: (roleId) => {
        if (onService && p.token) {
          api.switchRole(p.token, roleId).then(
            (session) => setP((s) => ({ ...s, token: session.token, roleId: session.role })),
            (e) => setError(e.message),
          )
        } else {
          setP((s) => ({ ...s, roleId, audit: log({ ...s, roleId }, 'Switched role', roleById(roleId).title) }))
        }
      },
      setConfig: (c) => change((t) => api.putConfig(t, c), (s) => ({ ...s, config: c, audit: log(s, 'Updated scoring configuration', JSON.stringify(c.weights)) })),
      review: (target, action, label) =>
        change(
          (t) => api.review(t, target, action, label),
          (s) => {
            const r = roleById(s.roleId)
            const kept = (s.steps[target] ?? []).filter((x) => x.action !== action && x.action !== OPPOSITE[action])
            return { ...s, steps: { ...s.steps, [target]: [...kept, { action, by: r.persona, role: r.short, at: new Date().toISOString() }] }, audit: log(s, REVIEW_LABEL[action], label) }
          },
        ),
      addNote: (firId, text) =>
        change(
          (t) => api.addNote(t, firId, text),
          (s) => ({ ...s, notes: { ...s.notes, [firId]: [{ at: new Date().toISOString(), by: roleById(s.roleId).persona, role: roleById(s.roleId).short, text }, ...(s.notes[firId] ?? [])] }, audit: log(s, 'Added case note', firId) }),
        ),
      refresh: () => setRun((n) => n + 1),
    }
  }, [p, snap, onService, config, role, loading, updatedAt, error, firs, matches, networks, persons])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore must be used inside StoreProvider')
  return s
}

export const networkKey = (n: Network) => `net:${n.firs[0]}`
