import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ScoreBar, ScoreBreakdown } from '../components/ScoreBreakdown.tsx'
import { EvidenceBadges, FirReference, NetworkBadge, ReviewStatus, TagBadges } from '../components/shared.tsx'
import { Badge, Button, Empty, Field, formatDate, Panel, pct, SkeletonRows } from '../components/ui.tsx'
import type { Match, ProcessedFir } from '../lib/types.ts'
import { useStore } from '../state/store.tsx'
import { PersonLink } from './PersonProfile.tsx'

const LANGUAGE = { en: 'English', hi: 'Hindi', bn: 'Bengali', gu: 'Gujarati' }

function MatchCard({ fir, match }: { fir: ProcessedFir; match: Match }) {
  const { byId, config, role, review, reviews, persons } = useStore()
  const other = byId.get(match.a === fir.fir_reg_no ? match.b : match.a)!
  // everyone named in both FIRs: the matched accused and any co-accused who also match
  const people = persons.filter((p) => p.firs.includes(fir.fir_reg_no) && p.firs.includes(other.fir_reg_no))
  const label = `FIR ${fir.fir_id} ${fir.police_station} and FIR ${other.fir_id} ${other.police_station}`
  const decided = reviews[match.key]?.action
  return (
    <article className="rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <FirReference fir={other} />
        <div className="flex flex-wrap gap-1.5">
          {match.crossState ? <Badge tone="high" title={`${fir.state} and ${other.state}`}>Different state</Badge> : match.crossDistrict ? <Badge tone="medium" title={`${fir.district} and ${other.district}`}>Different district</Badge> : <Badge>Same district</Badge>}
          <ReviewStatus target={match.key} />
        </div>
      </div>
      <p className="mt-3 text-[0.9375rem]">Offence there: {other.extraction.crime_types.map((c) => c.value).join(', ')}</p>
      <div className="mt-4">
        <ScoreBreakdown match={match} config={config} />
      </div>
      {match.otherNames.length > 0 && (
        <p className="mt-3 text-[0.9375rem] text-muted">
          Co-accused also match: {match.otherNames.map((n) => `"${n.a}" and "${n.b}" (${pct(n.similarity)})`).join('; ')}.
        </p>
      )}
      {people.length > 0 && (
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.9375rem]">
          <span className="text-muted">Profiles:</span>
          {people.map((p) => (
            <PersonLink key={p.id} person={p} />
          ))}
        </p>
      )}
      {role.can.reviewMatch && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
          <Button variant="primary" disabled={decided === 'confirmed'} onClick={() => review(match.key, 'confirmed', label)}>
            Confirm match
          </Button>
          <Button variant="danger" disabled={decided === 'rejected'} onClick={() => review(match.key, 'rejected', label)}>
            Reject match
          </Button>
        </div>
      )}
    </article>
  )
}

