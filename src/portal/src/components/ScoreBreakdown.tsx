import { tagLabel } from '../lib/trends.ts'
import type { Match, ScoringConfig } from '../lib/types.ts'
import { useStore } from '../state/store.tsx'
import { pct, Tip } from './ui.tsx'

const SEGMENTS = [
  { key: 'name', label: 'Name match', colour: 'bg-seg-1' },
  { key: 'moTags', label: 'MO tags in common', colour: 'bg-seg-2' },
  { key: 'moText', label: 'MO description similarity', colour: 'bg-seg-3' },
  { key: 'temporal', label: 'Closeness in time', colour: 'bg-seg-4' },
] as const

function reason(key: (typeof SEGMENTS)[number]['key'], m: Match, textMethod: string): string {
  switch (key) {
    case 'name':
      return `"${m.bestName.a}" and "${m.bestName.b}": ${m.bestName.method}`
    case 'moTags':
      return m.sharedTags.length ? `Shared: ${m.sharedTags.map(tagLabel).join(', ')}` : 'No MO tags in common'
    case 'moText':
      return textMethod
    case 'temporal':
      return `Offences ${m.daysApart} days apart`
  }
}

// The one place a score is ever shown. Bar length is the weighted contribution of each
// component, so the four segments add up to the total and the threshold tick shows the margin.
export function ScoreBar({ match, config }: { match: Match; config: ScoringConfig }) {
  return (
    <Tip
      text={
        <span>
          Score {match.score.toFixed(2)} of 1.00. Flag threshold {config.threshold.toFixed(2)}, and the name match must be at least {pct(config.nameGate)}.
        </span>
      }
    >
      <div className="relative h-3 w-full min-w-24 rounded-sm bg-canvas" role="img" aria-label={`Score ${match.score.toFixed(2)} of 1, threshold ${config.threshold.toFixed(2)}`}>
        <div className="flex h-full overflow-hidden rounded-sm">
          {SEGMENTS.map((s) => (
            <div key={s.key} className={s.colour} style={{ width: `${config.weights[s.key] * match.components[s.key] * 100}%` }} />
          ))}
        </div>
        <div className="absolute -top-1 h-5 w-0.5 bg-ink" style={{ left: `${config.threshold * 100}%` }} />
      </div>
    </Tip>
  )
}

export function ScoreBreakdown({ match, config }: { match: Match; config: ScoringConfig }) {
  const { engine } = useStore()
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <p className="num text-2xl font-semibold">
          {match.score.toFixed(2)} <span className="text-base font-normal text-muted">of 1.00</span>
        </p>
        <p className="text-sm text-muted">Flag threshold {config.threshold.toFixed(2)} (black tick)</p>
      </div>
      <div className="mt-2">
        <ScoreBar match={match} config={config} />
      </div>
      <table className="mt-4 w-full text-[0.9375rem]">
        <thead>
          <tr className="border-b border-line text-left text-sm text-muted">
            <th className="py-1.5 pr-3 font-normal">Signal</th>
            <th className="num px-2 py-1.5 text-right font-normal">Value</th>
            <th className="num px-2 py-1.5 text-right font-normal">Weight</th>
            <th className="num py-1.5 pl-2 text-right font-normal">Adds</th>
          </tr>
        </thead>
        <tbody>
          {SEGMENTS.map((s) => (
            <tr key={s.key} className="border-b border-line align-top last:border-0">
              <td className="py-2 pr-3">
                <span className="flex items-center gap-2">
                  <span className={`h-3 w-3 shrink-0 rounded-sm ${s.colour}`} />
                  {s.label}
                </span>
                <span className="mt-0.5 block pl-5 text-sm text-muted">{reason(s.key, match, engine.textSimilarityLabel)}</span>
              </td>
              <td className="num px-2 py-2 text-right">{match.components[s.key].toFixed(2)}</td>
              <td className="num whitespace-nowrap px-2 py-2 text-right">× {config.weights[s.key].toFixed(2)}</td>
              <td className="num py-2 pl-2 text-right font-semibold">{(config.weights[s.key] * match.components[s.key]).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
