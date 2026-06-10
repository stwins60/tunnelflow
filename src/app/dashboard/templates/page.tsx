'use client'

import { useState, useEffect, useCallback } from 'react'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LoadingPage } from '@/components/shared/loading-spinner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { LayoutTemplate, Plus, Trash2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'

interface ServerTemplate {
  id: string
  name: string
  description: string | null
  protocol: string
  upstreamPattern: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

const BLANK: Omit<ServerTemplate, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '',
  description: null,
  protocol: 'http',
  upstreamPattern: null,
  notes: null,
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<ServerTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<ServerTemplate | null>(null)
  const [showDialog, setShowDialog] = useState(false)
  const [form, setForm] = useState({ ...BLANK })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/templates')
    const data = await res.json()
    if (data.ok) setTemplates(data.data.templates)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function openCreate() {
    setEditing(null)
    setForm({ name: '', description: null, protocol: 'http', upstreamPattern: null, notes: null })
    setShowDialog(true)
  }

  function openEdit(t: ServerTemplate) {
    setEditing(t)
    setForm({ name: t.name, description: t.description, protocol: t.protocol, upstreamPattern: t.upstreamPattern, notes: t.notes })
    setShowDialog(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      const url = editing ? `/api/templates/${editing.id}` : '/api/templates'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description || null,
          protocol: form.protocol,
          upstreamPattern: form.upstreamPattern || null,
          notes: form.notes || null,
        }),
      })
      const data = await res.json()
      if (!data.ok) { toast.error(data.error ?? 'Save failed'); return }
      toast.success(editing ? 'Template updated' : 'Template created')
      setShowDialog(false)
      load()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this template?')) return
    const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.ok) { toast.success('Template deleted'); load() }
    else toast.error(data.error ?? 'Delete failed')
  }

  return (
    <>
      <Header title="Route Templates" />
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Route Templates</h2>
            <p className="text-sm text-muted-foreground">
              Reusable presets for quickly creating new server routes.
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> New Template
          </Button>
        </div>

        {loading ? (
          <LoadingPage />
        ) : templates.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center space-y-3">
              <LayoutTemplate className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">No templates yet.</p>
              <Button onClick={openCreate} variant="outline">Create your first template</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <Card key={t.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm">{t.name}</CardTitle>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(t.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {t.description && (
                    <CardDescription className="text-xs">{t.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground space-y-1">
                  <p>Protocol: <span className="font-medium text-foreground">{t.protocol}</span></p>
                  {t.upstreamPattern && (
                    <p>Upstream pattern: <code className="font-mono">{t.upstreamPattern}</code></p>
                  )}
                  {t.notes && <p className="italic">{t.notes}</p>}
                  <p className="pt-1">Updated {formatDistanceToNow(new Date(t.updatedAt), { addSuffix: true })}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create / Edit dialog */}
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit Template' : 'New Template'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input
                  placeholder="e.g. Internal HTTP service"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input
                  placeholder="Optional description"
                  value={form.description ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value || null }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Default protocol</Label>
                <Select value={form.protocol} onValueChange={(v) => setForm((f) => ({ ...f, protocol: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['http', 'https', 'tcp', 'ssh', 'rdp', 'smb'].map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Upstream pattern</Label>
                <Input
                  placeholder="e.g. http://localhost:{port}"
                  value={form.upstreamPattern ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, upstreamPattern: e.target.value || null }))}
                />
                <p className="text-xs text-muted-foreground">Optional template for the upstream URL.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea
                  placeholder="Any notes for this template type"
                  value={form.notes ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value || null }))}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Template'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  )
}
