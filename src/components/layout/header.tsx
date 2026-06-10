'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, CheckCircle2, AlertCircle, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'

interface SyncState {
  lastSyncAt: string | null
  inProgress: boolean
  error: string | null
  lastResult: { tunnelsUpdated: number; driftDetected: string[] } | null
}

export function Header({ title }: { title: string }) {
  const [syncState, setSyncState] = useState<SyncState | null>(null)
  const [syncing, setSyncing] = useState(false)

  async function fetchSyncState() {
    try {
      const res = await fetch('/api/sync')
      const data = await res.json()
      if (data.ok) setSyncState(data.data)
    } catch { /* ignore */ }
  }

  async function triggerSync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/sync', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setSyncState({ ...data.data, lastSyncAt: data.data.lastSyncAt })
        const drift = data.data.driftDetected?.length ?? 0
        if (drift > 0) {
          toast.warning(`Sync complete — ${drift} drift issue(s) detected`)
        } else {
          toast.success('Sync complete')
        }
      } else {
        toast.error(data.error ?? 'Sync failed')
      }
    } catch {
      toast.error('Sync request failed')
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    fetchSyncState()
    const interval = setInterval(fetchSyncState, 30_000)
    return () => clearInterval(interval)
  }, [])

  const lastSync = syncState?.lastSyncAt
    ? formatDistanceToNow(new Date(syncState.lastSyncAt), { addSuffix: true })
    : null

  return (
    <header className="flex h-14 items-center justify-between border-b bg-white px-6">
      <h1 className="text-base font-semibold text-gray-900">{title}</h1>

      <div className="flex items-center gap-4">
        {/* Sync status indicator */}
        {syncState?.error ? (
          <span className="flex items-center gap-1 text-xs text-red-500">
            <AlertCircle className="h-3.5 w-3.5" />
            Sync error
          </span>
        ) : lastSync ? (
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <Clock className="h-3.5 w-3.5" />
            {lastSync}
          </span>
        ) : null}

        {syncState?.lastResult?.driftDetected?.length ? (
          <span className="flex items-center gap-1 text-xs text-amber-600">
            <AlertCircle className="h-3.5 w-3.5" />
            {syncState.lastResult.driftDetected.length} drift issue(s)
          </span>
        ) : lastSync ? (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <CheckCircle2 className="h-3.5 w-3.5" />
            In sync
          </span>
        ) : null}

        <Button
          variant="outline"
          size="sm"
          onClick={triggerSync}
          disabled={syncing}
          className="gap-1.5 text-xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing…' : 'Sync now'}
        </Button>
      </div>
    </header>
  )
}
