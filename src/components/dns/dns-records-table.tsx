'use client'

/**
 * DNS Record visibility table component.
 * Shows all CNAME records (active and deleted) with audit history and pagination.
 */

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { RefreshCw, Upload, ChevronLeft, ChevronRight } from 'lucide-react'

interface DnsRecord {
  id: string
  cfRecordId: string
  zoneId: string
  zoneName: string | null
  name: string
  type: string
  content: string
  proxied: boolean
  ttl: number
  serverId: string | null
  userId: string | null
  status: 'active' | 'deleted'
  deletedAt: string | null
  createdAt: string
  updatedAt: string
  auditLogs?: Array<{
    action: string
    createdAt: string
    userEmail: string | null
  }>
}

interface DnsRecordsTableProps {
  showDeleted?: boolean
  zoneId?: string
  serverId?: string
}

const PAGE_SIZE = 25

export function DnsRecordsTable({ showDeleted = true, zoneId, serverId }: DnsRecordsTableProps) {
  const [records, setRecords] = useState<DnsRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'active' | 'deleted'>(showDeleted ? 'all' : 'active')
  const [backfilling, setBackfilling] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)

  const fetchRecords = useCallback(async (currentPage: number, currentFilter: typeof filter) => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams({
        status: currentFilter,
        withHistory: 'true',
        page: String(currentPage),
        limit: String(PAGE_SIZE),
      })
      if (zoneId) params.append('zoneId', zoneId)
      if (serverId) params.append('serverId', serverId)

      const res = await fetch(`/api/dns-records?${params}`)
      if (!res.ok) throw new Error('Failed to fetch DNS records')

      const data = await res.json()
      const payload = data.data ?? data
      setRecords(Array.isArray(payload.records) ? payload.records : [])
      setTotal(payload.total ?? 0)
      setTotalPages(payload.totalPages ?? 0)
    } catch (err) {
      console.error('[dns-records-table] Error:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
      setRecords([])
    } finally {
      setLoading(false)
    }
  }, [zoneId, serverId])

  useEffect(() => {
    setPage(1)
    fetchRecords(1, filter)
  }, [filter, zoneId, serverId, fetchRecords])

  function handleFilterChange(f: 'all' | 'active' | 'deleted') {
    setFilter(f)
    // useEffect handles the fetch reset
  }

  function handlePage(next: number) {
    setPage(next)
    fetchRecords(next, filter)
  }

  const handleBackfill = async () => {
    if (!confirm('Import existing DNS records from Cloudflare?\n\nThis will fetch all CNAME records for your configured zones.')) {
      return
    }

    try {
      setBackfilling(true)
      const res = await fetch('/api/dns-records/backfill', { method: 'POST' })
      if (!res.ok) throw new Error('Backfill failed')

      const data = await res.json()
      const payload = data.data ?? data
      const errorCount = payload.errors?.length ?? 0
      const imported = payload.imported ?? 0
      const skipped = payload.skipped ?? 0

      alert(`✅ Backfill complete!\n\nImported: ${imported}\nSkipped: ${skipped}\nErrors: ${errorCount}`)
      fetchRecords(1, filter)
      setPage(1)
    } catch (err) {
      alert(`❌ Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setBackfilling(false)
    }
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle>DNS Records</CardTitle>
            <CardDescription>CNAME visibility and audit trail</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchRecords(page, filter)}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            {!zoneId && !serverId && (
              <Button variant="outline" size="sm" onClick={handleBackfill} disabled={backfilling}>
                <Upload className="h-4 w-4 mr-1.5" />
                {backfilling ? 'Importing…' : 'Import'}
              </Button>
            )}
            <div className="flex gap-1">
              {(['all', 'active', 'deleted'] as const).map((f) => (
                <Button
                  key={f}
                  variant={filter === f ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => handleFilterChange(f)}
                  className="capitalize"
                >
                  {f}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <div className="text-destructive py-4">Error: {error}</div>
        ) : records.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-muted-foreground mb-4">No DNS records found</div>
            {!zoneId && !serverId && (
              <Button onClick={handleBackfill} disabled={backfilling} size="sm">
                <Upload className="h-4 w-4 mr-2" />
                {backfilling ? 'Importing…' : 'Import Existing Records'}
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Records list */}
            <div className="space-y-3">
              {records.map((record) => (
                <div key={record.id} className="border rounded-lg p-4 hover:bg-accent/50 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-mono font-semibold truncate">{record.name}</span>
                        <Badge variant={record.status === 'active' ? 'default' : 'secondary'}>
                          {record.status}
                        </Badge>
                        <Badge variant="outline">{record.type}</Badge>
                        {record.proxied && <Badge variant="outline">Proxied</Badge>}
                      </div>
                      <div className="text-sm text-muted-foreground space-y-0.5">
                        <div>Zone: {record.zoneName ?? record.zoneId}</div>
                        <div className="font-mono text-xs truncate">→ {record.content}</div>
                        <div>TTL: {record.ttl === 1 ? 'Auto' : `${record.ttl}s`}</div>
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground shrink-0 ml-4">
                      <div>Created: {formatDate(record.createdAt)}</div>
                      {record.deletedAt && <div>Deleted: {formatDate(record.deletedAt)}</div>}
                    </div>
                  </div>

                  {record.auditLogs && record.auditLogs.length > 0 && (
                    <details className="mt-3 pt-3 border-t">
                      <summary className="cursor-pointer text-sm font-medium hover:text-primary">
                        Audit History ({record.auditLogs.length} events)
                      </summary>
                      <div className="mt-2 space-y-1 pl-4">
                        {record.auditLogs.map((log, idx) => (
                          <div key={idx} className="text-xs text-muted-foreground flex justify-between gap-4">
                            <span>
                              {log.action.replace('DNS_RECORD_', '').replace(/_/g, ' ')}
                              {log.userEmail && ` by ${log.userEmail}`}
                            </span>
                            <span className="shrink-0">{formatDate(log.createdAt)}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination bar */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2 border-t text-sm text-muted-foreground">
                <span>
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} records
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePage(page - 1)}
                    disabled={page === 1}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>

                  {/* Page number pills */}
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                    .reduce<(number | '…')[]>((acc, p, idx, arr) => {
                      if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('…')
                      acc.push(p)
                      return acc
                    }, [])
                    .map((p, idx) =>
                      p === '…' ? (
                        <span key={`ellipsis-${idx}`} className="px-1">…</span>
                      ) : (
                        <Button
                          key={p}
                          variant={p === page ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => handlePage(p as number)}
                          className="h-8 w-8 p-0"
                        >
                          {p}
                        </Button>
                      )
                    )}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePage(page + 1)}
                    disabled={page === totalPages}
                    className="h-8 w-8 p-0"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

