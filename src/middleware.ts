/**
 * Next.js middleware — handles auth redirects, rate limiting, and security headers.
 *
 * Rules:
 *  1. Skip static assets.
 *  2. Add security headers to every response.
 *  3. Rate-limit auth endpoints (stricter) and all other API endpoints.
 *  4. If authenticated and visiting /login or /register → redirect to /dashboard.
 *  5. Protect /dashboard/* and /setup — redirect to /login if not authenticated.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'

// Public routes that don't require a session
const ALWAYS_PUBLIC_PAGES = new Set(['/', '/login', '/register', '/invite'])
const ALWAYS_PUBLIC_API = ['/api/setup', '/api/auth/', '/api/health', '/api/zones', '/api/invite']
const AUTH_API_PATHS = ['/api/auth/login', '/api/auth/register', '/api/setup']

// Pages that require authentication
const PROTECTED_PREFIXES = ['/dashboard', '/setup']

// ─── In-middleware rate limiter (edge-compatible: no imports) ─────────────────
// A simple token-bucket using a globalThis Map (works in Node.js runtime).

const globalForRL = globalThis as unknown as {
  _mwRateLimitStore: Map<string, { count: number; windowStart: number }>
}
if (!globalForRL._mwRateLimitStore) {
  globalForRL._mwRateLimitStore = new Map()
}

function checkLimit(key: string, windowMs: number, max: number): boolean {
  const now = Date.now()
  const store = globalForRL._mwRateLimitStore
  const entry = store.get(key)

  if (!entry || now - entry.windowStart >= windowMs) {
    store.set(key, { count: 1, windowStart: now })
    return true // allowed
  }

  entry.count += 1
  if (entry.count > max) return false // blocked
  return true
}

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

// ─── Security headers ─────────────────────────────────────────────────────────

function applySecurityHeaders(res: NextResponse, isHttps: boolean): void {
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('X-XSS-Protection', '1; mode=block')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  )
  if (isHttps) {
    res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  }
  // Minimal Content-Security-Policy — allows inline styles (Tailwind) and same-origin scripts
  res.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",   // Next.js requires unsafe-inline in dev
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
    ].join('; ')
  )
}

// ─── Main middleware ───────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isHttps = request.nextUrl.protocol === 'https:'

  // Skip static assets
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // ── Rate limiting ──────────────────────────────────────────────────────────
  const ip = getIp(request)
  const rlWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000)

  if (pathname.startsWith('/api/')) {
    const isAuthPath = AUTH_API_PATHS.some((p) => pathname.startsWith(p))

    if (isAuthPath) {
      // Strict limit: 10 req/min per IP on auth endpoints
      const max = Number(process.env.RATE_LIMIT_MAX_AUTH ?? 10)
      if (!checkLimit(`auth:${ip}`, rlWindowMs, max)) {
        const res = NextResponse.json(
          { ok: false, error: 'Too many requests', code: 'RATE_LIMITED' },
          { status: 429 }
        )
        res.headers.set('Retry-After', String(Math.ceil(rlWindowMs / 1000)))
        applySecurityHeaders(res, isHttps)
        return res
      }
    } else {
      // General API limit: 120 req/min per IP
      const max = Number(process.env.RATE_LIMIT_MAX_API ?? 120)
      if (!checkLimit(`api:${ip}`, rlWindowMs, max)) {
        const res = NextResponse.json(
          { ok: false, error: 'Too many requests', code: 'RATE_LIMITED' },
          { status: 429 }
        )
        res.headers.set('Retry-After', String(Math.ceil(rlWindowMs / 1000)))
        applySecurityHeaders(res, isHttps)
        return res
      }
    }

    // Public API — skip session check
    const isPublicApi = ALWAYS_PUBLIC_API.some((p) => pathname.startsWith(p))
    if (isPublicApi) {
      const res = NextResponse.next()
      applySecurityHeaders(res, isHttps)
      return res
    }

    // All other API routes handle their own auth
    const res = NextResponse.next()
    applySecurityHeaders(res, isHttps)
    return res
  }

  // ── Page auth ──────────────────────────────────────────────────────────────
  const response = NextResponse.next()
  applySecurityHeaders(response, isHttps)

  const session = await getSessionFromRequest(request, response)
  const isLoggedIn = session.isLoggedIn === true

  // Redirect authenticated users away from auth pages
  if (isLoggedIn && (pathname === '/login' || pathname === '/register' || pathname === '/invite')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Protect dashboard and setup pages
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))
  if (isProtected && !isLoggedIn) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
