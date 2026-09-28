import clsx from 'clsx'
import { FileText, Search, UserRound } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useStore } from '../state/store.tsx'
import { formatDate } from './ui.tsx'

const MAX_EACH = 5

interface Hit {
  kind: 'person' | 'fir'
  to: string
  title: string
  detail: string
}

// lower rank sorts first: exact, then starts-with, then a word starts with it, then contains
function rank(text: string, q: string): number {
  const t = text.toLowerCase()
  if (t === q) return 0
  if (t.startsWith(q)) return 1
  if (t.split(/[\s/,@-]+/).some((w) => w.startsWith(q))) return 2
  return t.includes(q) ? 3 : Infinity
}

const best = (texts: string[], q: string) => Math.min(...texts.map((t) => rank(t, q)), Infinity)

/** Header search over the FIRs and persons the signed-in role is allowed to open. */
export function GlobalSearch() {
  const { visible, persons, role } = useStore()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const q = query.trim().toLowerCase()
  const hits = useMemo<Hit[]>(() => {
    if (q.length < 2) return []
    const seen = new Set(visible.map((f) => f.fir_reg_no))

    const people = persons
      // a person is listed only through FIRs this role can open
      .filter((p) => p.firs.some((id) => seen.has(id)))
      .map((p) => ({ p, r: best([p.name, ...p.aliases, ...p.variants], q) }))
      .filter((x) => x.r < Infinity)
      .sort((a, b) => a.r - b.r || b.p.firs.length - a.p.firs.length || a.p.name.localeCompare(b.p.name))
      .slice(0, MAX_EACH)
      .map(({ p }): Hit => {
        const n = p.firs.filter((id) => seen.has(id)).length
        return {
          kind: 'person',
          to: `/fir/person/${p.id}`,
          title: p.name,
          detail: [p.aliases.length ? `alias ${p.aliases.join(', ')}` : '', `${n} FIR${n === 1 ? '' : 's'}`, p.districts.join(', ')].filter(Boolean).join(' · '),
        }
      })

    const cases = visible
      .map((f) => ({
        f,
        r: Math.min(
          best([f.fir_id, f.fir_reg_no], q),
          // a name match ranks below a number match so "12" finds FIR 12 first
          best([...f.accused.map((a) => a.name), ...f.extraction.accused.flatMap((a) => [a.name, ...a.aliases])], q) + 0.5,
        ),
      }))
      .filter((x) => x.r < Infinity)
      .sort((a, b) => a.r - b.r || b.f.date_of_fir.localeCompare(a.f.date_of_fir))
      .slice(0, MAX_EACH)
      .map(({ f }): Hit => {
        const named = f.extraction.accused.filter((a) => a.identified).map((a) => a.name)
        return {
          kind: 'fir',
          to: `/fir/case/${f.fir_reg_no}`,
          title: `FIR ${f.fir_id}`,
          detail: [`${f.police_station} PS, ${f.district}`, formatDate(f.date_of_fir), named.length ? named.join(', ') : 'Accused not identified'].join(' · '),
        }
      })

    return [...people, ...cases]
  }, [q, visible, persons])

  useEffect(() => setActive(0), [q])

  // leaving the page closes the list and clears the box
  useEffect(() => {
    setOpen(false)
    setQuery('')
  }, [pathname])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
      if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
    }
  }, [])

  if (!role.can.firDetails) return null

  const go = (hit: Hit) => {
    navigate(hit.to)
    inputRef.current?.blur()
  }
  const showList = open && q.length >= 2
  const firstFir = hits.findIndex((h) => h.kind === 'fir')

  return (
    <div ref={boxRef} className="relative min-w-0 flex-1 sm:max-w-xl">
      <label className="relative block">
        <span className="sr-only">Search FIRs and names</span>
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && hits.length ? `${listId}-${active}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          className="min-h-11 w-full rounded-md border border-line bg-surface pl-10 pr-3 text-base placeholder:text-muted"
          placeholder="Search FIR number or name"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false)
              inputRef.current?.blur()
            } else if (e.key === 'ArrowDown' && hits.length) {
              e.preventDefault()
              setOpen(true)
              setActive((i) => (i + 1) % hits.length)
            } else if (e.key === 'ArrowUp' && hits.length) {
              e.preventDefault()
              setActive((i) => (i - 1 + hits.length) % hits.length)
            } else if (e.key === 'Enter' && showList && hits[active]) {
              e.preventDefault()
              go(hits[active])
            }
          }}
        />
      </label>

      {showList && (
        <div id={listId} role="listbox" aria-label="Search results" className="absolute inset-x-0 top-full z-40 mt-2 max-h-[70vh] overflow-y-auto rounded-lg border border-line bg-surface p-2 shadow-lg">
          {!hits.length && <p className="px-3 py-2 text-muted">No FIR or person in your jurisdiction matches "{query.trim()}".</p>}
          {hits.map((h, i) => {
            const Icon = h.kind === 'person' ? UserRound : FileText
            return (
              <div key={h.to}>
                {i === 0 && h.kind === 'person' && <p className="px-3 py-1.5 text-sm text-muted">People</p>}
                {i === firstFir && <p className={clsx('px-3 py-1.5 text-sm text-muted', i > 0 && 'mt-1 border-t border-line pt-2.5')}>FIRs</p>}
                <button
                  type="button"
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(h)}
                  className={clsx('flex w-full items-start gap-3 rounded-md px-3 py-2 text-left', i === active && 'bg-accent-soft')}
                >
                  <Icon size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold leading-tight">{h.title}</span>
                    <span className="block truncate text-sm text-muted">{h.detail}</span>
                  </span>
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
