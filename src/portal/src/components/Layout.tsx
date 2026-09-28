import * as Menu from '@radix-ui/react-dropdown-menu'
import clsx from 'clsx'
import { Check, ChevronDown, FileText, Home, LogOut, Map, Settings, UserRound } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { APP_NAME, APP_TAGLINE, HOTSPOTS_URL } from '../config.ts'
import { ROLES, scopeLabel } from '../lib/roles.ts'
import { useStore } from '../state/store.tsx'
import { Assistant } from './Assistant.tsx'
import { GlobalSearch } from './GlobalSearch.tsx'

// `external` modules are separate apps mounted on this origin (see vite.config.ts):
// they need a full page load, not a client-side route change.
// Drug Risk is a "Coming Soon" placeholder (see App.tsx) — left out of the nav
// until that module is actually built.
const NAV = [
  { to: '/', label: 'Overview', icon: Home, end: true, external: false },
  { to: '/fir', label: 'FIR', icon: FileText, end: false, external: false },
  { to: HOTSPOTS_URL, label: 'Hotspots', icon: Map, end: false, external: true },
  { to: '/settings', label: 'Settings', icon: Settings, end: false, external: false },
]

export function Logo({ size = 32 }: { size?: number }) {
  return <img src="/favicon.svg" alt="" width={size} height={size} className="rounded-md" />
}

function AccountMenu() {
  const { role, setRole, signOut } = useStore()
  return (
    <Menu.Root>
      <Menu.Trigger className="flex min-h-11 items-center gap-3 rounded-md border border-line bg-surface px-3 text-left hover:bg-canvas">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-accent-soft text-accent">
          <UserRound size={18} aria-hidden="true" />
        </span>
        <span className="hidden sm:block">
          <span className="block text-[0.9375rem] font-semibold leading-tight">{role.persona}</span>
          <span className="block text-sm leading-tight text-muted">{role.short}</span>
        </span>
        <ChevronDown size={16} className="text-muted" aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={8} className="z-50 w-80 rounded-lg border border-line bg-surface p-2 shadow-lg">
          <div className="px-3 py-2">
            <p className="font-semibold">{role.persona}</p>
            <p className="text-sm text-muted">{role.title}</p>
            <p className="text-sm text-muted">{role.posting}</p>
          </div>
          <Menu.Separator className="my-1 h-px bg-line" />
          <Menu.Label className="px-3 py-1.5 text-sm text-muted">Switch role</Menu.Label>
          <Menu.RadioGroup value={role.id} onValueChange={(v) => setRole(v as typeof role.id)}>
            {ROLES.map((r) => (
              <Menu.RadioItem key={r.id} value={r.id} className="flex cursor-pointer items-start gap-2 rounded-md px-3 py-2 outline-none data-[highlighted]:bg-canvas data-[state=checked]:bg-accent-soft">
                <span className="mt-0.5 w-4 shrink-0 text-accent">
                  <Menu.ItemIndicator>
                    <Check size={16} aria-hidden="true" />
                  </Menu.ItemIndicator>
                </span>
                <span>
                  <span className="block text-[0.9375rem] leading-tight">{r.title}</span>
                  <span className="block text-sm leading-tight text-muted">{scopeLabel(r.scope)}</span>
                </span>
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
          <Menu.Separator className="my-1 h-px bg-line" />
          <Menu.Item onSelect={signOut} className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 outline-none data-[highlighted]:bg-canvas">
            <LogOut size={16} aria-hidden="true" />
            Sign out
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}

export function Layout() {
  const { role, source, loading, error } = useStore()
  return (
    <div className="min-h-dvh lg:pl-60">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <Logo />
          <div>
            <p className="text-lg font-semibold leading-tight">{APP_NAME}</p>
            <p className="text-sm leading-tight text-muted">{APP_TAGLINE}</p>
          </div>
        </div>
        <nav aria-label="Main" className="mt-2 flex flex-col gap-1 px-3">
          {NAV.map(({ to, label, icon: Icon, end, external }) =>
            external ? (
              <a key={to} href={to} className="flex min-h-11 items-center gap-3 rounded-md px-3 text-base text-muted hover:bg-canvas hover:text-ink">
                <Icon size={20} aria-hidden="true" />
                {label}
              </a>
            ) : (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => clsx('flex min-h-11 items-center gap-3 rounded-md px-3 text-base', isActive ? 'bg-accent font-semibold text-white' : 'text-muted hover:bg-canvas hover:text-ink')}
              >
                <Icon size={20} aria-hidden="true" />
                {label}
              </NavLink>
            ),
          )}
        </nav>
        <p className="mt-auto px-5 py-4 text-sm text-muted">Decision support only. An officer reviews every flag before any action.</p>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-line bg-surface/95 px-4 py-2.5 backdrop-blur sm:px-8">
        <div className="flex shrink-0 items-center gap-3">
          <span className="lg:hidden">
            <Logo size={28} />
          </span>
          <p className="text-[0.9375rem] text-muted">
            <span className="hidden font-semibold text-ink sm:inline lg:hidden">{APP_NAME}</span>
            <span className="hidden lg:inline">Viewing: {scopeLabel(role.scope)}</span>
          </p>
        </div>
        <GlobalSearch />
        <AccountMenu />
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-8 lg:pb-12">
        {error && (
          <p role="alert" className="mb-5 rounded-md bg-high-soft px-4 py-3 text-high">
            {error}
          </p>
        )}
        {!loading && source === 'device' && (
          <p role="status" className="mb-5 rounded-md bg-medium-soft px-4 py-3 text-medium">
            The Netra service cannot be reached. You are working on this device with the built-in records, and changes are not shared.
          </p>
        )}
        <Outlet />
      </main>

      <Assistant />

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        {NAV.map(({ to, label, icon: Icon, end, external }) =>
          external ? (
            <a key={to} href={to} className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs text-muted">
              <Icon size={20} aria-hidden="true" />
              {label}
            </a>
          ) : (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => clsx('flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs', isActive ? 'font-semibold text-accent' : 'text-muted')}>
              <Icon size={20} aria-hidden="true" />
              {label}
            </NavLink>
          ),
        )}
      </nav>
    </div>
  )
}

export function PageTitle({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl leading-tight">{title}</h1>
      {children && <p className="mt-1 max-w-prose text-muted">{children}</p>}
    </div>
  )
}
