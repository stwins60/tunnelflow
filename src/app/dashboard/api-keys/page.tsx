'use client'

import { useState, useEffect, useCallback } from 'react'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { LoadingPage } from '@/components/shared/loading-spinner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { formatDistanceToNow } from 'date-fns'
import { Plus, Trash2, Copy, Key, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

const ALL_SCOPES = ['read', 'write', 'deploy', 'admin'] as const
type Scope = (typeof ALL_SCOPES)[number]

interface ApiKey {
  id: string
  name: string
  prefix: string
  scopes: string
  expiresAt: string | null
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newKey, setNewKey] = useState<string | null>(null)

  // Create form
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<Scope[]>(['read'])
  const [expiresAt, setExpiresAt] = useState('')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/apikeys')
    const data = await res.json()
    if (data.ok) setKeys(data.data.apiKeys)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function toggleScope(scope: Scope) {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    )
  }

  async function handleCreate() {
    if (!name.trim()) { toast.error('Name is required'); return }
    if (!scopes.length) { toast.error('Select at least one scope'); return }

    setCreating(true)
    try {
      const res = await fetch('/api/apikeys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), scopes, expiresAt: expiresAt || null }),
      })
      const data = await res.json()
      if (!data.ok) { toast.error(data.error ?? 'Failed to create key'); return }
      setNewKey(data.data.rawKey)
      setName('')
      setScopes(['read'])
      setExpiresAt('')
      setShowCreate(false)
      load()
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm('Revoke this API key? This cannot be undone.')) return
    const res = await fetch(`/api/apikeys/${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.ok) { toast.success('Key revoked'); load() }
    else toast.error(data.error ?? 'Failed to revoke')
  }

  const active = keys.filter((k) => !k.revokedAt)
  const revoked = keys.filter((k) => k.revokedAt)

  return (
    <>
      <Header title="API Keys" />
      <div className="p-6 space-y-5">

        {/* New key reveal */}
        {newKey && (
          <Alert className="border-green-500/50 bg-green-500/10">
            <AlertTriangle className="h-4 w-4 text-green-600" />
            <AlertDescription className="space-y-2">
              <p className="font-medium text-green-700">Your new API key — copy it now, it will not be shown again.</p>
              <div className="flex items-center gap-2">
                <code className="bg-background border rounded px-3 py-1 text-sm font-mono flex-1 break-all">
                  {newKey}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { navigator.clipboard.writeText(newKey); toast.success('Copied!') }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setNewKey(null)}>Dismiss</Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">API Keys</h2>
            <p className="text-sm text-muted-foreground">
              Use Bearer tokens to authenticate the deployment API (<code className="text-xs">POST /api/deploy</code>).
            </p>
          </div>
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New Key
          </Button>
        </div>

        {loading ? (
          <LoadingPage />
        ) : active.length === 0 && !loading ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center space-y-3">
              <Key className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">No API keys yet.</p>
              <Button onClick={() => setShowCreate(true)} variant="outline">Create your first key</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {active.map((key) => (
              <Card key={key.id}>
                <CardContent className="py-3 flex items-center gap-3">
                  <Key className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{key.name}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <code className="text-xs text-muted-foreground font-mono">{key.prefix}…</code>
                      {(JSON.parse(key.scopes) as string[]).map((s) => (
                        <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
                      ))}
                      {key.expiresAt && (
                        <span className="text-xs text-muted-foreground">
                          expires {formatDistanceToNow(new Date(key.expiresAt), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Created {formatDistanceToNow(new Date(key.createdAt), { addSuffix: true })}
                      {key.lastUsedAt && ` · last used ${formatDistanceToNow(new Date(key.lastUsedAt), { addSuffix: true })}`}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleRevoke(key.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {revoked.length > 0 && (
          <details className="text-sm text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground">
              {revoked.length} revoked key{revoked.length !== 1 ? 's' : ''}
            </summary>
            <div className="mt-2 space-y-1 pl-4 border-l">
              {revoked.map((key) => (
                <p key={key.id} className="line-through opacity-50">{key.name} <span className="font-mono text-xs">{key.prefix}…</span></p>
              ))}
            </div>
          </details>
        )}

        {/* Create dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create API Key</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  placeholder="e.g. CI/CD Pipeline"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Scopes</Label>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_SCOPES.map((scope) => (
                    <div key={scope} className="flex items-center gap-2">
                      <Checkbox
                        id={`scope-${scope}`}
                        checked={scopes.includes(scope)}
                        onCheckedChange={() => toggleScope(scope)}
                      />
                      <label htmlFor={`scope-${scope}`} className="text-sm capitalize cursor-pointer">{scope}</label>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  <strong>read</strong>: list resources · <strong>write</strong>: create/update · <strong>deploy</strong>: provision/deprovision · <strong>admin</strong>: all
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Expires at <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? 'Creating…' : 'Create Key'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  )
}
