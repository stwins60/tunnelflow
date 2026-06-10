'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'
import { LoadingPage } from '@/components/shared/loading-spinner'
import { CheckCircle2, Shield, Eye, EyeOff } from 'lucide-react'

interface CfZone {
  id: string
  name: string
}

interface Settings {
  cfApiToken: string | null
  cfAccountId: string | null
  cfZones: CfZone[]
  setupComplete: boolean
}

interface AvailableZone {
  id: string
  name: string
  accountId: string
  accountName: string
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Available zones (from CF token)
  const [availableZones, setAvailableZones] = useState<AvailableZone[]>([])
  const [selectedZoneIds, setSelectedZoneIds] = useState<string[]>([])

  // Update token form
  const [newToken, setNewToken] = useState('')
  const [showToken, setShowToken] = useState(false)

  async function loadSettings() {
    try {
      const res = await fetch('/api/settings')
      const data = await res.json()
      if (data.ok) {
        const s: Settings = data.data.settings
        setSettings(s)
        setSelectedZoneIds(s.cfZones?.map((z) => z.id) ?? [])
      }
    } catch {}
    finally { setLoading(false) }
  }

  async function loadAvailableZones() {
    try {
      const res = await fetch('/api/zones')
      const data = await res.json()
      if (data.ok) setAvailableZones(data.data.zones ?? [])
    } catch {}
  }

  useEffect(() => {
    loadSettings()
    loadAvailableZones()
  }, [])

