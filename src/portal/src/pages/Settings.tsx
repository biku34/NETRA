import { useState } from 'react'
import { PageTitle } from '../components/Layout.tsx'
import { Badge, Button, formatDate, Panel } from '../components/ui.tsx'
import { DEFAULT_CONFIG } from '../lib/matching.ts'
import { ROLES } from '../lib/roles.ts'
import type { ScoringConfig, Weights } from '../lib/types.ts'
import { useStore } from '../state/store.tsx'

const WEIGHTS: { key: keyof Weights; label: string; how: string }[] = [
  { key: 'name', label: 'Name match', how: 'Fuzzy match on accused names and aliases, tolerant of spelling and transliteration differences' },
  { key: 'moTags', label: 'MO tags in common', how: 'Shared method tags divided by all method tags in both FIRs (Jaccard)' },
  { key: 'moText', label: 'MO description similarity', how: '' },
  { key: 'temporal', label: 'Closeness in time', how: 'exp(-days apart / decay days): offences close in time score higher' },
]

function Scoring() {
  const { config, setConfig, role, engine } = useStore()
  const [draft, setDraft] = useState<ScoringConfig>(config)
  const [seen, setSeen] = useState(config)
  // the saved configuration arrives from the service after this panel first renders
  if (seen !== config) {
    setSeen(config)
    setDraft(config)
  }
  const editable = role.can.editScoring
  const sum = Object.values(draft.weights).reduce((a, b) => a + b, 0)
  const valid = Math.abs(sum - 1) < 0.001
  const changed = JSON.stringify(draft) !== JSON.stringify(config)
  const input = 'num min-h-10 w-24 rounded-md border border-line bg-surface px-2 text-right disabled:bg-canvas disabled:text-muted'

  const num = (value: number, onChange: (v: number) => void, step = 0.05, max = 1) => (
    <input type="number" className={input} value={value} step={step} min={0} max={max} disabled={!editable} onChange={(e) => onChange(Number(e.target.value))} />
  )

  return (
    <Panel title="Repeat-offender scoring" note={editable ? 'Changes apply to every flag at once and are recorded in the audit trail.' : 'Only the System Admin role can change these values.'}>
      <p className="num rounded-md bg-canvas px-4 py-3 text-[0.9375rem]">
        score = {draft.weights.name.toFixed(2)} × name match + {draft.weights.moTags.toFixed(2)} × MO tags + {draft.weights.moText.toFixed(2)} × MO description + {draft.weights.temporal.toFixed(2)} × closeness in time
      </p>
      <p className="mt-3 max-w-prose">
        Two FIRs are flagged as the same offender only when the name match is at least {Math.round(draft.nameGate * 100)}% <strong>and</strong> the score is at least {draft.threshold.toFixed(2)}. A similar method alone never creates a flag.
      </p>

      <table className="mt-5 w-full text-[0.9375rem]">
        <tbody>
          {WEIGHTS.map((w) => (
            <tr key={w.key} className="border-b border-line align-top">
              <td className="py-3 pr-4">
                {w.label}
                <span className="block text-sm text-muted">{w.how || engine.textSimilarityLabel}</span>
              </td>
              <td className="py-3 text-right">{num(draft.weights[w.key], (v) => setDraft({ ...draft, weights: { ...draft.weights, [w.key]: v } }))}</td>
            </tr>
          ))}
          <tr className="border-b border-line">
            <td className="py-3 pr-4">Minimum name match</td>
            <td className="py-3 text-right">{num(draft.nameGate, (v) => setDraft({ ...draft, nameGate: v }))}</td>
          </tr>
          <tr className="border-b border-line">
            <td className="py-3 pr-4">Flag threshold</td>
            <td className="py-3 text-right">{num(draft.threshold, (v) => setDraft({ ...draft, threshold: v }))}</td>
          </tr>
          <tr>
            <td className="py-3 pr-4">Decay days</td>
            <td className="py-3 text-right">{num(draft.decayDays, (v) => setDraft({ ...draft, decayDays: v }), 10, 3650)}</td>
          </tr>
        </tbody>
      </table>

      {editable && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="primary" disabled={!valid || !changed || draft.decayDays <= 0} onClick={() => setConfig(draft)}>
            Save scoring
          </Button>
          <Button disabled={JSON.stringify(draft) === JSON.stringify(DEFAULT_CONFIG)} onClick={() => setDraft(DEFAULT_CONFIG)}>
            Restore defaults
          </Button>
          {!valid && (
            <p role="alert" className="text-high">
              The four weights add up to {sum.toFixed(2)}. They must add up to 1.00.
            </p>
          )}
        </div>
      )}
    </Panel>
  )
}

