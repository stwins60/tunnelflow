/**
 * GET /api/invite?token=xxx  — public: look up invite metadata (no auth required)
 */

import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { ok, err, serverError } from '@/lib/api-helpers'
import type { DbUserInvitation } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token')
    if (!token) return err('token is required', 400)

    const invite = db.prepare(`SELECT * FROM "UserInvitation" WHERE "token" = ?`).get(token) as DbUserInvitation | undefined
    if (!invite) return err('Invalid invite link.', 404)
    if (invite.acceptedAt) return err('This invite has already been accepted.', 400, 'ALREADY_ACCEPTED')
    if (new Date(invite.expiresAt) < new Date()) return err('This invite link has expired.', 400, 'EXPIRED')

    // Return enough info for the UI — never expose the token hash or sensitive data
    return ok({
      email:       invite.email,
      accessLevel: invite.accessLevel,
      expiresAt:   invite.expiresAt,
    })
  } catch (e) {
    return serverError(e)
  }
}
