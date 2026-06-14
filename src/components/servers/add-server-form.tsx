'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { AppTunnel } from '@/types'

interface CfZone {
  id: string
  name: string
}

interface AddServerFormProps {
  defaultTunnelId?: string
  onSuccess?: () => void
}

export function AddServerForm({ defaultTunnelId, onSuccess }: AddServerFormProps) {
  const router = useRouter()
  const [tunnels, setTunnels] = useState<AppTunnel[]>([])
  const [zones, setZones] = useState<CfZone[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflictData, setConflictData] = useState<{
    existing: { id?: string; type?: string; content?: string }
  } | null>(null)
  const [pendingPayload, setPendingPayload] = useState<Record<string, unknown> | null>(null)

  const [form, setForm] = useState({
    name: '',
    subdomain: '',
    upstream: '',
    protocol: 'http',
    tunnelId: defaultTunnelId ?? '',
    zoneId: '',
    notes: '',
  })

  useEffect(() => {
    fetch('/api/tunnels')
      .then((r) => r.json())
      .then((d) => { if (d.ok) setTunnels(d.data.tunnels) })

    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && Array.isArray(d.data?.settings?.cfZones)) {
          setZones(d.data.settings.cfZones)
        }
      })
  }, [])

  // Auto-detect zone from subdomain input
  useEffect(() => {
    if (!form.subdomain || zones.length === 0) return
    if (form.zoneId) return // don't override a manual selection
    const lower = form.subdomain.toLowerCase()
    let best: CfZone | null = null
    for (const z of zones) {
      const zn = z.name.toLowerCase()
      if (lower === zn || lower.endsWith(`.${zn}`)) {
        if (!best || z.name.length > best.name.length) best = z
      }
    }
    if (best) setForm((f) => ({ ...f, zoneId: best!.id }))
  }, [form.subdomain, zones]) // eslint-disable-line react-hooks/exhaustive-deps

  function set(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function submit(overwriteDns = false) {
    setLoading(true)
    setError(null)

    const payload = {
      name: form.name.trim(),
      subdomain: form.subdomain.trim(),
      upstream: form.upstream.trim(),
      protocol: form.protocol,
      tunnelId: form.tunnelId || null,
      zoneId: form.zoneId || null,
      notes: form.notes.trim() || null,
      overwriteDns,
    }

    try {
      const res = await fetch('/api/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()

      if (res.status === 409 && data.data?.conflict) {
        // DNS conflict — ask user what to do
        setConflictData({ existing: data.data.existingRecord })
        setPendingPayload(payload)
        setLoading(false)
        return
      }

      if (data.ok) {
        if (data.data?.warning) {
          toast.warning(data.data.warning)
        } else {
          toast.success(`Server "${form.name}" added and provisioned`)
        }
        onSuccess?.()
        router.push('/dashboard/servers')
      } else {
        setError(data.error ?? 'Failed to add server')
      }
    } catch {
      setError('Request failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="space-y-5 max-w-lg">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="server-name">Server name *</Label>
          <Input
            id="server-name"
            placeholder="My App Server"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="subdomain">Public hostname (subdomain) *</Label>
          <Input
            id="subdomain"
            placeholder="app.example.com"
            value={form.subdomain}
            onChange={(e) => set('subdomain', e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Full domain, e.g. <code className="font-mono">app.example.com</code>
          </p>
        </div>

        {zones.length > 1 && (
          <div className="space-y-2">
            <Label htmlFor="zone">Zone *</Label>
            <Select value={form.zoneId} onValueChange={(v) => set('zoneId', v)}>
              <SelectTrigger id="zone">
                <SelectValue placeholder="Select zone…" />
              </SelectTrigger>
              <SelectContent>
                {zones.map((z) => (
                  <SelectItem key={z.id} value={z.id}>{z.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Auto-detected from hostname — override if needed.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="upstream">Upstream address *</Label>
          <Input
            id="upstream"
            placeholder="tunnel-manager:3000"
            value={form.upstream}
            onChange={(e) => set('upstream', e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Container name, hostname, or full URL — e.g. <code className="font-mono">tunnel-manager:3000</code> or <code className="font-mono">http://localhost:8080</code>. Protocol is added automatically if omitted.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="protocol">Protocol</Label>
          <Select value={form.protocol} onValueChange={(v) => set('protocol', v)}>
            <SelectTrigger id="protocol">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="http">HTTP</SelectItem>
              <SelectItem value="https">HTTPS</SelectItem>
              <SelectItem value="tcp">TCP</SelectItem>
              <SelectItem value="ssh">SSH</SelectItem>
              <SelectItem value="rdp">RDP</SelectItem>
              <SelectItem value="smb">SMB</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tunnel">Tunnel</Label>
          <Select
            value={form.tunnelId}
            onValueChange={(v) => set('tunnelId', v)}
          >
            <SelectTrigger id="tunnel">
              <SelectValue placeholder="Select a tunnel…" />
            </SelectTrigger>
            <SelectContent>
              {tunnels.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name} ({t.status})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!form.tunnelId && (
            <p className="text-xs text-muted-foreground">
              No tunnel selected — server will be saved but not provisioned.
              You can create a tunnel first on the Tunnels page.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea
            id="notes"
            placeholder="Any notes about this server…"
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            rows={2}
          />
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            onClick={() => submit(false)}
            disabled={loading || !form.name || !form.subdomain || !form.upstream}
          >
            {loading ? 'Adding…' : form.tunnelId ? 'Add & Provision' : 'Add Server'}
          </Button>
          <Button variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </div>

      {/* DNS conflict resolution dialog */}
      <AlertDialog
        open={conflictData !== null}
        onOpenChange={(v) => { if (!v) setConflictData(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>DNS record conflict</AlertDialogTitle>
            <AlertDialogDescription>
              A DNS record already exists for <strong>{form.subdomain}</strong>:
              <br />
              Type: {conflictData?.existing?.type} → {conflictData?.existing?.content}
              <br /><br />
              Do you want to overwrite it with the new tunnel record?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConflictData(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConflictData(null)
                submit(true)
              }}
            >
              Overwrite DNS record
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

