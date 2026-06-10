/**
 * Per-user in-memory sync state.
 * Uses a Map keyed by userId so each user has independent sync tracking.
 */

export interface SyncResult {
  tunnelsUpdated: number
  driftDetected: string[]
}

export interface SyncState {
  lastSyncAt: Date | null
  lastResult: SyncResult | null
  inProgress: boolean
  error: string | null
}

// Global singleton map — keyed by userId (or '__global__' for legacy single-tenant)
const globalForSync = globalThis as unknown as { _syncStates: Map<string, SyncState> | undefined }

export const syncStates: Map<string, SyncState> =
  globalForSync._syncStates ?? new Map()

if (process.env.NODE_ENV !== 'production') {
  globalForSync._syncStates = syncStates
}

const DEFAULT_STATE: SyncState = {
  lastSyncAt: null,
  lastResult: null,
  inProgress: false,
  error: null,
}

export function getSyncState(userId?: string | null): SyncState {
  const key = userId ?? '__global__'
  if (!syncStates.has(key)) {
    syncStates.set(key, { ...DEFAULT_STATE })
  }
  return syncStates.get(key)!
}

/** @deprecated kept for backward compatibility */
export const syncState = getSyncState()
