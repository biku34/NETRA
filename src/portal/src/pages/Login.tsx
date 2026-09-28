import { useState, type FormEvent } from 'react'
import { Logo } from '../components/Layout.tsx'
import { Button } from '../components/ui.tsx'
import { APP_NAME, APP_TAGLINE } from '../config.ts'
import { useStore } from '../state/store.tsx'

export function Login() {
  const { signIn } = useStore()
  const [id, setId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    if (!(await signIn(id.trim(), password))) setError('User ID or password is incorrect. Check both and try again.')
    setBusy(false)
  }

  const input = 'mt-1 block min-h-11 w-full rounded-md border border-line bg-surface px-3 text-base'
  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <Logo size={44} />
          <div>
            <h1 className="text-2xl leading-tight">{APP_NAME}</h1>
            <p className="text-muted">{APP_TAGLINE}</p>
          </div>
        </div>
        <form onSubmit={submit} className="rounded-lg border border-line bg-surface p-6">
          <h2 className="text-lg">Sign in</h2>
          <label className="mt-4 block text-[0.9375rem]">
            User ID
            <input className={input} value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" required />
          </label>
          <label className="mt-4 block text-[0.9375rem]">
            Password
            <input className={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          {error && (
            <p role="alert" className="mt-4 rounded-md bg-high-soft px-3 py-2 text-[0.9375rem] text-high">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" className="mt-6 w-full" disabled={busy}>
            {busy ? 'Signing in' : 'Sign in'}
          </Button>
        </form>
        <p className="mt-4 text-sm text-muted">Development build. All FIR records shown are synthetic.</p>
      </div>
    </div>
  )
}