  async function handleUpdateToken() {
    if (!newToken.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiToken: newToken }),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success('API token updated')
        setNewToken('')
        loadSettings()
        loadAvailableZones()
      } else {
        setError(data.error ?? 'Failed to update token')
      }
    } catch {
      setError('Request failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdateZones() {
    if (selectedZoneIds.length === 0) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zoneIds: selectedZoneIds }),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success('Zones updated')
        loadSettings()
      } else {
        setError(data.error ?? 'Failed to update zones')
      }
    } catch {
      setError('Request failed')
    } finally {
      setSaving(false)
    }
  }

  // Has the zone selection changed from what's stored?
  const configuredIds = settings?.cfZones?.map((z) => z.id) ?? []
  const zonesChanged =
    selectedZoneIds.length !== configuredIds.length ||
    selectedZoneIds.some((id) => !configuredIds.includes(id))

  if (loading) return (
    <>
      <Header title="Settings" />
      <LoadingPage />
    </>
  )

  return (
    <>
      <Header title="Settings" />
      <div className="p-6 space-y-6 max-w-2xl">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Current config */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">Cloudflare Configuration</CardTitle>
            </div>
            <CardDescription>Current Cloudflare account settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-y-2 items-start">
              <span className="text-muted-foreground">API Token</span>
              <span className="flex items-center gap-1.5 font-medium">
                {settings?.cfApiToken === '[CONFIGURED]' ? (
                  <><CheckCircle2 className="h-4 w-4 text-green-500" /> Configured</>
                ) : (
                  <span className="text-destructive">Not configured</span>
                )}
              </span>
              <span className="text-muted-foreground">Account ID</span>
              <span className="font-mono text-xs">{settings?.cfAccountId ?? '—'}</span>
              <span className="text-muted-foreground pt-0.5">Active Zones</span>
              <div className="space-y-0.5">
                {settings?.cfZones?.length ? (
                  settings.cfZones.map((z) => (
                    <div key={z.id} className="font-medium">
                      {z.name}
                      <span className="ml-1.5 font-mono text-xs text-muted-foreground">{z.id}</span>
                    </div>
                  ))
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Update token */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Update API Token</CardTitle>
            <CardDescription>
              Replace the stored Cloudflare API token. The new token must have Tunnel: Edit and DNS: Edit permissions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="new-token">New API Token</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="new-token"
                    type={showToken ? 'text' : 'password'}
                    placeholder="Paste new token…"
                    value={newToken}
                    onChange={(e) => setNewToken(e.target.value)}
                    className="font-mono text-sm pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setShowToken(!showToken)}
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button onClick={handleUpdateToken} disabled={saving || !newToken.trim()}>
                  {saving ? 'Saving…' : 'Update'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Manage zones */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Manage Zones</CardTitle>
            <CardDescription>
              Select which domains this Tunnel Manager instance controls. New servers will use DNS records in the matching zone.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {availableZones.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No zones available. The API token may not have DNS zone access, or zones could not be fetched.
              </p>
            ) : (
              <div className="space-y-2">
                {availableZones.map((z) => (
                  <div key={z.id} className="flex items-center gap-3 rounded-md border px-3 py-2.5">
                    <Checkbox
                      id={`zone-${z.id}`}
                      checked={selectedZoneIds.includes(z.id)}
                      onCheckedChange={(checked) => {
                        setSelectedZoneIds((prev) =>
                          checked ? [...prev, z.id] : prev.filter((id) => id !== z.id)
                        )
                      }}
                    />
                    <label htmlFor={`zone-${z.id}`} className="flex-1 cursor-pointer text-sm">
                      <span className="font-medium">{z.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{z.accountName}</span>
                    </label>
                  </div>
                ))}
              </div>
            )}
            <Button
              onClick={handleUpdateZones}
              disabled={saving || selectedZoneIds.length === 0 || !zonesChanged}
            >
              {saving ? 'Saving…' : 'Save Zones'}
            </Button>
          </CardContent>
        </Card>

        {/* Multi-account */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Additional Cloudflare Accounts</CardTitle>
            <CardDescription>
              Store credentials for multiple Cloudflare accounts. The primary account is used for all operations by default.
              Manage via <code className="text-xs font-mono">GET/POST /api/accounts</code>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MultiAccountSection />
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function MultiAccountSection() {
  interface CfAccount { id: string; name: string; accountId: string; isPrimary: boolean; createdAt: string }
  const [accounts, setAccounts] = useState<CfAccount[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', accountId: '', apiToken: '', isPrimary: false })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/accounts')
      .then((r) => r.json())
      .then((d) => { if (d.ok) setAccounts(d.data.accounts) })
      .catch(() => null)
  }, [])

  async function handleAdd() {
    if (!form.name || !form.accountId || !form.apiToken) {
      toast.error('All fields are required')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success('Account added')
        setAccounts((prev) => [...prev, data.data.account])
        setForm({ name: '', accountId: '', apiToken: '', isPrimary: false })
        setShowForm(false)
      } else {
        toast.error(data.error ?? 'Failed to add account')
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this account?')) return
    const res = await fetch(`/api/accounts/${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.ok) {
      toast.success('Account removed')
      setAccounts((prev) => prev.filter((a) => a.id !== id))
    } else {
      toast.error(data.error ?? 'Remove failed')
    }
  }

  return (
    <div className="space-y-3">
      {accounts.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground">No additional accounts configured.</p>
      )}
      {accounts.map((acct) => (
        <div key={acct.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
          <div>
            <p className="text-sm font-medium">{acct.name} {acct.isPrimary && <span className="text-xs text-primary ml-1">(primary)</span>}</p>
            <p className="text-xs text-muted-foreground font-mono">{acct.accountId}</p>
          </div>
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDelete(acct.id)}>
            Remove
          </Button>
        </div>
      ))}
      {showForm ? (
        <div className="space-y-3 rounded-md border p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input placeholder="e.g. Production" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Account ID</Label>
              <Input placeholder="CF Account ID" value={form.accountId} onChange={(e) => setForm((f) => ({ ...f, accountId: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">API Token</Label>
            <Input type="password" placeholder="Token" value={form.apiToken} onChange={(e) => setForm((f) => ({ ...f, apiToken: e.target.value }))} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="is-primary" checked={form.isPrimary} onCheckedChange={(v) => setForm((f) => ({ ...f, isPrimary: Boolean(v) }))} />
            <label htmlFor="is-primary" className="text-sm cursor-pointer">Set as primary account</label>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={saving}>{saving ? 'Adding…' : 'Add Account'}</Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>Add Account</Button>
      )}
    </div>
  )
}
