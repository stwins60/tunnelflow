'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Network, Server, CheckCircle2, AlertCircle, Plus, ArrowRight, Activity, RefreshCw } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TunnelStatusBadge } from '@/components/shared/status-badge'
import { LoadingPage } from '@/components/shared/loading-spinner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'

interface DashboardData {
  tunnels: Array<{
    id: string
    name: string
    status: string
    servers: { id: string }[]
    lastSyncAt: string | null
  }>
  servers: Array<{
    id: string
    name: string
    subdomain: string
    status: string
    tunnel: { name: string } | null
  }>
  settings: {
    cfZoneName: string | null
    setupComplete: boolean
  }
}

interface HealthSummary {
  total: number
  up: number
  down: number
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [health, setHealth] = useState<HealthSummary | null>(null)
  const [healthChecking, setHealthChecking] = useState(false)

  async function load() {
    try {
      const [tunnelsRes, serversRes, settingsRes] = await Promise.all([
        fetch('/api/tunnels'),
        fetch('/api/servers'),
        fetch('/api/settings'),
      ])
      const [tunnels, servers, settings] = await Promise.all([
        tunnelsRes.json(),
        serversRes.json(),
        settingsRes.json(),
      ])
      setData({
        tunnels: tunnels.data?.tunnels ?? [],
        servers: servers.data?.servers ?? [],
        settings: settings.data?.settings ?? {},
      })
    } catch {
      setError('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  async function runHealthCheck() {
    setHealthChecking(true)
    try {
      const res = await fetch('/api/health-check', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setHealth(data.data.summary)
        toast.success(`Health check complete: ${data.data.summary.up}/${data.data.summary.total} up`)
      }
    } catch {
      toast.error('Health check failed')
    } finally {
      setHealthChecking(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading) return (
    <>
      <Header title="Dashboard" />
      <LoadingPage />
    </>
  )

  const activeTunnels = data?.tunnels.filter((t) => t.status === 'active').length ?? 0
  const totalTunnels = data?.tunnels.length ?? 0
  const activeServers = data?.servers.filter((s) => s.status === 'active').length ?? 0
  const totalServers = data?.servers.length ?? 0
  const driftServers = data?.servers.filter((s) => s.status === 'error').length ?? 0

  return (
    <>
      <Header title="Dashboard" />
      <div className="p-6 space-y-6">

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Zone indicator */}
        {data?.settings.cfZoneName && (
          <p className="text-sm text-muted-foreground">
            Managing zone: <span className="font-medium text-foreground">{data.settings.cfZoneName}</span>
          </p>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-2">
                <Network className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium">Tunnels</span>
              </div>
              <div className="mt-2">
                <span className="text-3xl font-bold">{activeTunnels}</span>
                <span className="text-muted-foreground text-sm">/{totalTunnels} active</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-2">
                <Server className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium">Servers</span>
              </div>
              <div className="mt-2">
                <span className="text-3xl font-bold">{activeServers}</span>
                <span className="text-muted-foreground text-sm">/{totalServers} active</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <span className="text-sm font-medium">Healthy</span>
              </div>
              <div className="mt-2">
                {health ? (
                  <>
                    <span className="text-3xl font-bold">{health.up}</span>
                    <span className="text-muted-foreground text-sm">/{health.total} up</span>
                  </>
                ) : (
                  <span className="text-3xl font-bold text-muted-foreground">—</span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-destructive" />
                <span className="text-sm font-medium">Issues</span>
              </div>
              <div className="mt-2">
                <span className="text-3xl font-bold">{driftServers + (health?.down ?? 0)}</span>
                <span className="text-muted-foreground text-sm"> total</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Usage summary bar */}
        <Card>
          <CardContent className="py-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span className="text-muted-foreground">Usage summary:</span>
              <span><strong>{totalTunnels}</strong> tunnel{totalTunnels !== 1 ? 's' : ''}</span>
              <span><strong>{totalServers}</strong> server{totalServers !== 1 ? 's' : ''}</span>
              <span><strong>{activeServers}</strong> active route{activeServers !== 1 ? 's' : ''}</span>
              {driftServers > 0 && (
                <span className="text-destructive font-medium"><strong>{driftServers}</strong> drift{driftServers !== 1 ? 's' : ''}</span>
              )}
              <div className="ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={runHealthCheck}
                  disabled={healthChecking || totalServers === 0}
                >
                  <Activity className={`h-3.5 w-3.5 ${healthChecking ? 'animate-pulse' : ''}`} />
                  {healthChecking ? 'Checking…' : 'Run Health Check'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick actions */}
        {totalTunnels === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center space-y-3">
              <Network className="h-10 w-10 text-muted-foreground mx-auto" />
              <h3 className="font-semibold">No tunnels yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Create your first tunnel to start routing traffic from Cloudflare to your servers.
              </p>
              <Button asChild>
                <Link href="/dashboard/tunnels">
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Tunnel
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {totalTunnels > 0 && totalServers === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center space-y-3">
              <Server className="h-10 w-10 text-muted-foreground mx-auto" />
              <h3 className="font-semibold">No servers yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Add a server to route a subdomain to a local service through your tunnel.
              </p>
              <Button asChild>
                <Link href="/dashboard/servers/new">
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Server
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Recent tunnels */}
        {data && data.tunnels.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Tunnels</h2>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard/tunnels" className="gap-1">
                  View all <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.tunnels.slice(0, 6).map((tunnel) => (
                <Card key={tunnel.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-medium text-sm truncate">{tunnel.name}</span>
                      <TunnelStatusBadge status={tunnel.status as any} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {tunnel.servers?.length ?? 0} server(s)
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Recent servers */}
        {data && data.servers.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Recent Servers</h2>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard/servers" className="gap-1">
                  View all <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Name</th>
                    <th className="text-left px-4 py-2 font-medium hidden sm:table-cell">Hostname</th>
                    <th className="text-left px-4 py-2 font-medium hidden md:table-cell">Tunnel</th>
                    <th className="text-left px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.servers.slice(0, 8).map((server) => (
                    <tr key={server.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-medium">{server.name}</td>
                      <td className="px-4 py-2.5 font-mono text-xs hidden sm:table-cell text-muted-foreground">{server.subdomain}</td>
                      <td className="px-4 py-2.5 hidden md:table-cell text-muted-foreground text-xs">{server.tunnel?.name ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <TunnelStatusBadge status={server.status as any} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

