import { getIronSession, IronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export interface SessionData {
  userId?: string
  email?: string
  role?: 'ADMIN' | 'VIEWER'
  accessLevel?: 'ADMIN' | 'EDITOR' | 'VIEWER'
  isLoggedIn: boolean
}

export const sessionOptions = {
  cookieName: 'tm_session',
  // Lazy getter: read at request time (not build time) and never fall back to a
  // publicly known secret in production.
  get password(): string {
    const secret = process.env.SESSION_SECRET
    if (secret && secret.length >= 32) return secret
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SESSION_SECRET must be set to a random string of at least 32 characters.')
    }
    return 'dev-only-insecure-secret-min-32-chars!!'
  },
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict' as const,
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
}

export async function getSession(): Promise<IronSession<SessionData>> {
  const session = await getIronSession<SessionData>(cookies(), sessionOptions)
  return session
}

export async function getSessionFromRequest(
  req: NextRequest,
  res: NextResponse
): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(req, res, sessionOptions)
}
