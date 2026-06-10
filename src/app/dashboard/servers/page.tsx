'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Plus, Search, Filter } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ServerCard } from '@/components/servers/server-card'
import { LoadingPage } from '@/components/shared/loading-spinner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { AppServer } from '@/types'

export default function ServersPage() {
  const [servers, setServers] = useState<AppServer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const load = useCallback(async (q?: string, status?: string) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (status && status !== 'all') params.set('status', status)

    try {
      const res = await fetch(`/api/servers?${params}`)
      const data = await res.json()
      if (data.ok) setServers(data.data.servers)
      else setError(data.error ?? 'Failed to load servers')
    } catch {
      setError('Request failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function handleSearch() {
    load(search, statusFilter)
  }

  return (
    <>
      <Header title="Servers" />
      <div className="p-6 space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search servers, hostnames…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); load(search, v) }}>
            <SelectTrigger className="w-36">
              <Filter className="h-4 w-4 mr-1.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
          <Button asChild className="gap-2 shrink-0">
            <Link href="/dashboard/servers/new">
              <Plus className="h-4 w-4" />
              Add Server
            </Link>
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <LoadingPage />
        ) : servers.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground space-y-2">
            <p>{search || statusFilter !== 'all' ? 'No servers match your filters.' : 'No servers yet.'}</p>
            {!search && statusFilter === 'all' && (
              <Button asChild variant="outline">
                <Link href="/dashboard/servers/new">Add your first server</Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {servers.map((server) => (
              <ServerCard
                key={server.id}
                server={server}
                onDeleted={() => load(search, statusFilter)}
                onUpdated={() => load(search, statusFilter)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}
