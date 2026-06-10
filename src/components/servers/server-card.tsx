'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Globe, Trash2, RefreshCw, ExternalLink, Activity, Wrench } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { ServerStatusBadge } from '@/components/shared/status-badge'
import { toast } from 'sonner'
import { AppServer } from '@/types'
import { formatDistanceToNow } from 'date-fns'

interface HealthData {
  latest: { status: string; responseMs: number | null; checkedAt: string } | null
  inMaintenance: boolean
}

interface ServerCardProps {
  server: AppServer
  onDeleted: () => void
  onUpdated: () => void
}

export function ServerCard({ server, onDeleted, onUpdated }: ServerCardProps) {
  const router = useRouter()
  const [provisioning, setProvisioning] = useState(false)
  const [healthData, setHealthData] = useState<HealthData | null>(null)

  useEffect(() => {
    fetch(`/api/servers/${server.id}/health`)
      .then((r) => r.json())
      .then((d) => { if (d.ok) setHealthData(d.data) })
      .catch(() => null)
  }, [server.id])

  async function handleDelete() {
    try {
      const res = await fetch(`/api/servers/${server.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.ok) {
        toast.success(`Server "${server.name}" deleted`)
        onDeleted()
      } else {
        toast.error(data.error ?? 'Delete failed')
      }
    } catch {
      toast.error('Request failed')
    }
  }

  async function handleReprovision() {
    setProvisioning(true)
    try {
      const res = await fetch(`/api/servers/${server.id}/provision`, { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        toast.success('Server provisioned')
        onUpdated()
      } else {
        toast.error(data.error ?? 'Provisioning failed')
      }
    } catch {
      toast.error('Request failed')
    } finally {
      setProvisioning(false)
    }
  }

  const healthStatus = healthData?.latest?.status
  const healthBadge = healthStatus === 'up'
    ? <Badge variant="outline" className="text-xs border-green-500 text-green-600 gap-1"><Activity className="h-2.5 w-2.5" />Up</Badge>
    : healthStatus === 'down' || healthStatus === 'error' || healthStatus === 'timeout'
    ? <Badge variant="destructive" className="text-xs gap-1"><Activity className="h-2.5 w-2.5" />Down</Badge>
    : null

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Globe className="h-4 w-4 shrink-0 text-primary" />
            <span className="font-semibold truncate text-sm">{server.name}</span>
            {healthData?.inMaintenance && (
              <Badge variant="secondary" className="text-xs gap-1 shrink-0">
                <Wrench className="h-2.5 w-2.5" />Maintenance
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <ServerStatusBadge status={server.status as any} />
            {server.tunnelId && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="Re-provision"
                onClick={handleReprovision}
                disabled={provisioning}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${provisioning ? 'animate-spin' : ''}`} />
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  title="Delete server"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete &quot;{server.name}&quot;?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove the server, its tunnel ingress route, and its DNS record
                    ({server.subdomain}). This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="flex items-center gap-1 text-sm">
          <a
            href={`https://${server.subdomain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline flex items-center gap-0.5 font-mono text-xs"
          >
            {server.subdomain}
            <ExternalLink className="h-3 w-3" />
          </a>
          <span className="text-muted-foreground">→</span>
          <span className="font-mono text-xs text-muted-foreground">{server.upstream}</span>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {healthBadge}
          {healthData?.latest?.responseMs != null && healthStatus === 'up' && (
            <span className="text-xs text-muted-foreground">{healthData.latest.responseMs}ms</span>
          )}
        </div>
        <div className="flex gap-3 text-xs text-muted-foreground">
          {server.tunnel && (
            <span className="truncate">
              via <span className="font-medium">{server.tunnel.name}</span>
            </span>
          )}
          {server.lastSyncAt && (
            <span>
              Synced {formatDistanceToNow(new Date(server.lastSyncAt), { addSuffix: true })}
            </span>
          )}
        </div>
        {server.notes && (
          <p className="text-xs text-muted-foreground line-clamp-2">{server.notes}</p>
        )}
      </CardContent>
    </Card>
  )
}

