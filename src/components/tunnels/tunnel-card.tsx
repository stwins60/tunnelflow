'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Network, MoreVertical, Trash2, Pencil, Eye, Terminal } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TunnelStatusBadge } from '@/components/shared/status-badge'
import { CopyCode } from '@/components/shared/copy-button'
import { toast } from 'sonner'
import { AppTunnel } from '@/types'
import { formatDistanceToNow } from 'date-fns'

interface TunnelCardProps {
  tunnel: AppTunnel & { servers?: { id: string }[] }
  onDeleted: () => void
  onUpdated: () => void
}

export function TunnelCard({ tunnel, onDeleted, onUpdated }: TunnelCardProps) {
  const router = useRouter()
  const [renaming, setRenaming] = useState(false)
  const [newName, setNewName] = useState(tunnel.name)
  const [renameLoading, setRenameLoading] = useState(false)
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false)
  const [tokenData, setTokenData] = useState<{
    token: string
    commands: { docker: string; systemd: string; direct: string }
  } | null>(null)
  const [loadingToken, setLoadingToken] = useState(false)

  async function handleRename() {
    if (!newName.trim() || newName === tunnel.name) {
      setRenaming(false)
      return
    }
    setRenameLoading(true)
    try {
      const res = await fetch(`/api/tunnels/${tunnel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success('Tunnel renamed')
        onUpdated()
      } else {
        toast.error(data.error ?? 'Rename failed')
      }
    } catch {
      toast.error('Request failed')
    } finally {
      setRenameLoading(false)
      setRenaming(false)
    }
  }

  async function handleDelete() {
    try {
      const res = await fetch(`/api/tunnels/${tunnel.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.ok) {
        toast.success('Tunnel deleted')
        onDeleted()
      } else {
        toast.error(data.error ?? 'Delete failed')
      }
    } catch {
      toast.error('Request failed')
    }
  }

  async function handleGetToken() {
    setLoadingToken(true)
    setTokenDialogOpen(true)
    try {
      const res = await fetch(`/api/tunnels/${tunnel.id}/token`)
      const data = await res.json()
      if (data.ok) {
        setTokenData(data.data)
      } else {
        toast.error(data.error ?? 'Could not load token')
        setTokenDialogOpen(false)
      }
    } catch {
      toast.error('Request failed')
      setTokenDialogOpen(false)
    } finally {
      setLoadingToken(false)
    }
  }

  const serverCount = tunnel.servers?.length ?? 0

  return (
    <>
      <Card className="transition-shadow hover:shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Network className="h-5 w-5 shrink-0 text-primary" />
              {renaming ? (
                <div className="flex items-center gap-1">
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="h-7 text-sm font-semibold"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename()
                      if (e.key === 'Escape') setRenaming(false)
                    }}
                  />
                  <Button size="sm" onClick={handleRename} disabled={renameLoading}>
                    {renameLoading ? '…' : 'Save'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRenaming(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <span className="font-semibold truncate">{tunnel.name}</span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <TunnelStatusBadge status={tunnel.status as any} />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="View tunnel"
                onClick={() => router.push(`/dashboard/tunnels/${tunnel.id}`)}
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="Get install token"
                onClick={handleGetToken}
              >
                <Terminal className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="Rename"
                onClick={() => { setNewName(tunnel.name); setRenaming(true) }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    title="Delete tunnel"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete tunnel &quot;{tunnel.name}&quot;?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete the tunnel from Cloudflare and remove all{' '}
                      {serverCount} associated server route(s) and DNS record(s). This action cannot
                      be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete tunnel
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>{serverCount} server{serverCount !== 1 ? 's' : ''}</span>
            {tunnel.lastSyncAt && (
              <span>
                Synced {formatDistanceToNow(new Date(tunnel.lastSyncAt), { addSuffix: true })}
              </span>
            )}
          </div>
          <p className="font-mono text-xs text-muted-foreground truncate">{tunnel.cfTunnelId}</p>
        </CardContent>
      </Card>

      {/* Token dialog */}
      <Dialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Install cloudflared — {tunnel.name}</DialogTitle>
            <DialogDescription>
              Run one of these commands on the target server to connect it to this tunnel.
              Keep the token secret — it grants full tunnel access.
            </DialogDescription>
          </DialogHeader>
          {loadingToken ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Loading token…</div>
          ) : tokenData ? (
            <div className="space-y-4">
              <CopyCode label="Docker (recommended)" code={tokenData.commands.docker} />
              <CopyCode label="systemd (Linux service)" code={tokenData.commands.systemd} />
              <CopyCode label="Direct (foreground)" code={tokenData.commands.direct} />
              <p className="text-xs text-muted-foreground">
                After running the install command, the tunnel status will change to Active within a
                few seconds. Click Sync to refresh.
              </p>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTokenDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
