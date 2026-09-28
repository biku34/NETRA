import type { Person } from './persons.ts'
import type { RoleId } from './roles.ts'
import type { Match, Network, ProcessedFir, ScoringConfig } from './types.ts'

// Proxied to the FastAPI service by Vite (see vite.config.ts).
const BASE = '/api'

export interface EngineInfo {
  extraction: 'local-rules' | 'watsonx-granite'
  graniteConnected: boolean
  graniteModel: string
  textSimilarity: 'embeddings' | 'tfidf'
  textSimilarityLabel: string
}

export interface Snapshot {
  role: RoleId
  firs: ProcessedFir[]
  matches: Match[]
  networks: Network[]
  persons: Person[]
  config: ScoringConfig
  reviews: Record<string, { action: string; by: string; at: string }>
  steps: Record<string, { action: string; by: string; role: string; at: string }[]>
  notes: Record<string, { at: string; by: string; role: string; text: string }[]>
  audit: { at: string; by: string; role: string; action: string; target: string }[]
  asOf: string
  updatedAt: string
  engine: EngineInfo
}

export interface Answer {
  answer: string
  // each row names the record the statement came from
  rows: { label: string; detail: string; to: string | null }[]
  suggestions: string[]
  engine: string
}

// The service could not be reached at all, as opposed to answering with an error.
export class Unreachable extends Error {}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function call<T>(path: string, init: { method?: string; token?: string | null; body?: unknown } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(BASE + path, {
      method: init.method ?? 'GET',
      headers: {
        ...(init.body !== undefined && { 'Content-Type': 'application/json' }),
        ...(init.token && { Authorization: `Bearer ${init.token}` }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new Unreachable('The Netra service cannot be reached')
  }
  // The dev proxy answers 5xx when nothing is listening on the API port
  if (res.status >= 502 && res.status <= 504) throw new Unreachable('The Netra service cannot be reached')
  if (!res.ok) {
    const detail = await res.json().then((b) => b.detail, () => null)
    throw new ApiError(res.status, typeof detail === 'string' ? detail : `Request failed (${res.status})`)
  }
  return res.json()
}

type Session = { token: string; role: RoleId }

export const api = {
  login: (user_id: string, password: string) => call<Session>('/auth/login', { method: 'POST', body: { user_id, password } }),
  switchRole: (token: string, role: RoleId) => call<Session>('/auth/role', { method: 'POST', token, body: { role } }),
  snapshot: (token: string) => call<Snapshot>('/snapshot', { token }),
  review: (token: string, target: string, action: string, label: string) => call('/reviews', { method: 'POST', token, body: { target, action, label } }),
  addNote: (token: string, regNo: string, text: string) => call(`/fir/${regNo}/notes`, { method: 'POST', token, body: { text } }),
  ask: (token: string, question: string) => call<Answer>('/assistant/ask', { method: 'POST', token, body: { question } }),
  putConfig: (token: string, config: ScoringConfig) => call<ScoringConfig>('/config', { method: 'PUT', token, body: config }),
}
