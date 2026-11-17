/**
 * Auth guards for API routes and server components.
 *
 * Unlike the raw cookie, these re-read the user from the database on every call,
 * so a deleted user or a changed role takes effect immediately instead of
 * after the 7-day cookie expires. (Kept out of session.ts because the Edge
 * middleware imports that file and cannot load SQLite.)
 */
import { getSession, type SessionData } from './session'
import { db } from './db'
import { getEffectiveAccessLevel, rankOf } from './auth'

export async function requireAuth(): Promise<SessionData> {
  const session = await getSession()
  if (!session.isLoggedIn || !session.userId) {
    throw new Error('Unauthorized')
  }
  const row = db.prepare('SELECT "id", "email" FROM "User" WHERE "id" = ?').get(session.userId) as
    | { id: string; email: string }
    | undefined
  if (!row) {
    throw new Error('Unauthorized')
  }
  const accessLevel = getEffectiveAccessLevel(row.id)
  return {
    userId: row.id,
    email: row.email,
    role: accessLevel === 'ADMIN' ? 'ADMIN' : 'VIEWER',
    accessLevel,
    isLoggedIn: true,
  }
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
  if (rankOf(session.accessLevel ?? 'VIEWER') < rankOf('EDITOR')) {
    throw new Error('Forbidden: editor access required')
  }
  return session
}
