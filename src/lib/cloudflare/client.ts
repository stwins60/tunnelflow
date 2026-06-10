/**
 * Cloudflare API base client with retry logic, error handling, and secret redaction.
 *
 * All Cloudflare API calls go through this client. Secrets are never logged.
 */

import { CfApiResponse, CfApiError } from '@/types'
import { getSetting, SETTING_KEYS } from '@/lib/auth'

const CF_API_BASE = 'https://api.cloudflare.com/client/v4'

const MAX_RETRIES = parseInt(process.env.CF_MAX_RETRIES ?? '3', 10)
const BASE_DELAY_MS = parseInt(process.env.CF_RETRY_BASE_DELAY_MS ?? '500', 10)

// Status codes that are worth retrying
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504])

export class CloudflareApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errors: CfApiError[],
    public readonly path: string
  ) {
    super(message)
    this.name = 'CloudflareApiError'
  }

  get isAuthError(): boolean {
    return this.statusCode === 401 || this.statusCode === 403
  }

  get isNotFound(): boolean {
    return this.statusCode === 404
  }

  get isConflict(): boolean {
    return this.statusCode === 409
  }

  get isRateLimit(): boolean {
    return this.statusCode === 429
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Fetch the Cloudflare API token from the encrypted settings store.
 * Throws a descriptive error if not configured.
 */
export async function getCfToken(): Promise<string> {
  const token = await getSetting(SETTING_KEYS.CF_API_TOKEN)
  if (!token) {
    throw new Error(
      'Cloudflare API token not configured. Complete setup at /setup first.'
    )
  }
  return token
}

/**
 * Core request function with retry/backoff for transient errors.
 * Never logs the Authorization header or API token.
 */
export async function cfRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<CfApiResponse<T>> {
  const apiToken = token ?? (await getCfToken())

  const url = path.startsWith('http') ? path : `${CF_API_BASE}${path}`

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1) + Math.random() * 100
      console.log(`[cf-client] Retry ${attempt}/${MAX_RETRIES} for ${options.method ?? 'GET'} ${path} after ${Math.round(delay)}ms`)
      await sleep(delay)
    }

    let response: Response
    try {
      response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${apiToken}`, // NEVER logged
          ...options.headers,
        },
      })
    } catch (networkErr) {
      lastError = networkErr instanceof Error ? networkErr : new Error(String(networkErr))
      if (attempt < MAX_RETRIES) continue
      throw new Error(`Network error calling Cloudflare API [${path}]: ${lastError.message}`)
    }

    if (!response.ok && RETRYABLE_STATUS.has(response.status) && attempt < MAX_RETRIES) {
      lastError = new Error(`HTTP ${response.status} from Cloudflare API [${path}]`)
      continue
    }

    let body: CfApiResponse<T>
    try {
      body = (await response.json()) as CfApiResponse<T>
    } catch {
      throw new Error(`Invalid JSON response from Cloudflare API [${path}] (HTTP ${response.status})`)
    }

    if (!body.success) {
      const errorMessages = body.errors?.map((e) => `[${e.code}] ${e.message}`).join('; ') ?? 'Unknown error'
      throw new CloudflareApiError(
        `Cloudflare API error on ${path}: ${errorMessages}`,
        response.status,
        body.errors ?? [],
        path
      )
    }

    return body
  }

  throw lastError ?? new Error(`Failed after ${MAX_RETRIES} retries: ${path}`)
}

/**
 * GET helper
 */
export async function cfGet<T>(path: string, token?: string): Promise<T> {
  const res = await cfRequest<T>(path, { method: 'GET' }, token)
  return res.result
}

/**
 * POST helper
 */
export async function cfPost<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await cfRequest<T>(
    path,
    { method: 'POST', body: JSON.stringify(body) },
    token
  )
  return res.result
}

/**
 * PUT helper
 */
export async function cfPut<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await cfRequest<T>(
    path,
    { method: 'PUT', body: JSON.stringify(body) },
    token
  )
  return res.result
}

/**
 * PATCH helper
 */
export async function cfPatch<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await cfRequest<T>(
    path,
    { method: 'PATCH', body: JSON.stringify(body) },
    token
  )
  return res.result
}

/**
 * DELETE helper
 */
export async function cfDelete<T>(path: string, body?: unknown, token?: string): Promise<T> {
  const res = await cfRequest<T>(
    path,
    { method: 'DELETE', body: body ? JSON.stringify(body) : undefined },
    token
  )
  return res.result
}

/**
 * Validate an API token and return the associated account(s).
 * Used during setup to verify the token before saving.
 */
export async function verifyToken(token: string): Promise<{ valid: boolean }> {
  try {
    const res = await cfRequest<{ id: string; status: string }>(
      '/user/tokens/verify',
      { method: 'GET' },
      token
    )
    return { valid: res.success && res.result.status === 'active' }
  } catch {
    return { valid: false }
  }
}