function NotLinked({ fir, matches }: { fir: ProcessedFir; matches: Match[] }) {
  const { byId, config } = useStore()
  const [open, setOpen] = useState(false)
  if (!matches.length) return null
  return (
    <div className="mt-5 border-t border-line pt-4">
      <Button onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? 'Hide' : 'Show'} {matches.length} similar FIR{matches.length === 1 ? '' : 's'} checked and not linked
      </Button>
      {open && (
        <ul className="mt-4 divide-y divide-line">
          {matches.map((m) => {
            const other = byId.get(m.a === fir.fir_reg_no ? m.b : m.a)!
            return (
              <li key={m.key} className="grid gap-x-6 gap-y-2 py-3 sm:grid-cols-[1fr_1fr_8rem]">
                <FirReference fir={other} />
                <p className="text-[0.9375rem]">
                  {m.verdict === 'mo_only'
                    ? `Same method, different person. Closest names "${m.bestName.a}" and "${m.bestName.b}" match only ${pct(m.bestName.similarity)}, below the ${pct(config.nameGate)} needed.`
                    : `Same name, different pattern. Score ${m.score.toFixed(2)} is below the ${config.threshold.toFixed(2)} threshold: ${m.sharedTags.length} MO tags in common, ${m.daysApart} days apart.`}
                </p>
                <div className="self-center">
                  <ScoreBar match={m} config={config} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Notes({ fir }: { fir: ProcessedFir }) {
  const { notes, addNote, role } = useStore()
  const [text, setText] = useState('')
  const list = notes[fir.fir_reg_no] ?? []
  return (
    <Panel title="Case notes" note="Officers at every level can add notes. The IG sees them all in one place.">
      {role.can.addNotes && (
        <form
          className="mb-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!text.trim()) return
            addNote(fir.fir_reg_no, text.trim())
            setText('')
          }}
        >
          <label className="block text-[0.9375rem]">
            Add a note
            <textarea className="mt-1 block w-full rounded-md border border-line bg-surface p-3 text-base" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <Button type="submit" variant="primary" className="mt-2" disabled={!text.trim()}>
            Save note
          </Button>
        </form>
      )}
      {list.length ? (
        <ul className="space-y-3">
          {list.map((n) => (
            <li key={n.at} className="rounded-md bg-canvas p-3">
              <p>{n.text}</p>
              <p className="mt-1 text-sm text-muted">
                {n.by}
                {n.role && ` (${n.role})`}, {formatDate(n.at.slice(0, 10))}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted">No notes yet.</p>
      )}
    </Panel>
  )
}

export function FirDetail() {
  const { regNo } = useParams()
  const { byId, matches, networks, persons, loading, canOpen, engine } = useStore()
  const fir = regNo ? byId.get(regNo) : undefined

  const back = (
    <Link to="/fir" className="mb-4 inline-flex min-h-10 items-center gap-2 text-accent">
      <ArrowLeft size={18} aria-hidden="true" />
      All cases
    </Link>
  )
  if (loading) return <SkeletonRows rows={8} />
  if (!fir) return <>{back}<Empty title="FIR not found">Check the FIR number, or go back to the list of cases.</Empty></>
  if (!canOpen(fir)) return <>{back}<Empty title="This FIR is outside your jurisdiction">Ask the officer in charge of {fir.police_station} PS, or switch role from the account menu.</Empty></>

  const mine = matches.filter((m) => m.a === fir.fir_reg_no || m.b === fir.fir_reg_no)
  const linked = mine.filter((m) => m.verdict === 'linked')
  const network = networks.find((n) => n.firs.includes(fir.fir_reg_no))
  const x = fir.extraction

  return (
    <div className="space-y-6">
      <div>
        {back}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="num text-xl">FIR {fir.fir_id}</h2>
            <p className="text-muted">
              {fir.police_station} PS, {fir.district}, {fir.state}. Registered {formatDate(fir.date_of_fir)}.
            </p>
          </div>
          <Badge>{fir.status}</Badge>
        </div>
      </div>

      {network && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/30 bg-accent-soft px-5 py-4">
          <p className="max-w-prose">
            <strong>Repeat-offender signature.</strong> An accused in this FIR matches {network.firs.length - 1} other FIR{network.firs.length > 2 ? 's' : ''} across {network.districts.length} districts: {network.districts.join(', ')}.
          </p>
          <div className="flex items-center gap-3">
            <NetworkBadge network={network} />
            <Link to="/fir/networks" className="font-semibold text-accent underline underline-offset-2">
              View linked offenders
            </Link>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="What the system read from this FIR" note={x.engine === 'watsonx-granite' ? 'Read by IBM watsonx.ai Granite.' : `Read by the local rule engine. IBM watsonx.ai Granite is ${engine.graniteConnected ? 'connected for new FIRs' : 'not connected yet'}.`}>
          <dl className="space-y-4">
            <Field label="Offence types (hover for the reason)">
              <EvidenceBadges items={x.crime_types} tone="accent" />
            </Field>
            <Field label="Method (MO) tags">
              <TagBadges items={x.mo_tags} />
            </Field>
            <Field label={x.accused.filter((a) => a.identified).length > 1 ? 'Accused and co-accused (open a name for the profile)' : 'Accused (open the name for the profile)'}>
              <ul className="space-y-2">
                {x.accused.map((a, i) => {
                  const person = a.identified ? persons.find((p) => p.mentions.some((m) => m.fir === fir.fir_reg_no && m.name === a.raw)) : undefined
                  const others = person ? person.coAccused.filter((c) => c.firs.includes(fir.fir_reg_no)) : []
                  return (
                    <li key={i}>
                      {person ? <PersonLink person={person}>{a.name}</PersonLink> : <span className="text-muted">{a.raw || 'Unknown'} (not identified)</span>}
                      {a.aliases.length > 0 && <span className="text-muted"> also known as {a.aliases.join(', ')}</span>}
                      {person && (
                        <span className="block text-sm text-muted">
                          {person.firs.length === 1 ? 'No other FIR on record' : `Named in ${person.firs.length} FIRs across ${person.districts.length} districts`}
                          {others.length > 0 && `. Co-accused here with ${others.map((c) => c.name).join(', ')}`}
                        </span>
                      )}
                      {fir.accused[i].address && <span className="block text-sm text-muted">{fir.accused[i].address}</span>}
                    </li>
                  )
                })}
              </ul>
            </Field>
            <Field label="Victim profile">
              {fir.victim_profile.gender === 'Not applicable' ? 'State case, no individual victim' : `${fir.victim_profile.gender}, age ${fir.victim_profile.age_range}. Relation to accused: ${fir.victim_profile.relation_to_accused.toLowerCase()}.`}
            </Field>
            <Field label="Place and time">
              {fir.occurrence.place}. {formatDate(fir.occurrence.date)}, {fir.occurrence.time_period}.
            </Field>
          </dl>
        </Panel>

        <Panel title="FIR text" note={`Written in ${LANGUAGE[fir.language]}`}>
          <p lang={fir.language} className="max-w-prose whitespace-pre-line leading-relaxed">
            {fir.narrative}
          </p>
          <dl className="mt-5 space-y-4 border-t border-line pt-4">
            <Field label="Method summary (English)">{fir.mo_summary}</Field>
            <Field label="Acts and sections">
              <ul className="num space-y-0.5 text-[0.9375rem]">
                {fir.acts_sections.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </Field>
            <Field label="Investigating officer">
              {fir.investigating_officer.name}, {fir.investigating_officer.rank}
            </Field>
          </dl>
        </Panel>
      </div>

      <Panel title="Repeat-offender matches" note="Every flag is a lead for an officer to check, not a finding.">
        {linked.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {linked.map((m) => (
              <MatchCard key={m.key} fir={fir} match={m} />
            ))}
          </div>
        ) : (
          <p className="text-muted">No accused in this FIR matches another FIR on record.</p>
        )}
        <NotLinked fir={fir} matches={mine.filter((m) => m.verdict !== 'linked')} />
      </Panel>

      <Notes fir={fir} />
    </div>
  )
}
