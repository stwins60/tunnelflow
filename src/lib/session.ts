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
  password: process.env.SESSION_SECRET ?? 'fallback-dev-secret-min-32-chars-long!!',
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

export async function requireAuth(): Promise<SessionData> {
  const session = await getSession()
  if (!session.isLoggedIn || !session.userId) {
    throw new Error('Unauthorized')
  }
  return session
}

export async function requireAdmin(): Promise<SessionData> {
  const session = await requireAuth()
  if (session.accessLevel !== 'ADMIN') {
    throw new Error('Forbidden: admin access required')
  }
  return session
}

export async function requireEditor(): Promise<SessionData> {
  const session = await requireAuth()
  const rank = { ADMIN: 3, EDITOR: 2, VIEWER: 1 }
  const level = session.accessLevel ?? 'VIEWER'
  if ((rank[level as keyof typeof rank] ?? 0) < rank.EDITOR) {
    throw new Error('Forbidden: editor access required')
  }
  return session
}
