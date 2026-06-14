'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  CloudLightning,
  ChevronRight,
  CheckCircle2,
  Circle,
  Loader2,
  Eye,
  EyeOff,
  ArrowLeft,
  ExternalLink,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'

const STEPS = [
  { id: 1, title: 'Your account', description: 'Create your login credentials' },
  { id: 2, title: 'Cloudflare token', description: 'Connect to your Cloudflare account' },
  { id: 3, title: 'Select zones', description: 'Choose domains to manage' },
  { id: 4, title: 'Ready', description: 'All set!' },
]

interface Zone {
  id: string
  name: string
  status: string
  accountId: string
  accountName: string
}

export default function RegisterPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)

  // Step 1 — account
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Step 2 — Cloudflare
  const [apiToken, setApiToken] = useState('')
  const [accountId, setAccountId] = useState('')
  const [zones, setZones] = useState<Zone[]>([])
  const [verifyingToken, setVerifyingToken] = useState(false)
  const [tokenVerified, setTokenVerified] = useState(false)

  // Step 3 — zone selection
  const [selectedZoneIds, setSelectedZoneIds] = useState<string[]>([])

  async function handleVerifyToken() {
    if (!apiToken.trim()) return
    setVerifyingToken(true)
    setError(null)
    try {
      const res = await fetch(`/api/zones?token=${encodeURIComponent(apiToken)}`)
      const data = await res.json()
      if (data.ok && data.data.zones?.length > 0) {
        setZones(data.data.zones)
        if (!accountId && data.data.zones[0]?.accountId) {
          setAccountId(data.data.zones[0].accountId)
        }
        setTokenVerified(true)
        toast.success(`Token verified — ${data.data.zones.length} zone(s) found`)
      } else {
        setError('Token is invalid or has no zone access. Check your API token permissions.')
        setTokenVerified(false)
      }
    } catch {
      setError('Failed to verify token')
    } finally {
      setVerifyingToken(false)
    }
  }

  async function handleFinish() {
    if (selectedZoneIds.length === 0) {
      setError('Please select at least one zone')
      return
    }
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, apiToken, accountId, zoneIds: selectedZoneIds }),
      })
      const data = await res.json()
      if (data.ok) {
        setStep(4)
      } else {
        setError(data.error ?? 'Registration failed')
      }
    } catch {
      setError('Request failed')
    } finally {
      setLoading(false)
    }
  }

  const progress = ((step - 1) / (STEPS.length - 1)) * 100

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">

        {/* Header */}
        <div className="text-center space-y-3">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600">
              <CloudLightning className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">TunnelFlow</span>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
            <p className="mt-1 text-sm text-gray-500">
              Already have an account?{' '}
              <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700">
                Sign in
              </Link>
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          {/* Progress */}
          <div className="mb-7 space-y-3">
            <div className="flex justify-between text-xs text-gray-400">
              <span>Step {Math.min(step, 3)} of 3</span>
              <span className="font-medium text-gray-600">{STEPS[step - 1]?.title}</span>
            </div>
            <Progress value={Math.min(progress, 100)} className="h-1.5" />

            {/* Step indicators */}
            <div className="flex items-center justify-between pt-1">
              {STEPS.slice(0, 3).map((s, i) => (
                <div key={s.id} className="flex items-center">
                  <div className={`flex items-center gap-1.5 text-xs ${
                    step > s.id
                      ? 'text-green-600'
                      : step === s.id
                      ? 'text-blue-600 font-semibold'
                      : 'text-gray-400'
                  }`}>
                    {step > s.id ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                        step === s.id ? 'border-blue-600' : 'border-gray-300'
                      }`}>
                        {step === s.id && <div className="h-2 w-2 rounded-full bg-blue-600" />}
                      </div>
                    )}
                    <span className="hidden sm:block">{s.title}</span>
                  </div>
                  {i < 2 && <ChevronRight className="h-3.5 w-3.5 mx-2 text-gray-300" />}
                </div>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <Alert variant="destructive" className="mb-5">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* ── Step 1: Account ── */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Create your account</h2>
                <p className="mt-0.5 text-sm text-gray-500">You'll use these to sign in to TunnelFlow.</p>
              </div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Minimum 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm">Confirm password</Label>
                  <Input
                    id="confirm"
                    type="password"
                    placeholder="Repeat your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <Button
                className="w-full"
                disabled={!email || !password || password !== confirmPassword || password.length < 8}
                onClick={() => {
                  if (password !== confirmPassword) { setError('Passwords do not match'); return }
                  setError(null)
                  setStep(2)
                }}
              >
                Continue
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          )}

          {/* ── Step 2: API Token ── */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Cloudflare API Token</h2>
                <p className="mt-0.5 text-sm text-gray-500">
                  Create a token with <strong>Cloudflare Tunnel: Edit</strong> and{' '}
                  <strong>DNS: Edit</strong> permissions.{' '}
                  <a
                    href="https://dash.cloudflare.com/profile/api-tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-blue-600 hover:text-blue-700"
                  >
                    Create token
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="api-token">API Token</Label>
                  <div className="flex gap-2">
                    <Input
                      id="api-token"
                      type="password"
                      placeholder="Paste your Cloudflare API token"
                      value={apiToken}
                      onChange={(e) => { setApiToken(e.target.value); setTokenVerified(false) }}
                      className="font-mono text-sm"
                    />
                    <Button
                      variant="outline"
                      onClick={handleVerifyToken}
                      disabled={verifyingToken || !apiToken.trim()}
                      className="shrink-0"
                    >
                      {verifyingToken ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify'}
                    </Button>
                  </div>
                  {tokenVerified && (
                    <p className="flex items-center gap-1.5 text-xs text-green-600">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Token verified successfully
                    </p>
                  )}
                </div>

                {tokenVerified && (
                  <div className="space-y-1.5">
                    <Label htmlFor="account-id">Account ID</Label>
                    <Input
                      id="account-id"
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                      placeholder="Cloudflare account ID"
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-gray-400">
                      Found in Cloudflare Dashboard → Account → Overview (right sidebar).
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  Back
                </Button>
                <Button
                  className="flex-1"
                  disabled={!tokenVerified || !accountId.trim()}
                  onClick={() => { setError(null); setStep(3) }}
                >
                  Continue
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 3: Zone selection ── */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Select domains</h2>
                <p className="mt-0.5 text-sm text-gray-500">
                  Choose one or more Cloudflare zones to manage.
                </p>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto">
                {zones.length === 0 && (
                  <p className="text-sm text-gray-500">No zones found for this token.</p>
                )}
                {zones.map((z) => (
                  <label
                    key={z.id}
                    htmlFor={`zone-${z.id}`}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 hover:bg-gray-100 transition-colors"
                  >
                    <Checkbox
                      id={`zone-${z.id}`}
                      checked={selectedZoneIds.includes(z.id)}
                      onCheckedChange={(checked) => {
                        setSelectedZoneIds((prev) =>
                          checked ? [...prev, z.id] : prev.filter((id) => id !== z.id)
                        )
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{z.name}</div>
                      <div className="text-xs text-gray-400 truncate">{z.accountName}</div>
                    </div>
                    {z.status === 'active' && (
                      <span className="shrink-0 rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">
                        active
                      </span>
                    )}
                  </label>
                ))}
              </div>

              {selectedZoneIds.length > 0 && (
                <p className="text-xs text-blue-600 font-medium">
                  {selectedZoneIds.length} zone{selectedZoneIds.length > 1 ? 's' : ''} selected
                </p>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)}>
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  Back
                </Button>
                <Button
                  className="flex-1"
                  disabled={selectedZoneIds.length === 0 || loading}
                  onClick={handleFinish}
                >
                  {loading ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating account…</>
                  ) : (
                    <>Create account</>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 4: Complete / Getting Started ── */}
          {step === 4 && (
            <div className="py-2 space-y-6">
              <div className="text-center space-y-2">
                <div className="flex justify-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-50">
                    <CheckCircle2 className="h-8 w-8 text-green-500" />
                  </div>
                </div>
                <h2 className="text-xl font-bold text-gray-900">You&apos;re all set!</h2>
                <p className="text-sm text-gray-500">
                  Your TunnelFlow account is ready. Here&apos;s how to get traffic flowing in 3 steps.
                </p>
              </div>

              {/* Getting Started steps */}
              <ol className="space-y-3">
                {[
                  {
                    n: 1,
                    title: 'Create a Tunnel',
                    desc: 'A tunnel is a persistent connection between Cloudflare and your network. One tunnel can serve many services.',
                    done: false,
                  },
                  {
                    n: 2,
                    title: 'Add a Server',
                    desc: 'Map a public hostname (e.g. app.example.com) to an internal service running on a container or host.',
                    done: false,
                  },
                  {
                    n: 3,
                    title: 'Go Live',
                    desc: 'TunnelFlow automatically creates the DNS record and updates the tunnel ingress — no manual Cloudflare config needed.',
                    done: false,
                  },
                ].map((s) => (
                  <li key={s.n} className="flex gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white mt-0.5">
                      {s.n}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{s.title}</p>
                      <p className="mt-0.5 text-xs text-gray-500">{s.desc}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="flex flex-col gap-2 pt-1">
                <Button className="w-full" size="lg" onClick={() => router.push('/dashboard/tunnels')}>
                  Create your first tunnel
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
                <Button variant="ghost" className="w-full text-gray-500" onClick={() => router.push('/dashboard')}>
                  Go to dashboard
                </Button>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400">
          By creating an account, you agree that your Cloudflare API tokens are stored encrypted
          and used only to manage your tunnels and DNS records.
        </p>
      </div>
    </div>
  )
}
