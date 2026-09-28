import { ArrowLeft } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { FirReference } from '../components/shared.tsx'
import { Badge, Empty, Field, formatDate, Panel, pct, SkeletonRows } from '../components/ui.tsx'
import type { Person } from '../lib/persons.ts'
import { tagLabel } from '../lib/trends.ts'
import { useStore } from '../state/store.tsx'

export function PersonLink({ person, children }: { person: Person; children?: React.ReactNode }) {
  return (
    <Link to={`/fir/person/${person.id}`} className="font-semibold text-accent underline underline-offset-2">
      {children ?? person.name}
    </Link>
  )
}

// The person in the middle, each co-accused around them. Every line is one or more FIRs
// naming both people, and the number on the line is how many.
function AssociateGraph({ person }: { person: Person }) {
  const navigate = useNavigate()
  const shown = person.coAccused.slice(0, 6)
  // one or two co-accused sit on a single row, more are spread around the person
  const row = shown.length <= 2
  const W = 520
  const H = row ? 110 : 260
  const cx = W / 2
  const cy = row ? 40 : H / 2
  const nodes = shown.map((c, i, all) => {
    const a = row ? (i === 0 ? 0 : Math.PI) : (i / all.length) * Math.PI * 2 - Math.PI / 2
    return { ...c, x: cx + Math.cos(a) * 170, y: cy + Math.sin(a) * 85 }
  })
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${person.name} and ${nodes.length} co-accused`}>
      {nodes.map((n) => (
        <g key={n.id}>
          <line x1={cx} y1={cy} x2={n.x} y2={n.y} stroke="var(--color-seg-2)" strokeWidth={1.5 + n.firs.length * 1.5} strokeLinecap="round" />
          <circle cx={(cx + n.x) / 2} cy={(cy + n.y) / 2} r={13} fill="var(--color-surface)" stroke="var(--color-line)" />
          <text x={(cx + n.x) / 2} y={(cy + n.y) / 2 + 4.5} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--color-ink)">
            {n.firs.length}
          </text>
        </g>
      ))}
      <circle cx={cx} cy={cy} r={16} fill="var(--color-accent)" />
      <text x={cx} y={cy + 34} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--color-ink)">
        {person.name}
      </text>
      {nodes.map((n) => (
        <g key={n.id} role="link" tabIndex={0} className="cursor-pointer" onClick={() => navigate(`/fir/person/${n.id}`)} onKeyDown={(e) => e.key === 'Enter' && navigate(`/fir/person/${n.id}`)}>
          <circle cx={n.x} cy={n.y} r={13} fill="var(--color-surface)" stroke="var(--color-accent)" strokeWidth={2.5} />
          <text x={n.x} y={n.y + 30} textAnchor="middle" fontSize={13} fill="var(--color-accent)" textDecoration="underline">
            {n.name}
          </text>
        </g>
      ))}
    </svg>
  )
}

export function PersonProfile() {
  const { id } = useParams()
  const { persons, byId, loading } = useStore()
  const person = persons.find((p) => p.id === id)

  const back = (
    <Link to="/fir" className="mb-4 inline-flex min-h-10 items-center gap-2 text-accent">
      <ArrowLeft size={18} aria-hidden="true" />
      All cases
    </Link>
  )
  if (loading) return <SkeletonRows rows={8} />
  if (!person) {
    return (
      <>
        {back}
        <Empty title="No profile for this person in your jurisdiction">The person may be named only in FIRs you cannot see.</Empty>
      </>
    )
  }

  const facts = [
    [person.firs.length, person.firs.length === 1 ? 'FIR' : 'FIRs'],
    [person.districts.length, person.districts.length === 1 ? 'district' : 'districts'],
    [person.states.length, person.states.length === 1 ? 'state' : 'states'],
    [person.coAccused.length, 'co-accused'],
  ] as const

  return (
    <div className="space-y-6">
      <div>
        {back}
        <h2 className="text-xl">{person.name}</h2>
        <p className="text-muted">
          {person.aliases.length > 0 && `Also known as ${person.aliases.join(', ')}. `}
          Accused, {formatDate(person.firstSeen)}
          {person.lastSeen !== person.firstSeen && ` to ${formatDate(person.lastSeen)}`}.
        </p>
        <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-3">
          {facts.map(([n, label]) => (
            <div key={label}>
              <dd className="num text-3xl font-semibold leading-none">{n}</dd>
              <dt className="mt-1 text-sm text-muted">{label}</dt>
            </div>
          ))}
        </dl>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Co-accused" note="People named as accused in the same FIR">
          {person.coAccused.length ? (
            <>
              <AssociateGraph person={person} />
              <ul className="mt-2 divide-y divide-line border-t border-line">
                {person.coAccused.map((c) => (
                  <li key={c.id} className="py-3">
                    <Link to={`/fir/person/${c.id}`} className="font-semibold text-accent underline underline-offset-2">
                      {c.name}
                    </Link>
                    <p className="mt-0.5 text-[0.9375rem]">
                      Named together in {c.firs.length} {c.firs.length === 1 ? 'FIR' : 'FIRs'}:
                    </p>
                    <ul className="mt-1.5 space-y-1.5">
                      {c.firs.map((reg) => {
                        const f = byId.get(reg)
                        return f ? (
                          <li key={reg} className="rounded-md bg-canvas px-3 py-2">
                            <FirReference fir={f} />
                            <p className="mt-1 text-sm text-muted">Accused as written: {f.accused.map((a) => a.name).join('; ')}</p>
                          </li>
                        ) : null
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-muted">No co-accused on record. Every FIR names this person alone or with unidentified persons.</p>
          )}
        </Panel>

        <Panel title="What is known">
          <dl className="space-y-4">
            <Field label="Offences">{person.crimeTypes.join(', ')}</Field>
            <Field label="Method">
              <span className="flex flex-wrap gap-1.5">{person.moTags.length ? person.moTags.map((t) => <Badge key={t}>{tagLabel(t)}</Badge>) : <span className="text-muted">No method tags found</span>}</span>
            </Field>
            <Field label="Districts">{person.districts.join(', ')}</Field>
            <Field label="Name as written in the FIRs">
              <span className="flex flex-wrap gap-1.5">
                {person.variants.map((v) => (
                  <Badge key={v}>{v}</Badge>
                ))}
              </span>
            </Field>
          </dl>
        </Panel>
      </div>

      <Panel title="FIRs naming this person" note="Oldest first">
        <ol className="divide-y divide-line">
          {person.mentions.map((m) => {
            const f = byId.get(m.fir)
            return f ? (
              <li key={`${m.fir}-${m.name}`} className="grid gap-x-6 gap-y-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-2">
                <FirReference fir={f} />
                <p className="text-[0.9375rem]">
                  {f.extraction.crime_types.map((c) => c.value).join(', ')}
                  <span className="block text-sm text-muted">Written as "{m.name}"</span>
                </p>
              </li>
            ) : null
          })}
        </ol>
      </Panel>

      {person.firs.length > 1 && (
        <Panel title="Why these FIRs are one person" note="Two records are joined only when the names match and the FIRs are linked by method and timing">
          <table className="w-full text-[0.9375rem]">
            <thead>
              <tr className="border-b border-line text-left text-sm text-muted">
                <th className="py-1.5 pr-3 font-normal">Names compared</th>
                <th className="num px-2 py-1.5 text-right font-normal">Name match</th>
                <th className="num py-1.5 pl-2 text-right font-normal">FIR score</th>
              </tr>
            </thead>
            <tbody>
              {person.identityLinks.map((l) => (
                <tr key={`${l.a.fir}-${l.b.fir}`} className="border-b border-line align-top last:border-0">
                  <td className="py-2 pr-3">
                    "{l.a.name}" and "{l.b.name}"
                    <span className="block text-sm text-muted">
                      {l.method}. {byId.get(l.a.fir)?.police_station} PS and {byId.get(l.b.fir)?.police_station} PS.
                    </span>
                  </td>
                  <td className="num px-2 py-2 text-right">{pct(l.similarity)}</td>
                  <td className="num py-2 pl-2 text-right font-semibold">{l.score.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {person.sameNameNotLinked.length > 0 && (
        <Panel title="Same name, different person" note="Checked and kept separate">
          <ul className="divide-y divide-line">
            {person.sameNameNotLinked.map((s) => {
              const f = byId.get(s.fir)
              return (
                <li key={s.id} className="grid gap-x-6 gap-y-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-2">
                  <div>
                    <Link to={`/fir/person/${s.id}`} className="font-semibold text-accent underline underline-offset-2">
                      {s.name}
                    </Link>
                    {f && (
                      <p className="text-sm text-muted">
                        {f.police_station} PS, {f.district}. {f.extraction.crime_types.map((c) => c.value).join(', ')}.
                      </p>
                    )}
                  </div>
                  <p className="text-[0.9375rem]">
                    Not linked: score {s.score.toFixed(2)}, {s.sharedTags} method tags in common, offences {s.daysApart} days apart.
                  </p>
                </li>
              )
            })}
          </ul>
        </Panel>
      )}
    </div>
  )
}
