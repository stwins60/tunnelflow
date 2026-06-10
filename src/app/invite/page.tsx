'use client'

import { Suspense } from 'react'
import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { CloudLightning, Loader2, CheckCircle2, XCircle, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'

type State = 'loading' | 'valid' | 'invalid' | 'submitting' | 'done'

export default function InvitePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    }>
      <InviteInner />
    </Suspense>
  )
}

function InviteInner() {
  const params = useSearchParams()
  const router = useRouter()
  const token  = params.get('token') ?? ''

  const [state, setState]         = useState<State>('loading')
  const [inviteEmail, setInviteEmail] = useState('')
  const [accessLevel, setAccessLevel] = useState('')
  const [errorMsg, setErrorMsg]   = useState('')
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [showPw, setShowPw]       = useState(false)

  useEffect(() => {
    if (!token) { setState('invalid'); setErrorMsg('No invite token in URL.'); return }

    fetch(`/api/invite?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(j => {
        if (j.ok) {
          setInviteEmail(j.data.email)
          setAccessLevel(j.data.accessLevel)
          setState('valid')
        } else {
          setErrorMsg(j.error ?? 'Invalid invite link.')
          setState('invalid')
        }
      })
      .catch(() => { setErrorMsg('Could not verify invite link.'); setState('invalid') })
  }, [token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { toast.error('Password must be at least 8 characters'); return }
    if (password !== confirm) { toast.error('Passwords do not match'); return }

    setState('submitting')
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, password, token }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Registration failed')
      setState('done')
      setTimeout(() => router.push('/dashboard'), 1500)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Registration failed')
      setState('valid')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600">
            <CloudLightning className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold text-gray-900">TunnelFlow</span>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {state === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-6 text-gray-400">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p className="text-sm">Verifying invite link…</p>
            </div>
          )}

          {state === 'invalid' && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <XCircle className="w-10 h-10 text-red-400" />
              <h2 className="text-lg font-semibold text-gray-900">Invalid invite</h2>
              <p className="text-sm text-gray-500">{errorMsg}</p>
            </div>
          )}

          {state === 'done' && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
              <h2 className="text-lg font-semibold text-gray-900">Account created!</h2>
              <p className="text-sm text-gray-500">Redirecting to your dashboard…</p>
            </div>
          )}

          {(state === 'valid' || state === 'submitting') && (
            <>
              <div className="mb-6">
                <h1 className="text-xl font-bold text-gray-900">You've been invited</h1>
                <p className="text-sm text-gray-500 mt-1">
                  Set a password to create your account as <span className="font-medium text-gray-700">{inviteEmail}</span>
                  {accessLevel && (
                    <span className="ml-1">with <span className="font-medium text-blue-600">{accessLevel}</span> access</span>
                  )}.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    value={inviteEmail}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Repeat password"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={state === 'submitting'}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {state === 'submitting' && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create account
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
