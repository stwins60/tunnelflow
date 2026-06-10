/**
 * Shared API response helpers used across all route handlers.
 */

import { NextResponse } from 'next/server'

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status })
}

export function err(message: string, status = 400, code?: string) {
  return NextResponse.json({ ok: false, error: message, ...(code ? { code } : {}) }, { status })
}

export function unauthorized() {
  return err('Unauthorized', 401, 'UNAUTHORIZED')
}

export function forbidden() {
  return err('Forbidden', 403, 'FORBIDDEN')
}

export function notFound(resource = 'Resource') {
  return err(`${resource} not found`, 404, 'NOT_FOUND')
}

export function serverError(e: unknown) {
  const message = e instanceof Error ? e.message : 'Internal server error'
  // Never include stack traces or secrets in responses
  console.error('[api]', message)
  return err(message, 500, 'SERVER_ERROR')
}

/**
 * Extract the client IP from a request (for audit logs).
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  )
}
