'use client'

/**
 * DNS Records Management and Audit Table.
 * Modern SaaS interface for Cloudflare CNAME and DNS record tracking,
 * proxy status inspection, audit trail, and synchronisation.
 */

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import {
  Globe,
  Cloud,
  CloudOff,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  Upload,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Search,
  CheckCircle2,
  Trash2,
  History,
  ShieldCheck,
  Layers,
  ArrowRight,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'

interface AuditLog {
  action: string
  createdAt: string
  userEmail: string | null
}

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
  auditLogs?: AuditLog[]
}

interface DnsStats {
  total: number
  active: number
  deleted: number
  proxied: number
  zones: Array<{ zoneId: string; zoneName: string | null; count: number }>
}

interface DnsRecordsTableProps {
  showDeleted?: boolean
  zoneId?: string
  serverId?: string
}

const PAGE_SIZE = 20

export function DnsRecordsTable({ showDeleted = true, zoneId: propZoneId, serverId: propServerId }: DnsRecordsTableProps) {
  const [records, setRecords] = useState<DnsRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'proxied' | 'deleted'>(showDeleted ? 'all' : 'active')
  const [selectedZone, setSelectedZone] = useState<string>(propZoneId ?? 'all')
  const [search, setSearch] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [stats, setStats] = useState<DnsStats>({ total: 0, active: 0, deleted: 0, proxied: 0, zones: [] })
  
  // Interactive states
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [importing, setImporting] = useState(false)

  const fetchRecords = useCallback(
    async (currentPage: number, currentStatus: typeof statusFilter, currentZone: string, currentSearch: string) => {
      try {
        setLoading(true)
        setError(null)

        const params = new URLSearchParams({
          status: currentStatus,
          withHistory: 'true',
          page: String(currentPage),
          limit: String(PAGE_SIZE),
        })

        if (currentZone && currentZone !== 'all') {
          params.append('zoneId', currentZone)
        }
        if (propServerId) {
          params.append('serverId', propServerId)
        }
        if (currentSearch.trim()) {
          params.append('q', currentSearch.trim())
        }

        const res = await fetch(`/api/dns-records?${params}`)
        if (!res.ok) throw new Error('Failed to fetch DNS records')

        const data = await res.json()
        const payload = data.data ?? data

        setRecords(Array.isArray(payload.records) ? payload.records : [])
        setTotal(payload.total ?? 0)
        setTotalPages(payload.totalPages ?? 0)
        if (payload.stats) {
          setStats(payload.stats)
        }
      } catch (err) {
        console.error('[dns-records-table] Error:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
        setRecords([])
      } finally {
        setLoading(false)
      }
    },
    [propServerId]
  )

  useEffect(() => {
    setPage(1)
    fetchRecords(1, statusFilter, selectedZone, activeSearch)
  }, [statusFilter, selectedZone, activeSearch, fetchRecords])

  function handleSearchSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault()
    setActiveSearch(search)
  }

  function handleClearSearch() {
    setSearch('')
    setActiveSearch('')
  }

  function handleCopy(text: string, id: string) {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    toast.success('Copied to clipboard')
    setTimeout(() => {
      setCopiedId(null)
    }, 2000)
  }

  const handleExecuteImport = async () => {
    try {
      setImporting(true)
      const res = await fetch('/api/dns-records/backfill', { method: 'POST' })
      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error ?? 'Import failed')
      }

      const payload = data.data ?? data
      const imported = payload.imported ?? 0
      const skipped = payload.skipped ?? 0
      const errors = payload.errors?.length ?? 0

      if (errors > 0) {
        toast.warning(`Import complete: ${imported} added, ${skipped} existing, ${errors} warnings`)
      } else {
        toast.success(`Import complete! Synced ${imported} DNS records from Cloudflare (${skipped} existing).`)
      }

      setIsImportModalOpen(false)
      fetchRecords(1, statusFilter, selectedZone, activeSearch)
      setPage(1)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  const formatDate = (date: string) => {
    try {
      return new Date(date).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return date
    }
  }

  const formatRelative = (date: string) => {
    try {
      return formatDistanceToNow(new Date(date), { addSuffix: true })
    } catch {
      return date
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. Header & Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border/60 bg-card/60 backdrop-blur-sm shadow-sm hover:border-border transition-all">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Records</p>
              <div className="text-2xl font-bold tracking-tight">{stats.total}</div>
              <p className="text-xs text-muted-foreground">Tracked in workspace</p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Globe className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60 backdrop-blur-sm shadow-sm hover:border-border transition-all">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Active CNAMEs</p>
              <div className="text-2xl font-bold tracking-tight text-emerald-500">{stats.active}</div>
              <p className="text-xs text-muted-foreground">Live in Cloudflare DNS</p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60 backdrop-blur-sm shadow-sm hover:border-border transition-all">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cloudflare Proxied</p>
              <div className="text-2xl font-bold tracking-tight text-amber-500">{stats.proxied}</div>
              <p className="text-xs text-muted-foreground">Protected by CF edge</p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Cloud className="h-5 w-5 fill-amber-500/30" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60 backdrop-blur-sm shadow-sm hover:border-border transition-all">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Deleted / Stale</p>
              <div className="text-2xl font-bold tracking-tight text-muted-foreground">{stats.deleted}</div>
              <p className="text-xs text-muted-foreground">Historical records</p>
            </div>
            <div className="h-11 w-11 rounded-xl bg-muted text-muted-foreground flex items-center justify-center">
              <Trash2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 2. Controls & Search Toolbar */}
      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            {/* Search Input */}
            <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search hostname, target, or zone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-8 h-9 text-sm"
              />
              {search && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </form>

            {/* Filter Pills & Selectors */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Zone Filter */}
              {stats.zones && stats.zones.length > 0 && !propZoneId && (
                <Select value={selectedZone} onValueChange={setSelectedZone}>
                  <SelectTrigger className="h-9 w-[170px] text-xs">
                    <SelectValue placeholder="All Zones" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Zones ({stats.zones.reduce((a, b) => a + b.count, 0)})</SelectItem>
                    {stats.zones.map((z) => (
                      <SelectItem key={z.zoneId} value={z.zoneId}>
                        {z.zoneName ?? z.zoneId.slice(0, 10)} ({z.count})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Status Segmented Buttons */}
              <div className="inline-flex rounded-lg border bg-muted/40 p-1 text-muted-foreground">
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'active', label: 'Active' },
                    { id: 'proxied', label: 'Proxied' },
                    { id: 'deleted', label: 'Deleted' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusFilter(tab.id)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                      statusFilter === tab.id
                        ? 'bg-background text-foreground shadow-sm'
                        : 'hover:text-foreground'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Action Buttons */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchRecords(page, statusFilter, selectedZone, activeSearch)}
                disabled={loading}
                className="h-9 px-2.5"
                title="Refresh records"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>

              {!propZoneId && !propServerId && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setIsImportModalOpen(true)}
                  className="h-9 gap-1.5 shadow-sm"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Import from Cloudflare</span>
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. DNS Records Modern Table */}
      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          {loading && records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <LoadingSpinner />
              <p className="text-sm text-muted-foreground mt-3">Loading DNS records…</p>
            </div>
          ) : error ? (
            <div className="text-center py-16 px-4">
              <p className="text-destructive font-medium">Failed to load DNS records</p>
              <p className="text-xs text-muted-foreground mt-1">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchRecords(page, statusFilter, selectedZone, activeSearch)}
                className="mt-4"
              >
                Retry
              </Button>
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-20 px-4">
              <div className="h-12 w-12 rounded-full bg-muted/60 text-muted-foreground flex items-center justify-center mx-auto mb-3">
                <Globe className="h-6 w-6 opacity-60" />
              </div>
              <h3 className="text-base font-semibold">No DNS records found</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                {activeSearch
                  ? `No records matching "${activeSearch}". Try broadening your search or resetting filters.`
                  : 'Import your existing CNAME records from Cloudflare to populate this audit table and track all changes.'}
              </p>
              {activeSearch ? (
                <Button variant="outline" size="sm" onClick={handleClearSearch} className="mt-4">
                  Clear Search
                </Button>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setIsImportModalOpen(true)}
                  className="mt-4 gap-1.5"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Import Cloudflare Records</span>
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="py-3 px-4 w-[90px]">Type</th>
                    <th className="py-3 px-4 min-w-[220px]">Hostname</th>
                    <th className="py-3 px-4 min-w-[240px]">Target</th>
                    <th className="py-3 px-4 w-[140px]">Proxy Status</th>
                    <th className="py-3 px-4 w-[160px]">Zone</th>
                    <th className="py-3 px-4 w-[80px]">TTL</th>
                    <th className="py-3 px-4 w-[110px]">Status</th>
                    <th className="py-3 px-4 text-right w-[120px]">History</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {records.map((record) => {
                    const isExpanded = expandedRecordId === record.id
                    const hasAudit = Boolean(record.auditLogs && record.auditLogs.length > 0)

                    return (
                      <tr
                        key={record.id}
                        className={`group transition-colors ${
                          record.status === 'deleted'
                            ? 'bg-muted/10 opacity-75'
                            : 'hover:bg-accent/40'
                        } ${isExpanded ? 'bg-accent/20' : ''}`}
                      >
                        {/* Type Badge */}
                        <td className="py-3.5 px-4 align-top">
                          <Badge
                            variant="secondary"
                            className="font-mono font-semibold text-[11px] px-2 py-0.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                          >
                            {record.type}
                          </Badge>
                        </td>

                        {/* Name / Hostname */}
                        <td className="py-3.5 px-4 align-top">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-xs font-semibold text-foreground break-all select-all">
                              {record.name}
                            </span>
                            <div className="flex items-center opacity-70 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={() => handleCopy(record.name, `name-${record.id}`)}
                                title="Copy hostname"
                                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                              >
                                {copiedId === `name-${record.id}` ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </button>
                              {record.status === 'active' && (
                                <a
                                  href={`https://${record.name}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Open in new tab"
                                  className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              )}
                            </div>
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            Created {formatRelative(record.createdAt)}
                          </div>
                        </td>

                        {/* Target Content */}
                        <td className="py-3.5 px-4 align-top">
                          <div className="flex items-center gap-1.5">
                            <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="font-mono text-xs text-muted-foreground group-hover:text-foreground transition-colors break-all select-all">
                              {record.content}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(record.content, `content-${record.id}`)}
                              title="Copy target"
                              className="p-1 rounded opacity-70 group-hover:opacity-100 hover:bg-accent text-muted-foreground hover:text-foreground shrink-0 transition-opacity"
                            >
                              {copiedId === `content-${record.id}` ? (
                                <Check className="h-3.5 w-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </td>

                        {/* Proxy Status (Iconic Orange Cloud) */}
                        <td className="py-3.5 px-4 align-top">
                          {record.proxied ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25 shadow-sm">
                              <Cloud className="h-3.5 w-3.5 fill-amber-500 text-amber-500 shrink-0" />
                              <span>Proxied</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-muted/60 text-muted-foreground border border-border/70">
                              <CloudOff className="h-3.5 w-3.5 shrink-0 opacity-70" />
                              <span>DNS Only</span>
                            </span>
                          )}
                        </td>

                        {/* Zone Name */}
                        <td className="py-3.5 px-4 align-top">
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted/40 px-2 py-0.5 rounded border border-border/50 truncate max-w-[140px]">
                            {record.zoneName ?? record.zoneId.slice(0, 10)}
                          </span>
                        </td>

                        {/* TTL */}
                        <td className="py-3.5 px-4 align-top text-xs text-muted-foreground">
                          {record.ttl === 1 ? 'Auto' : `${record.ttl}s`}
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4 align-top">
                          {record.status === 'active' ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                              Active
                            </span>
                          ) : (
                            <div className="space-y-0.5">
                              <Badge variant="outline" className="text-muted-foreground text-[10px] px-1.5 py-0 line-through">
                                Deleted
                              </Badge>
                              {record.deletedAt && (
                                <div className="text-[10px] text-muted-foreground">
                                  {formatRelative(record.deletedAt)}
                                </div>
                              )}
                            </div>
                          )}
                        </td>

                        {/* History Button & Inline Expansion */}
                        <td className="py-3.5 px-4 align-top text-right">
                          {hasAudit ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setExpandedRecordId(isExpanded ? null : record.id)}
                              className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                            >
                              <History className="h-3.5 w-3.5" />
                              <span>{record.auditLogs!.length}</span>
                              {isExpanded ? (
                                <ChevronUp className="h-3 w-3" />
                              ) : (
                                <ChevronDown className="h-3 w-3" />
                              )}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground/50">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* Expanded Audit Log Drawer for Selected Record */}
              {expandedRecordId && (() => {
                const targetRecord = records.find((r) => r.id === expandedRecordId)
                if (!targetRecord || !targetRecord.auditLogs || targetRecord.auditLogs.length === 0) return null

                return (
                  <div className="border-t bg-muted/20 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <History className="h-4 w-4 text-primary" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-foreground">
                          Audit Trail for <span className="font-mono">{targetRecord.name}</span>
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedRecordId(null)}
                        className="h-6 px-2 text-xs"
                      >
                        Close
                      </Button>
                    </div>

                    <div className="relative pl-6 border-l-2 border-border/80 space-y-3 mt-3 ml-2">
                      {targetRecord.auditLogs.map((log, idx) => {
                        const isCreated = log.action.includes('CREATED')
                        const isDeleted = log.action.includes('DELETED')
                        const isUpdated = log.action.includes('UPDATED')

                        return (
                          <div key={idx} className="relative text-xs">
                            <span
                              className={`absolute -left-[31px] top-0.5 h-3.5 w-3.5 rounded-full border-2 border-background ${
                                isCreated
                                  ? 'bg-emerald-500'
                                  : isDeleted
                                  ? 'bg-rose-500'
                                  : 'bg-blue-500'
                              }`}
                            />
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-medium text-foreground">
                                {log.action.replace('DNS_RECORD_', '').replace(/_/g, ' ')}
                                {log.userEmail && (
                                  <span className="text-muted-foreground font-normal ml-1">
                                    by {log.userEmail}
                                  </span>
                                )}
                              </span>
                              <span className="text-muted-foreground shrink-0 text-[11px]">
                                {formatDate(log.createdAt)} ({formatRelative(log.createdAt)})
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {/* 4. Pagination Bar */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-card text-xs text-muted-foreground">
              <div>
                Showing <span className="font-medium text-foreground">{(page - 1) * PAGE_SIZE + 1}</span> to{' '}
                <span className="font-medium text-foreground">{Math.min(page * PAGE_SIZE, total)}</span> of{' '}
                <span className="font-medium text-foreground">{total}</span> records
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const next = Math.max(1, page - 1)
                    setPage(next)
                    fetchRecords(next, statusFilter, selectedZone, activeSearch)
                  }}
                  disabled={page === 1 || loading}
                  className="h-8 px-2"
                >
                  <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                  <span>Prev</span>
                </Button>

                <div className="text-xs px-2 font-medium">
                  Page {page} of {totalPages}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const next = Math.min(totalPages, page + 1)
                    setPage(next)
                    fetchRecords(next, statusFilter, selectedZone, activeSearch)
                  }}
                  disabled={page === totalPages || loading}
                  className="h-8 px-2"
                >
                  <span>Next</span>
                  <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 5. Import Records Dialog Modal */}
      <Dialog open={isImportModalOpen} onOpenChange={setIsImportModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="h-10 w-10 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center mb-2">
              <Upload className="h-5 w-5" />
            </div>
            <DialogTitle>Import DNS Records from Cloudflare</DialogTitle>
            <DialogDescription>
              TunnelFlow will scan your configured Cloudflare zones and synchronize all active CNAME records into the local database and audit tracking log.
            </DialogDescription>
          </DialogHeader>

          <div className="bg-muted/40 rounded-lg p-3 text-xs text-muted-foreground space-y-1.5 border">
            <p className="font-medium text-foreground">ℹ️ Safe Operation</p>
            <p>
              This is a read-and-track operation. It will NOT modify or delete any existing records in your live Cloudflare account.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setIsImportModalOpen(false)}
              disabled={importing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleExecuteImport}
              disabled={importing}
              className="gap-1.5"
            >
              {importing ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Importing from Cloudflare…</span>
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  <span>Import Records</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
