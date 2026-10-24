'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'
import type { AppServer, AppTunnel } from '@/types'

interface CfZone {
  id: string
  name: string
}

interface EditServerDialogProps {
  server: AppServer
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdated?: () => void
}

export function EditServerDialog({
  server,
  open,
  onOpenChange,
  onUpdated,
}: EditServerDialogProps) {
  const [tunnels, setTunnels] = useState<AppTunnel[]>([])
  const [zones, setZones] = useState<CfZone[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: server.name || '',
    subdomain: server.subdomain || '',
    upstream: server.upstream || '',
    protocol: server.protocol || 'http',
    tunnelId: server.tunnelId || 'none',
    zoneId: (server as any).zoneId || '',
    notes: server.notes || '',
    reprovision: true,
  })

  // Re-sync form state whenever server prop changes or dialog opens
  useEffect(() => {
    if (open) {
      setForm({
        name: server.name || '',
        subdomain: server.subdomain || '',
        upstream: server.upstream || '',
        protocol: server.protocol || 'http',
        tunnelId: server.tunnelId || 'none',
        zoneId: (server as any).zoneId || '',
        notes: server.notes || '',
        reprovision: true,
      })
      setError(null)
    }
  }, [open, server])

  useEffect(() => {
    if (!open) return

    fetch('/api/tunnels')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setTunnels(d.data.tunnels)
      })
      .catch(() => null)

    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && Array.isArray(d.data?.settings?.cfZones)) {
          setZones(d.data.settings.cfZones)
        }
      })
      .catch(() => null)
  }, [open])

  // Auto-detect zone from subdomain input if zoneId not explicitly selected
  useEffect(() => {
    if (!form.subdomain || zones.length === 0) return
    if (form.zoneId) return
    const lower = form.subdomain.toLowerCase()
    let best: CfZone | null = null
    for (const z of zones) {
      const zn = z.name.toLowerCase()
      if (lower === zn || lower.endsWith(`.${zn}`)) {
        if (!best || z.name.length > best.name.length) best = z
      }
    }
    if (best) setForm((f) => ({ ...f, zoneId: best!.id }))
  }, [form.subdomain, zones])

  function set(key: string, value: any) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSave() {
    setLoading(true)
    setError(null)

    const payload = {
      name: form.name.trim(),
      subdomain: form.subdomain.trim(),
      upstream: form.upstream.trim(),
      protocol: form.protocol,
      tunnelId: form.tunnelId === 'none' ? null : form.tunnelId,
      zoneId: form.zoneId ? form.zoneId : null,
      notes: form.notes.trim() || null,
      reprovision: form.reprovision,
    }

    try {
      const res = await fetch(`/api/servers/${server.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()

      if (data.ok) {
        if (data.data?.warning) {
          toast.warning(data.data.warning)
        } else {
          toast.success(`Server "${form.name}" updated successfully`)
        }
        onUpdated?.()
        onOpenChange(false)
      } else {
        setError(data.error ?? 'Failed to update server')
      }
    } catch {
      setError('Request failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Server</DialogTitle>
          <DialogDescription>
            Update server configuration, routing, and tunnel bindings.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4 py-1">
          <div className="space-y-2">
            <Label htmlFor="edit-server-name">Server name *</Label>
            <Input
              id="edit-server-name"
              placeholder="e.g. Production Web"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-subdomain">Public hostname (subdomain) *</Label>
            <Input
              id="edit-subdomain"
              placeholder="e.g. app.example.com"
              value={form.subdomain}
              onChange={(e) => set('subdomain', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Changing the hostname will update both the Cloudflare DNS record and tunnel route.
            </p>
          </div>

          {zones.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="edit-zone">Zone</Label>
              <Select value={form.zoneId} onValueChange={(v) => set('zoneId', v)}>
                <SelectTrigger id="edit-zone">
                  <SelectValue placeholder="Select zone…" />
                </SelectTrigger>
                <SelectContent>
                  {zones.map((z) => (
                    <SelectItem key={z.id} value={z.id}>
                      {z.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="edit-upstream">Upstream address *</Label>
            <Input
              id="edit-upstream"
              placeholder="e.g. 192.168.1.50:8080 or localhost:3000"
              value={form.upstream}
              onChange={(e) => set('upstream', e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Destination service address or URL. Protocol is prepended automatically if omitted.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-protocol">Protocol</Label>
            <Select value={form.protocol} onValueChange={(v) => set('protocol', v)}>
              <SelectTrigger id="edit-protocol">
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
            <Label htmlFor="edit-tunnel">Tunnel</Label>
            <Select value={form.tunnelId} onValueChange={(v) => set('tunnelId', v)}>
              <SelectTrigger id="edit-tunnel">
                <SelectValue placeholder="Select tunnel…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (unassigned)</SelectItem>
                {tunnels.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} ({t.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-notes">Notes (optional)</Label>
            <Textarea
              id="edit-notes"
              placeholder="Any notes or context for this server…"
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex items-center space-x-2 pt-2">
            <Checkbox
              id="edit-reprovision"
              checked={form.reprovision}
              onCheckedChange={(checked) => set('reprovision', !!checked)}
            />
            <Label htmlFor="edit-reprovision" className="text-sm font-normal cursor-pointer">
              Reprovision live tunnel ingress rules and DNS record on save
            </Label>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading || !form.name.trim() || !form.subdomain.trim() || !form.upstream.trim()}
          >
            {loading ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
