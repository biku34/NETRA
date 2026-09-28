import { MessageCircle, Send, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, Unreachable, type Answer } from '../lib/api.ts'
import { useStore } from '../state/store.tsx'

type Turn = { from: 'officer'; text: string } | { from: 'assistant'; answer: Answer } | { from: 'assistant'; problem: string }

const STARTERS = ['Which gangs are waiting for my decision?', 'Who is Vikram Solanki?', 'How many vehicle thefts in Ahmedabad City?']

export function Assistant() {
  const { role, token, source } = useStore()
  const [open, setOpen] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [turns, busy])
  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])

  if (!role.can.assistant) return null

  const ask = async (question: string) => {
    const q = question.trim()
    if (!q || busy) return
    setText('')
    setTurns((t) => [...t, { from: 'officer', text: q }])
    if (!token || source !== 'service') {
      setTurns((t) => [...t, { from: 'assistant', problem: 'The assistant needs the Netra service, which cannot be reached right now.' }])
      return
    }
    setBusy(true)
    try {
      const answer = await api.ask(token, q)
      setTurns((t) => [...t, { from: 'assistant', answer }])
    } catch (e) {
      setTurns((t) => [...t, { from: 'assistant', problem: e instanceof Unreachable ? 'The Netra service cannot be reached. Try again in a moment.' : (e as Error).message }])
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    ask(text)
  }

  const chip = 'rounded-md border border-line bg-surface px-2.5 py-1.5 text-left text-sm hover:bg-canvas'
  return (
    <div className="fixed bottom-20 right-4 z-40 flex flex-col items-end gap-3 lg:bottom-6 lg:right-6">
      {open && (
        <section aria-label="Records assistant" className="flex h-[32rem] max-h-[calc(100dvh-10rem)] w-[23rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-xl">
          <header className="flex items-center justify-between gap-3 bg-accent px-4 py-3 text-white">
            <div>
              <h2 className="text-base leading-tight">Ask the records</h2>
              <p className="text-sm leading-tight opacity-85">Answers come from FIRs in {role.scope.kind === 'state' ? role.scope.state : 'your jurisdiction'}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close assistant" className="grid h-9 w-9 place-items-center rounded-md hover:bg-white/15">
              <X size={20} aria-hidden="true" />
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            {turns.length === 0 && (
              <div>
                <p className="text-[0.9375rem]">Ask about a person, an offence, a place, a method or a FIR number.</p>
                <div className="mt-3 flex flex-col items-start gap-2">
                  {STARTERS.map((s) => (
                    <button key={s} type="button" className={chip} onClick={() => ask(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((t, i) =>
              t.from === 'officer' ? (
                <p key={i} className="ml-8 rounded-lg bg-accent-soft px-3 py-2 text-[0.9375rem]">
                  {t.text}
                </p>
              ) : 'problem' in t ? (
                <p key={i} role="alert" className="mr-8 rounded-lg bg-high-soft px-3 py-2 text-[0.9375rem] text-high">
                  {t.problem}
                </p>
              ) : (
                <div key={i} className="mr-4 rounded-lg bg-canvas px-3 py-2.5 text-[0.9375rem]">
                  <p>{t.answer.answer}</p>
                  {t.answer.rows.length > 0 && (
                    <ul className="mt-2 divide-y divide-line border-t border-line">
                      {t.answer.rows.map((r, n) => (
                        <li key={n} className="py-2">
                          {r.to ? (
                            <Link to={r.to} className="font-semibold text-accent underline underline-offset-2">
                              {r.label}
                            </Link>
                          ) : (
                            <span className="font-semibold">{r.label}</span>
                          )}
                          <span className="block text-sm text-muted">{r.detail}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {t.answer.suggestions.length > 0 && (
                    <div className="mt-2 flex flex-col items-start gap-1.5">
                      {t.answer.suggestions.map((s) => (
                        <button key={s} type="button" className={chip} onClick={() => ask(s)}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ),
            )}
            {busy && <div className="skeleton mr-16 h-10" role="status" aria-label="Looking up the records" />}
            <div ref={end} />
          </div>

          <form onSubmit={submit} className="flex gap-2 border-t border-line p-3">
            <label className="flex-1">
              <span className="sr-only">Your question</span>
              <input ref={input} value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Type a question" className="min-h-11 w-full rounded-md border border-line bg-surface px-3 text-base" />
            </label>
            <button type="submit" disabled={!text.trim() || busy} aria-label="Send question" className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-accent text-white disabled:opacity-50">
              <Send size={18} aria-hidden="true" />
            </button>
          </form>
          <p className="border-t border-line px-3 py-2 text-sm text-muted">Looked up from records by fixed rules. Questions are recorded in the audit trail.</p>
        </section>
      )}

      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? 'Close assistant' : 'Ask the records'} className="grid h-14 w-14 place-items-center rounded-full bg-accent text-white shadow-lg hover:bg-[#15305a]">
        {open ? <X size={24} aria-hidden="true" /> : <MessageCircle size={24} aria-hidden="true" />}
      </button>
    </div>
  )
}
