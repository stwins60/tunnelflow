/**
 * GET  /api/users/groups  — list groups owned by the caller's workspace
 * POST /api/users/groups  — create a new group
 */

import { NextRequest } from 'next/server'
import { db, now, newId } from '@/lib/db'
import { requireAdmin } from '@/lib/session'
import { resolveWorkspaceId } from '@/lib/auth'
import { ok, err, unauthorized, serverError } from '@/lib/api-helpers'
import type { DbUserGroup } from '@/lib/db'

export async function GET() {
  try {
    const session = await requireAdmin().catch(() => null)
    if (!session?.userId) return unauthorized()

    const workspaceId = resolveWorkspaceId(session.userId)
    const groups = db.prepare(`SELECT * FROM "UserGroup" WHERE "ownerId" = ? ORDER BY "createdAt" ASC`).all(workspaceId) as DbUserGroup[]

    const withMembers = groups.map((g) => {
      const members = db.prepare(`
        SELECT u."id", u."email", u."accessLevel", m."accessLevel" AS memberAccessLevel
        FROM "UserGroupMember" m
        JOIN "User" u ON u."id" = m."userId"
        WHERE m."groupId" = ?
      `).all(g.id) as { id: string; email: string; accessLevel: string; memberAccessLevel: string | null }[]
      return { ...g, members }
    })

    return ok({ groups: withMembers })
  } catch (e) {
    return serverError(e)
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin().catch(() => null)
    if (!session?.userId) return unauthorized()

    const { name, description, accessLevel = 'VIEWER' } = await req.json() as { name?: string; description?: string; accessLevel?: string }
    if (!name?.trim()) return err('name is required', 422)
    if (!['ADMIN', 'EDITOR', 'VIEWER'].includes(accessLevel)) return err('accessLevel must be ADMIN, EDITOR, or VIEWER', 422)

    const workspaceId = resolveWorkspaceId(session.userId)
    const id = newId(); const ts = now()
    db.prepare(`INSERT INTO "UserGroup" ("id","ownerId","name","description","accessLevel","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?)`)
      .run(id, workspaceId, name.trim(), description ?? null, accessLevel, ts, ts)

    const group = db.prepare(`SELECT * FROM "UserGroup" WHERE "id" = ?`).get(id) as DbUserGroup
    return ok({ group: { ...group, members: [] } }, 201)
  } catch (e) {
    return serverError(e)
  }
}
