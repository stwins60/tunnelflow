/**
 * Structured request/response logger for TunnelFlow API routes.
 * Outputs JSON lines to stdout — suitable for log aggregators (Loki, Datadog, etc.).
 *
 * Usage (in a route handler):
 *   import { logRequest } from '@/lib/request-logger'
 *   logRequest(req, { status: 200, durationMs: 42, userId: '...' })
 */

export interface RequestLogEntry {
  ts: string
  level: 'info' | 'warn' | 'error'
  method: string
  path: string
  status: number
  durationMs: number
  ip?: string
  userId?: string
  userAgent?: string
  error?: string
}

let _enabled: boolean | null = null

function isEnabled(): boolean {
  if (_enabled === null) {
    // Disable in test environments to keep output clean
    _enabled = process.env.NODE_ENV !== 'test'
  }
  return _enabled
}

export function logRequest(
  req: Request,
  meta: { status: number; durationMs: number; userId?: string; error?: string }
): void {
  if (!isEnabled()) return

  const url = new URL(req.url)
  const entry: RequestLogEntry = {
    ts:          new Date().toISOString(),
    level:       meta.status >= 500 ? 'error' : meta.status >= 400 ? 'warn' : 'info',
    method:      req.method,
    path:        url.pathname,
    status:      meta.status,
    durationMs:  meta.durationMs,
    ip:          req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
                 ?? req.headers.get('x-real-ip')
                 ?? undefined,
    userId:      meta.userId,
    userAgent:   req.headers.get('user-agent') ?? undefined,
    ...(meta.error ? { error: meta.error } : {}),
  }

  // Strip undefined fields
  const clean = Object.fromEntries(
    Object.entries(entry).filter(([, v]) => v !== undefined)
  )

  process.stdout.write(JSON.stringify(clean) + '\n')
}

/**
 * Timing helper — returns a function that resolves the elapsed ms since creation.
 */
export function startTimer(): () => number {
  const start = Date.now()
  return () => Date.now() - start
}
