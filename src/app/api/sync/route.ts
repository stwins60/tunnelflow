/**
 * POST /api/sync  — trigger a sync with Cloudflare (per-user)
 * GET  /api/sync  — return last sync status for the current user
 */

import { NextRequest } from 'next/server'
import { requireAuth, requireEditor } from '@/lib/session'
import { syncWithCloudflare } from '@/lib/cloudflare'
import { isSetupComplete, resolveWorkspaceId } from '@/lib/auth'
import { ok, unauthorized, serverError } from '@/lib/api-helpers'
import { getSyncState } from '@/lib/sync-state'
import { sendNotification } from '@/lib/notifications'

import { runHealthChecks } from '@/lib/health-checker'

export async function POST(request: NextRequest) {
  try {
    const session = await requireEditor().catch(() => null)
    if (!session) return unauthorized()

    const wsId  = resolveWorkspaceId(session.userId!)
    const state = getSyncState(wsId)

    if (state.inProgress) {
      return ok({ message: 'Sync already in progress', ...state })
    }

    const setupDone = await isSetupComplete(wsId)
    if (!setupDone) {
      return ok({ message: 'Setup not complete — skipping sync' })
    }

    state.inProgress = true
    state.error = null

    try {
      const result = await syncWithCloudflare(wsId)
      state.lastSyncAt = new Date()
      state.lastResult = result

      if (wsId) {
        const driftCount = result.driftDetected?.length ?? 0
        if (driftCount > 0) {
          sendNotification({ event: 'sync.drift_detected', title: 'Drift Detected', body: `${driftCount} server${driftCount !== 1 ? 's are' : ' is'} out of sync with Cloudflare.`, fields: { 'Drifted servers': String(driftCount) } }, wsId).catch(console.error)
        } else {
          sendNotification({ event: 'sync.completed', title: 'Sync Completed', body: 'All servers are in sync with Cloudflare.' }, wsId).catch(console.error)
        }

        // Run health checks in the background after sync
        runHealthChecks(wsId).catch(console.error)
      }

      return ok({ ...result, lastSyncAt: state.lastSyncAt })
    } finally {
      state.inProgress = false
    }
  } catch (e) {
    const session = await requireAuth().catch(() => null)
    const wsId  = session?.userId ? resolveWorkspaceId(session.userId) : undefined
    const state = getSyncState(wsId)
    state.error = e instanceof Error ? e.message : 'Unknown sync error'
    state.inProgress = false

    if (wsId) {
      sendNotification({ event: 'sync.error', title: 'Sync Error', body: state.error ?? 'An unknown error occurred during sync.' }, wsId).catch(console.error)
    }

    return serverError(e)
  }
}

export async function GET() {
  try {
    const session = await requireAuth().catch(() => null)
    if (!session) return unauthorized()

    const wsId  = resolveWorkspaceId(session.userId!)
    const state = getSyncState(wsId)
    return ok({ lastSyncAt: state.lastSyncAt, lastResult: state.lastResult, inProgress: state.inProgress, error: state.error })
  } catch (e) {
    return serverError(e)
  }
}