export function Settings() {
  const { role, audit, engine, source } = useStore()
  return (
    <>
      <PageTitle title="Settings">How the system scores, what it reads FIRs with, and who can see what.</PageTitle>
      <div className="space-y-6">
        <Scoring />

        <Panel title="Engines in use">
          <ul className="divide-y divide-line">
            <li className="flex flex-wrap items-center justify-between gap-3 pb-3">
              <div>
                <p className="font-semibold">Netra service</p>
                <p className="text-[0.9375rem] text-muted">{source === 'service' ? 'Scoring, access control and records run on the service.' : 'The service cannot be reached. Scoring runs on this device and changes stay on this device.'}</p>
              </div>
              <Badge tone={source === 'service' ? 'low' : 'medium'}>{source === 'service' ? 'Connected' : 'Working on this device'}</Badge>
            </li>
            <li className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-semibold">Local rule engine</p>
                <p className="text-[0.9375rem] text-muted">Maps sections to offence types and finds method keywords in English, Hindi, Bengali and Gujarati text. Also the fallback if Granite fails.</p>
              </div>
              <Badge tone={engine.graniteConnected ? 'neutral' : 'low'}>{engine.graniteConnected ? 'Fallback' : 'In use'}</Badge>
            </li>
            <li className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-semibold">IBM watsonx.ai Granite</p>
                <p className="text-[0.9375rem] text-muted">Offence classification, method tags and English summaries for new FIRs. Needs an API key and project ID in backend/.env.</p>
              </div>
              <Badge tone={engine.graniteConnected ? 'low' : 'neutral'}>{engine.graniteConnected ? `In use: ${engine.graniteModel}` : 'Not connected'}</Badge>
            </li>
            <li className="flex flex-wrap items-center justify-between gap-3 pt-3">
              <div>
                <p className="font-semibold">MO description similarity</p>
                <p className="text-[0.9375rem] text-muted">{engine.textSimilarityLabel}</p>
              </div>
              <Badge tone={engine.textSimilarity === 'embeddings' ? 'low' : 'medium'}>{engine.textSimilarity === 'embeddings' ? 'Sentence embeddings' : 'TF-IDF fallback'}</Badge>
            </li>
          </ul>
        </Panel>

        <Panel title="Fairness safeguards">
          <ul className="max-w-prose list-disc space-y-2 pl-5">
            <li>Every flag is a lead for an officer to check. The system never dispatches, arrests or closes a case.</li>
            <li>Religion, caste and community are not inputs. Scores use names, method, place and time only.</li>
            <li>Each score shows its four parts and the text it came from, so an officer can disagree with it.</li>
            <li>Confirmations, rejections and approvals are recorded against the officer who made them.</li>
          </ul>
        </Panel>

        <Panel title="Roles and access" note={`You are signed in as ${role.title}.`}>
          <ul className="divide-y divide-line">
            {ROLES.map((r) => (
              <li key={r.id} className="grid gap-x-6 gap-y-1 py-3 first:pt-0 last:pb-0 lg:grid-cols-[14rem_1fr]">
                <div>
                  <p className="font-semibold">{r.title}</p>
                  <p className="text-sm text-muted">{r.access}</p>
                </div>
                <dl className="space-y-1 text-[0.9375rem]">
                  <div><dt className="inline text-muted">Can view: </dt><dd className="inline">{r.canView}</dd></div>
                  <div><dt className="inline text-muted">Can do: </dt><dd className="inline">{r.canDo}</dd></div>
                  <div><dt className="inline text-muted">Cannot: </dt><dd className="inline">{r.cannot}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
        </Panel>

        {role.can.viewAudit && (
          <Panel title="Audit trail" note={source === 'service' ? 'Most recent first.' : 'Most recent first. Stored on this device while the service is unreachable.'}>
            {audit.length ? (
              <ul className="divide-y divide-line text-[0.9375rem]">
                {audit.slice(0, 50).map((a, i) => (
                  <li key={`${a.at}-${i}`} className="grid gap-x-6 py-2 sm:grid-cols-[11rem_1fr]">
                    <span className="num text-muted">
                      {formatDate(a.at.slice(0, 10))} {a.at.slice(11, 16)} UTC
                    </span>
                    <span>
                      <strong>{a.action}</strong>: {a.target} <span className="text-muted">({a.by}, {a.role})</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">Nothing recorded yet.</p>
            )}
          </Panel>
        )}
      </div>
    </>
  )
}
