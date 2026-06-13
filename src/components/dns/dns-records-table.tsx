'use client'

/**
 * DNS Record visibility table component.
 * Shows all CNAME records (active and deleted) with audit history.
 */

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { RefreshCw, Upload } from 'lucide-react'

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

export function DnsRecordsTable({ showDeleted = true, zoneId, serverId }: DnsRecordsTableProps) {
  const [records, setRecords] = useState<DnsRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'active' | 'deleted'>(showDeleted ? 'all' : 'active')
  const [backfilling, setBackfilling] = useState(false)

  useEffect(() => {
    fetchRecords()
  }, [filter, zoneId, serverId])

  const fetchRecords = async () => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams({
        status: filter,
        withHistory: 'true',
      })
      if (zoneId) params.append('zoneId', zoneId)
      if (serverId) params.append('serverId', serverId)

      const res = await fetch(`/api/dns-records?${params}`)
      if (!res.ok) throw new Error('Failed to fetch DNS records')

      const data = await res.json()
      // Ensure records is always an array
      setRecords(Array.isArray(data.records) ? data.records : [])
    } catch (err) {
      console.error('[dns-records-table] Error:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
      setRecords([])
    } finally {
      setLoading(false)
    }
  }

  const handleBackfill = async () => {
    if (!confirm('Import existing DNS records from provisioned servers?\n\nThis will create tracking entries for all servers that have DNS records.')) {
      return
    }

    try {
      setBackfilling(true)
      const res = await fetch('/api/dns-records/backfill', { method: 'POST' })
      if (!res.ok) throw new Error('Backfill failed')

      const data = await res.json()
      const errorCount = data.errors?.length ?? 0
      const imported = data.imported ?? 0
      const skipped = data.skipped ?? 0
      
      alert(`✅ Backfill complete!\n\nImported: ${imported}\nSkipped: ${skipped}\nErrors: ${errorCount}`)
      
      // Refresh the records
      await fetchRecords()
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

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>DNS Records</CardTitle>
          <CardDescription>CNAME visibility and audit trail</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center p-12">
          <LoadingSpinner />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>DNS Records</CardTitle>
          <CardDescription>CNAME visibility and audit trail</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-destructive">Error: {error}</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>DNS Records</CardTitle>
            <CardDescription>CNAME visibility and audit trail</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant={filter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('all')}
            >
              All
            </Button>
            <Button
              variant={filter === 'active' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('active')}
            >
              Active
            </Button>
            <Button
              variant={filter === 'deleted' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('deleted')}
            >
              Deleted
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {records.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-muted-foreground mb-4">No DNS records found</div>
            {!zoneId && !serverId && (
              <Button
                onClick={handleBackfill}
                disabled={backfilling}
                size="sm"
              >
                <Upload className="h-4 w-4 mr-2" />
                {backfilling ? 'Importing...' : 'Import Existing Records'}
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {records.map((record) => (
              <div key={record.id} className="border rounded-lg p-4 hover:bg-accent/50 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-semibold">{record.name}</span>
                      <Badge variant={record.status === 'active' ? 'default' : 'secondary'}>
                        {record.status}
                      </Badge>
                      <Badge variant="outline">{record.type}</Badge>
                      {record.proxied && <Badge variant="outline">Proxied</Badge>}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <div>Zone: {record.zoneName ?? record.zoneId}</div>
                      <div>Target: {record.content}</div>
                      <div>TTL: {record.ttl === 1 ? 'Auto' : `${record.ttl}s`}</div>
                    </div>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
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
                        <div key={idx} className="text-xs text-muted-foreground flex justify-between">
                          <span>
                            {log.action.replace('DNS_RECORD_', '').replace(/_/g, ' ')}
                            {log.userEmail && ` by ${log.userEmail}`}
                          </span>
                          <span>{formatDate(log.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
