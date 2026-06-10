'use client'

import { useState, useEffect, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Header } from '@/components/layout/header'
import { TunnelCard } from '@/components/tunnels/tunnel-card'
import { CreateTunnelDialog } from '@/components/tunnels/create-tunnel-dialog'
import { LoadingPage } from '@/components/shared/loading-spinner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Search } from 'lucide-react'
import type { AppTunnel } from '@/types'

export default function TunnelsPage() {
  const [tunnels, setTunnels] = useState<AppTunnel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tunnels')
      const data = await res.json()
      if (data.ok) setTunnels(data.data.tunnels)
      else setError(data.error ?? 'Failed to load tunnels')
    } catch {
      setError('Request failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = tunnels.filter((t) =>
    !search || t.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <>
      <Header title="Tunnels" />
      <div className="p-6 space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tunnels…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <CreateTunnelDialog onCreated={load} />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <LoadingPage />
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            {search ? 'No tunnels match your search.' : 'No tunnels yet. Create one to get started.'}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((tunnel) => (
              <TunnelCard
                key={tunnel.id}
                tunnel={tunnel}
                onDeleted={load}
                onUpdated={load}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}
