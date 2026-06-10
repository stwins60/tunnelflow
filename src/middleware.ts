/**
 * Next.js middleware — handles auth redirects for the SaaS app.
 *
 * Rules:
 *  1. Skip static assets and always-public API/page paths.
 *  2. If authenticated and visiting /login or /register → redirect to /dashboard.
 *  3. Protect /dashboard/* and /setup — redirect to /login if not authenticated.
 *  4. All other pages (including /) are public (landing page, etc.).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'

// These paths are always reachable regardless of auth state
const ALWAYS_PUBLIC_PAGES = new Set(['/', '/login', '/register', '/invite'])
const ALWAYS_PUBLIC_API = ['/api/setup', '/api/auth/', '/api/health', '/api/zones', '/api/invite']

// Pages that require authentication
const PROTECTED_PREFIXES = ['/dashboard', '/setup']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip static assets
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // Always-public API routes — let them handle auth themselves
  if (pathname.startsWith('/api/')) {
    const isPublicApi = ALWAYS_PUBLIC_API.some((p) => pathname.startsWith(p))
    if (isPublicApi) return NextResponse.next()
    // Other API routes are handled by their own auth checks
    return NextResponse.next()
  }

  // Read session
  const response = NextResponse.next()
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
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
