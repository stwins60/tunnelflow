'use client'

import { useState, useEffect, useCallback } from 'react'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { LoadingPage } from '@/components/shared/loading-spinner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatDistanceToNow } from 'date-fns'
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react'

interface AuditLog {
  id: string
  action: string
  resource: string
  resourceId: string | null
  details: string | null
  before: string | null
  after: string | null
  ipAddress: string | null
  createdAt: string
  user: { email: string } | null
}

const ACTION_COLORS: Record<string, string> = {
  CREATE_TUNNEL: 'info',
  DELETE_TUNNEL: 'error',
  RENAME_TUNNEL: 'secondary',
  CREATE_SERVER: 'info',
  DELETE_SERVER: 'error',
  UPDATE_SERVER: 'secondary',
  PROVISION_SERVER: 'success',
  SETUP_COMPLETE: 'success',
  LOGIN_SUCCESS: 'secondary',
  LOGIN_FAILED: 'warning',
  UPDATE_SETTINGS: 'secondary',
  VIEW_TUNNEL_TOKEN: 'warning',
  CREATE_API_KEY: 'info',
  REVOKE_API_KEY: 'error',
  DEPLOY_SERVER: 'success',
  UNDEPLOY_SERVER: 'secondary',
  IMPORT_CONFIG: 'info',
}

function DiffView({ before, after }: { before: string | null; after: string | null }) {
  if (!before && !after) return null

  let beforeObj: Record<string, unknown> | null = null
  let afterObj: Record<string, unknown> | null = null

  try { if (before) beforeObj = JSON.parse(before) } catch {}
  try { if (after) afterObj = JSON.parse(after) } catch {}

  const allKeys = new Set([
    ...Object.keys(beforeObj ?? {}),
    ...Object.keys(afterObj ?? {}),
  ])

  if (allKeys.size === 0) return null

  return (
    <div className="mt-2 rounded border overflow-hidden text-xs font-mono">
      <div className="grid grid-cols-2 divide-x">
        <div className="bg-red-950/20 p-2">
          <p className="text-red-400 mb-1 font-sans font-medium not-italic text-[10px] uppercase tracking-wide">Before</p>
          {beforeObj ? (
            Array.from(allKeys).map((k) => {
              const val = beforeObj?.[k]
              const changed = afterObj && afterObj[k] !== val
              return (
                <div key={k} className={changed ? 'text-red-400' : 'text-muted-foreground'}>
                  <span className="text-muted-foreground">{k}: </span>
                  {String(val ?? '—')}
                </div>
              )
            })
          ) : <span className="text-muted-foreground italic">(none)</span>}
        </div>
        <div className="bg-green-950/20 p-2">
          <p className="text-green-400 mb-1 font-sans font-medium not-italic text-[10px] uppercase tracking-wide">After</p>
          {afterObj ? (
            Array.from(allKeys).map((k) => {
              const val = afterObj?.[k]
              const changed = beforeObj && beforeObj[k] !== val
              return (
                <div key={k} className={changed ? 'text-green-400' : 'text-muted-foreground'}>
                  <span className="text-muted-foreground">{k}: </span>
                  {String(val ?? '—')}
                </div>
              )
            })
          ) : <span className="text-muted-foreground italic">(none)</span>}
        </div>
      </div>
    </div>
  )
}

function AuditEntry({ log }: { log: AuditLog }) {
  const [expanded, setExpanded] = useState(false)
  const hasDiff = Boolean(log.before || log.after)

  return (
    <div className="py-2.5 border-b last:border-0">
      <div className="flex items-start gap-3">
        <Badge variant={(ACTION_COLORS[log.action] ?? 'secondary') as any} className="shrink-0 text-xs">
          {log.action}
        </Badge>
        <div className="flex-1 min-w-0">
          <p className="text-sm">
            <span className="text-muted-foreground">{log.resource}</span>
            {log.resourceId && (
              <span className="font-mono text-xs text-muted-foreground ml-1">
                ({log.resourceId.slice(0, 8)}…)
              </span>
            )}
          </p>
          {log.details && (
            <pre className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap break-all">
              {log.details}
            </pre>
          )}
          {hasDiff && expanded && (
            <DiffView before={log.before} after={log.after} />
          )}
        </div>
        <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
          <p className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
          </p>
          {log.user?.email && (
            <p className="text-xs text-muted-foreground">{log.user.email}</p>
          )}
          {log.ipAddress && (
            <p className="text-xs text-muted-foreground">{log.ipAddress}</p>
          )}
          {hasDiff && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs gap-1"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {expanded ? 'Hide diff' : 'Diff'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/audit?page=${p}&limit=50`)
      const data = await res.json()
      if (data.ok) {
        setLogs(data.data.logs)
        setTotalPages(data.data.pages)
      }
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(page) }, [load, page])

  return (
    <>
      <Header title="Audit Log" />
      <div className="p-6 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
            <CardDescription>All admin actions are recorded here. Secrets are never logged.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <LoadingPage />
            ) : logs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No audit logs yet.</p>
            ) : (
              <div className="space-y-0">
                {logs.map((log) => (
                  <AuditEntry key={log.id} log={log} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </>
  )
}

