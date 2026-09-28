import * as Tooltip from '@radix-ui/react-tooltip'
import clsx from 'clsx'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { RiskLevel } from '../lib/matching.ts'
import { useStore } from '../state/store.tsx'

export function Tip({ children, text }: { children: ReactNode; text: ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content sideOffset={6} className="z-50 max-w-xs rounded-md bg-ink px-3 py-2 text-sm leading-snug text-white shadow-lg">
          {text}
          <Tooltip.Arrow className="fill-ink" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

const time = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })

export function LastUpdated() {
  const { updatedAt, loading } = useStore()
  return <span className="num text-sm text-muted">{loading || !updatedAt ? 'Updating' : `Last updated ${time.format(updatedAt)}`}</span>
}

export function Panel({ title, note, action, children, className }: { title: string; note?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('rounded-lg border border-line bg-surface', className)}>
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line px-5 py-3.5">
        <div>
          <h2 className="text-base">{title}</h2>
          {note && <p className="text-sm text-muted">{note}</p>}
        </div>
        <div className="flex items-center gap-3">
          {action}
          <LastUpdated />
        </div>
      </header>
      <div className="p-5">{children}</div>
    </section>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton', className)} aria-hidden="true" />
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  )
}

type Tone = 'neutral' | 'accent' | RiskLevel

const TONE: Record<Tone, string> = {
  neutral: 'bg-canvas text-ink border-line',
  accent: 'bg-accent-soft text-accent border-transparent',
  high: 'bg-high-soft text-high border-transparent',
  medium: 'bg-medium-soft text-medium border-transparent',
  low: 'bg-low-soft text-low border-transparent',
}

export function Badge({ tone = 'neutral', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  const el = <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-sm', TONE[tone])}>{children}</span>
  return title ? <Tip text={title}>{el}</Tip> : el
}

const RISK_TEXT: Record<RiskLevel, string> = { high: 'High risk', medium: 'Medium risk', low: 'Low risk' }

export function RiskBadge({ level, reason }: { level: RiskLevel; reason: string }) {
  return (
    <Badge tone={level} title={reason}>
      <span className="font-semibold">{RISK_TEXT[level]}</span>
    </Badge>
  )
}

export function Button({ variant = 'secondary', className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  return (
    <button
      type="button"
      {...rest}
      className={clsx(
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-4 text-[0.9375rem] font-semibold disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'border-accent bg-accent text-white hover:bg-[#15305a]',
        variant === 'secondary' && 'border-line bg-surface text-ink hover:bg-canvas',
        variant === 'danger' && 'border-high/40 bg-surface text-high hover:bg-high-soft',
        className,
      )}
    />
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-surface px-6 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-prose text-muted">{children}</p>}
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  )
}

const date = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
export const formatDate = (iso: string) => date.format(new Date(iso.length === 10 ? `${iso}T00:00:00Z` : `${iso}Z`))
export const pct = (x: number) => `${Math.round(x * 100)}%`
