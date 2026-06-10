/**
 * In-memory sliding-window rate limiter.
 *
 * Designed for Next.js Route Handlers. Uses a per-key Map stored in globalThis
 * so it persists across hot-reload in development.
 *
 * Usage:
 *   const limiter = getRateLimiter('auth', { windowMs: 60_000, max: 10 })
 *   const result  = limiter.check(ip)
 *   if (!result.ok) return err('Too many requests', 429)
 */

export interface RateLimitOptions {
  /** Window duration in milliseconds */
  windowMs: number
  /** Maximum requests per window */
  max: number
}

export interface RateLimitResult {
  ok: boolean
  remaining: number
  resetAt: number  // epoch ms
  retryAfterMs: number
}

interface WindowEntry {
  count: number
  windowStart: number
}

type LimiterMap = Map<string, WindowEntry>

const globalForLimiters = globalThis as unknown as {
  _rateLimiters: Map<string, LimiterMap>
}

if (!globalForLimiters._rateLimiters) {
  globalForLimiters._rateLimiters = new Map()
}

export function getRateLimiter(name: string, opts: RateLimitOptions) {
  if (!globalForLimiters._rateLimiters.has(name)) {
    globalForLimiters._rateLimiters.set(name, new Map())
  }
  const store = globalForLimiters._rateLimiters.get(name)!

  return {
    check(key: string): RateLimitResult {
      const now = Date.now()
      const entry = store.get(key)

      if (!entry || now - entry.windowStart >= opts.windowMs) {
        // New or expired window
        store.set(key, { count: 1, windowStart: now })
        return { ok: true, remaining: opts.max - 1, resetAt: now + opts.windowMs, retryAfterMs: 0 }
      }

      entry.count += 1
      const resetAt = entry.windowStart + opts.windowMs
      const remaining = Math.max(0, opts.max - entry.count)

      if (entry.count > opts.max) {
        return { ok: false, remaining: 0, resetAt, retryAfterMs: resetAt - now }
      }

      return { ok: true, remaining, resetAt, retryAfterMs: 0 }
    },

    /** Periodically purge expired entries to prevent unbounded memory growth */
    purge() {
      const now = Date.now()
      Array.from(store.entries()).forEach(([key, entry]) => {
        if (now - entry.windowStart >= opts.windowMs) {
          store.delete(key)
        }
      })
    },
  }
}

// ─── Pre-configured limiters ─────────────────────────────────────────────────

export const authLimiter = getRateLimiter('auth', {
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
  max:      Number(process.env.RATE_LIMIT_MAX_AUTH  ?? 10),
})

export const apiLimiter = getRateLimiter('api', {
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
  max:      Number(process.env.RATE_LIMIT_MAX_API   ?? 120),
})

// Purge stale entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    authLimiter.purge()
    apiLimiter.purge()
  }, 5 * 60 * 1000)
}
