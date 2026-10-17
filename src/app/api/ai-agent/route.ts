/**
 * /api/ai-agent
 *
 * POST — Send prompt to TunnelFlow AI Infrastructure Agent
 * GET  — Retrieve agent status, capabilities, and system summary
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/session'
import { resolveWorkspaceId } from '@/lib/auth'
import { resolveApiKey } from '@/lib/apikey'
import { ok, err, unauthorized, serverError } from '@/lib/api-helpers'
import { processAgentMessage, type AgentChatMessage } from '@/lib/ai-agent'
import { db } from '@/lib/db'

const requestSchema = z.object({
  message: z.string().min(1, 'Message is required').max(4000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string(),
      })
    )
    .optional(),
  action: z.string().optional(),
})

export async function POST(request: NextRequest) {
  try {
    let userId: string | null = null
    let workspaceOwnerId: string | null = null

    // Check Authorization header for API Key
    const authHeader = request.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const rawKey = authHeader.slice(7).trim()
      const keyRow = resolveApiKey(rawKey)
      if (keyRow) {
        userId = keyRow.userId
        workspaceOwnerId = resolveWorkspaceId(keyRow.userId)
      }
    }

    // Fall back to session
    if (!userId) {
      const session = await requireAuth().catch(() => null)
      if (!session) return unauthorized()
      userId = session.userId!
      workspaceOwnerId = resolveWorkspaceId(session.userId!)
    }

    if (!userId || !workspaceOwnerId) {
      return unauthorized()
    }

    const body = await request.json().catch(() => ({}))
    const parsed = requestSchema.safeParse(body)
    if (!parsed.success) {
      return err(parsed.error.errors[0]?.message ?? 'Invalid request', 400)
    }

    const response = await processAgentMessage({
      message: parsed.data.message,
      history: parsed.data.history as AgentChatMessage[] | undefined,
      workspaceOwnerId,
      userId,
    })

    return ok(response)
  } catch (e) {
    return serverError(e)
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth().catch(() => null)
    if (!session) return unauthorized()

    const wsId = resolveWorkspaceId(session.userId!)
    const tunnelsCount = (db.prepare('SELECT COUNT(*) as c FROM "Tunnel" WHERE "userId" = ? OR "userId" IS NULL').get(wsId) as any)?.c || 0
    const serversCount = (db.prepare('SELECT COUNT(*) as c FROM "Server" WHERE "userId" = ? OR "userId" IS NULL').get(wsId) as any)?.c || 0
    const downServersCount = (db.prepare('SELECT COUNT(*) as c FROM "Server" WHERE status = "down" AND ("userId" = ? OR "userId" IS NULL)').get(wsId) as any)?.c || 0

    const provider = process.env.OPENAI_API_KEY
      ? 'openai'
      : process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID
      ? 'cloudflare'
      : process.env.GROQ_API_KEY
      ? 'groq'
      : 'builtin-expert'

    return ok({
      status: 'operational',
      provider,
      capabilities: [
        'Live upstream health probe & latency diagnosis',
        'Cloudflare tunnel state & ingress rule analysis',
        'DNS routing & CNAME conflict detection',
        'Security posture & API key scope audit',
        'Automated incident remediation suggestions',
      ],
      systemSummary: {
        tunnels: tunnelsCount,
        servers: serversCount,
        degradedServers: downServersCount,
      },
      suggestedQuestions: [
        'Diagnose all failing servers',
        'Check Cloudflare tunnel connection status',
        'Audit security posture and API keys',
        'Analyze DNS routing records',
        'Recommend high-availability optimizations',
      ],
    })
  } catch (e) {
    return serverError(e)
  }
}
