'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CloudLightning, ChevronRight, CheckCircle2, Loader2, Eye, EyeOff, ArrowLeft, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'

const STEPS = [
  { id: 1, title: 'API Token', description: 'Connect Cloudflare' },
  { id: 2, title: 'Select Zone', description: 'Choose domains' },
  { id: 3, title: 'Complete', description: 'Ready to go' },
]

interface Zone {
  id: string
  name: string
  status: string
  accountId: string
  accountName: string
}

export default function SetupPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [apiToken, setApiToken] = useState('')
  const [accountId, setAccountId] = useState('')
  const [zones, setZones] = useState<Zone[]>([])
  const [verifyingToken, setVerifyingToken] = useState(false)
  const [tokenVerified, setTokenVerified] = useState(false)
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
        setError('Token is invalid or has no zone access.')
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
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiToken, accountId, zoneIds: selectedZoneIds }),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success('Cloudflare credentials updated')
        setStep(3)
      } else {
        setError(data.error ?? 'Setup failed')
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

        <div className="text-center space-y-2">
          <Link href="/dashboard" className="inline-flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600">
              <CloudLightning className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">TunnelFlow</span>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Configure Cloudflare</h1>
            <p className="mt-1 text-sm text-gray-500">Connect or update your Cloudflare credentials</p>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          {/* Progress */}
          <div className="mb-7 space-y-3">
            <div className="flex justify-between text-xs text-gray-400">
              <span>Step {Math.min(step, 2)} of 2</span>
              <span className="font-medium text-gray-600">{STEPS[step - 1]?.title}</span>
            </div>
            <Progress value={Math.min(progress, 100)} className="h-1.5" />
          </div>

          {error && (
            <Alert variant="destructive" className="mb-5">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* ── Step 1: API Token ── */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Cloudflare API Token</h2>
                <p className="mt-0.5 text-sm text-gray-500">
                  Requires <strong>Cloudflare Tunnel: Edit</strong> and <strong>DNS: Edit</strong> permissions.{' '}
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
                      placeholder="Paste your token here"
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
                      <CheckCircle2 className="h-3.5 w-3.5" /> Token verified
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
                      Found in Cloudflare Dashboard → Account → Overview.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" asChild>
                  <Link href="/dashboard">
                    <ArrowLeft className="mr-1 h-4 w-4" /> Cancel
                  </Link>
                </Button>
                <Button
                  className="flex-1"
                  disabled={!tokenVerified || !accountId.trim()}
                  onClick={() => { setError(null); setStep(2) }}
                >
                  Continue
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 2: Zone selection ── */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Select zones</h2>
                <p className="mt-0.5 text-sm text-gray-500">
                  Choose the Cloudflare zones you want to manage.
                </p>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto">
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
                  </label>
                ))}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft className="mr-1 h-4 w-4" /> Back
                </Button>
                <Button
                  className="flex-1"
                  disabled={selectedZoneIds.length === 0 || loading}
                  onClick={handleFinish}
                >
                  {loading ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</>
                  ) : 'Save credentials'}
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 3: Complete ── */}
          {step === 3 && (
            <div className="py-4 text-center space-y-5">
              <div className="flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
                  <CheckCircle2 className="h-9 w-9 text-green-500" />
                </div>
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Credentials updated!</h2>
                <p className="mt-2 text-sm text-gray-500">
                  Your Cloudflare credentials have been saved. Head to the dashboard to manage your tunnels.
                </p>
              </div>
              <Button className="w-full" size="lg" onClick={() => router.push('/dashboard')}>
                Go to dashboard
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
