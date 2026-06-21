'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Network, Terminal, RefreshCw, Globe } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { TunnelStatusBadge, ServerStatusBadge } from '@/components/shared/status-badge'
import { CopyCode } from '@/components/shared/copy-button'
import { LoadingPage } from '@/components/shared/loading-spinner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { formatDistanceToNow } from 'date-fns'

export default function TunnelDetailPage() {
  const params = useParams()
  const router = useRouter()
  const tunnelId = params.id as string

  const [tunnel, setTunnel] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false)
  const [tokenData, setTokenData] = useState<any>(null)
  const [loadingToken, setLoadingToken] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/tunnels/${tunnelId}`)
      const data = await res.json()
      if (data.ok) setTunnel(data.data.tunnel)
      else setError(data.error ?? 'Failed to load tunnel')
    } catch {
      setError('Request failed')
    } finally {
      setLoading(false)
    }
  }, [tunnelId])

  useEffect(() => { load() }, [load])

  async function loadToken() {
    setLoadingToken(true)
    setTokenDialogOpen(true)
    try {
      const res = await fetch(`/api/tunnels/${tunnelId}/token`)
      const data = await res.json()
      if (data.ok) setTokenData(data.data)
    } catch {}
    finally { setLoadingToken(false) }
  }

  if (loading) return (
    <>
      <Header title="Tunnel Detail" />
      <LoadingPage />
    </>
  )

  if (error || !tunnel) return (
    <>
      <Header title="Tunnel Detail" />
      <div className="p-6">
        <Alert variant="destructive">
          <AlertDescription>{error ?? 'Tunnel not found'}</AlertDescription>
        </Alert>
        <Button variant="ghost" className="mt-4 gap-2" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
      </div>
    </>
  )

  const activeConnections = (tunnel.connections ?? []).filter((c: any) => c.status === 'connected')

  return (
    <>
      <Header title={tunnel.name} />
      <div className="p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard/tunnels" className="gap-1">
              <ArrowLeft className="h-4 w-4" /> Tunnels
            </Link>
          </Button>
        </div>

        {/* Tunnel summary */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Network className="h-5 w-5 text-primary" />
                <CardTitle>{tunnel.name}</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <TunnelStatusBadge status={tunnel.status} />
                <Button variant="outline" size="sm" onClick={loadToken} className="gap-1.5">
                  <Terminal className="h-3.5 w-3.5" />
                  Install Token
                </Button>
                <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Tunnel ID</p>
                <p className="font-mono text-xs">{tunnel.cfTunnelId}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Account ID</p>
                <p className="font-mono text-xs">{tunnel.accountId}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Created</p>
                <p>{formatDistanceToNow(new Date(tunnel.createdAt), { addSuffix: true })}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Last synced</p>
                <p>{tunnel.lastSyncAt ? formatDistanceToNow(new Date(tunnel.lastSyncAt), { addSuffix: true }) : 'Never'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Active connections */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Active Connections ({activeConnections.length})
            </CardTitle>
            <CardDescription>Live cloudflared replicas connected to this tunnel</CardDescription>
          </CardHeader>
          <CardContent>
            {activeConnections.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No active connections. Install cloudflared on a server using the install token above.
              </p>
            ) : (
              <div className="space-y-2">
                {activeConnections.map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between rounded border p-3 text-sm">
                    <div>
                      <p className="font-mono text-xs">{c.client_id}</p>
                      <p className="text-xs text-muted-foreground">{c.location} · v{c.client_version}</p>
                    </div>
                    <span className="text-xs text-green-600">Connected</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Servers */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Servers ({tunnel.servers?.length ?? 0})
              </CardTitle>
              <Button size="sm" asChild>
                <Link href={`/dashboard/servers/new?tunnelId=${tunnel.id}`}>
                  Add Server
                </Link>
              </Button>
            </div>
            <CardDescription>Services routed through this tunnel</CardDescription>
          </CardHeader>
          <CardContent>
            {!tunnel.servers?.length ? (
              <p className="text-sm text-muted-foreground">
                No servers assigned. Add a server to start routing traffic.
              </p>
            ) : (
              <div className="space-y-2">
                {tunnel.servers.map((server: any) => (
                  <div key={server.id} className="flex items-center justify-between rounded border p-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-primary" />
                        <span className="font-medium text-sm">{server.name}</span>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">
                        {server.subdomain} → {server.upstream}
                      </p>
                    </div>
                    <ServerStatusBadge status={server.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Token dialog */}
      <Dialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Install cloudflared — {tunnel.name}</DialogTitle>
            <DialogDescription>
              Run one of these on the target server. The token grants full tunnel access — keep it secret.
            </DialogDescription>
          </DialogHeader>
          {loadingToken ? (
            <div className="py-8 text-center text-muted-foreground">Loading…</div>
          ) : tokenData ? (
            <div className="space-y-4 max-h-[58vh] overflow-y-auto pr-1">
              <CopyCode label="Docker (recommended)" code={tokenData.commands.docker} />
              <CopyCode label="systemd (Linux service)" code={tokenData.commands.systemd} />
              <CopyCode label="Direct run" code={tokenData.commands.direct} />
              <CopyCode label="Kubernetes" code={tokenData.commands.kubernetes} />
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
