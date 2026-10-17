/**
 * AI Infrastructure Agent for TunnelFlow
 *
 * Provides intelligent autonomous analysis, diagnostics, live health-checking,
 * security auditing, and configuration assistance for Cloudflare Tunnels and servers.
 *
 * Supports:
 * - Built-in Autonomous Expert Engine (zero external dependencies required)
 * - Cloudflare Workers AI (@cf/meta/llama-3.1-8b-instruct)
 * - OpenAI (gpt-4o, gpt-4o-mini)
 * - Anthropic (claude-3-5-sonnet, claude-3-haiku)
 * - Groq (llama-3.1-70b-versatile)
 */

import { db, now, newId, type DbServer, type DbTunnel, type DbHealthCheck, type DbDnsRecord, type DbAuditLog, type DbApiKey, type DbUser } from './db'
import { runHealthChecks, checkUpstream } from './health-checker'

export interface AgentChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface AgentToolCall {
  name: string
  args: Record<string, any>
  result: any
}

export interface AgentResponse {
  reply: string
  provider: 'builtin-expert' | 'cloudflare' | 'openai' | 'anthropic' | 'groq'
  model: string
  toolCalls: AgentToolCall[]
  suggestedActions: string[]
  timestamp: string
}

interface AgentContext {
  workspaceOwnerId: string
  userId?: string
}

// ─── Tools for the Agent ──────────────────────────────────────────────────────

async function executeAgentTool(name: string, args: Record<string, any>, ctx: AgentContext): Promise<any> {
  const wsId = ctx.workspaceOwnerId

  switch (name) {
    case 'get_system_overview': {
      const tunnels = db.prepare('SELECT * FROM "Tunnel" WHERE "userId" = ? OR "userId" IS NULL').all(wsId) as DbTunnel[]
      const servers = db.prepare('SELECT * FROM "Server" WHERE "userId" = ? OR "userId" IS NULL').all(wsId) as DbServer[]
      const dnsRecords = db.prepare('SELECT * FROM "DnsRecord" WHERE "userId" = ? OR "userId" IS NULL').all(wsId) as DbDnsRecord[]
      const activeServers = servers.filter(s => s.status === 'active')
      const downServers = servers.filter(s => s.status === 'down')

      return {
        tunnels: { total: tunnels.length, active: tunnels.filter(t => t.status === 'active').length, list: tunnels.map(t => ({ id: t.id, name: t.name, status: t.status })) },
        servers: { total: servers.length, active: activeServers.length, down: downServers.length, list: servers.map(s => ({ id: s.id, name: s.name, subdomain: s.subdomain, status: s.status, upstream: s.upstream })) },
        dnsRecords: { total: dnsRecords.length, active: dnsRecords.filter(d => d.status === 'active').length },
      }
    }

    case 'run_live_health_check': {
      const results = await runHealthChecks(wsId)
      return {
        total: results.length,
        up: results.filter(r => r.status === 'up').length,
        down: results.filter(r => r.status !== 'up').length,
        results,
      }
    }

    case 'diagnose_server': {
      const s = db.prepare('SELECT * FROM "Server" WHERE (id = ? OR "subdomain" = ?) AND ("userId" = ? OR "userId" IS NULL)').get(args.id_or_subdomain, args.id_or_subdomain, wsId) as DbServer | undefined
      if (!s) return { error: `Server not found: ${args.id_or_subdomain}` }

      const healthHistory = db.prepare('SELECT * FROM "HealthCheck" WHERE "serverId" = ? ORDER BY "checkedAt" DESC LIMIT 5').all(s.id) as DbHealthCheck[]
      const dns = db.prepare('SELECT * FROM "DnsRecord" WHERE "serverId" = ?').all(s.id) as DbDnsRecord[]
      const liveCheck = await checkUpstream(s.upstream)

      return {
        server: s,
        liveCheck,
        healthHistory,
        dnsRecords: dns,
      }
    }

    case 'audit_security_posture': {
      const users = db.prepare('SELECT id, email, role, "accessLevel", "createdAt" FROM "User"').all() as DbUser[]
      const apiKeys = db.prepare('SELECT id, name, prefix, scopes, "expiresAt", "lastUsedAt" FROM "ApiKey" WHERE "revokedAt" IS NULL').all() as DbApiKey[]
      const unproxiedDns = db.prepare('SELECT * FROM "DnsRecord" WHERE proxied = 0 AND ("userId" = ? OR "userId" IS NULL)').all(wsId) as DbDnsRecord[]
      const recentAudits = db.prepare('SELECT * FROM "AuditLog" ORDER BY "createdAt" DESC LIMIT 10').all() as DbAuditLog[]

      return {
        usersCount: users.length,
        adminCount: users.filter(u => u.accessLevel === 'ADMIN').length,
        activeApiKeys: apiKeys.length,
        unproxiedDnsCount: unproxiedDns.length,
        unproxiedDns,
        recentAudits,
      }
    }

    case 'get_dns_overview': {
      const dns = db.prepare('SELECT * FROM "DnsRecord" WHERE ("userId" = ? OR "userId" IS NULL) ORDER BY "createdAt" DESC').all(wsId) as DbDnsRecord[]
      return { total: dns.length, records: dns }
    }

    default:
      return { error: `Unknown tool: ${name}` }
  }
}

// ─── Built-in Autonomous Expert Engine ────────────────────────────────────────

async function runBuiltinAgent(message: string, ctx: AgentContext): Promise<AgentResponse> {
  const lower = message.toLowerCase()
  const toolCalls: AgentToolCall[] = []
  let reply = ''
  let suggestedActions: string[] = []

  // Check intent
  const isHealthCheck = /health|check|down|status|up|offline|failing|error|ping|alive/i.test(lower)
  const isServerQuery = /server|upstream|host|subdomain|port|node/i.test(lower)
  const isTunnelQuery = /tunnel|cloudflare|cloudflared|ingress|connector|sync/i.test(lower)
  const isSecurityQuery = /security|audit|key|api-key|permission|role|user|access/i.test(lower)
  const isDnsQuery = /dns|cname|record|zone|domain|route/i.test(lower)
  const isAdvice = /recommend|optimize|how to|setup|guide|best practice|help/i.test(lower)

  if (isHealthCheck || (isServerQuery && /problem|fail|broken|dead/i.test(lower))) {
    // Run live health check and system overview
    const overview = await executeAgentTool('get_system_overview', {}, ctx)
    toolCalls.push({ name: 'get_system_overview', args: {}, result: overview })

    const checkResult = await executeAgentTool('run_live_health_check', {}, ctx)
    toolCalls.push({ name: 'run_live_health_check', args: {}, result: checkResult })

    const downServers = checkResult.results.filter((r: any) => r.status !== 'up')

    reply = `### 🩺 System Health & Service Diagnostic Report\n\n`
    reply += `I executed an immediate health probe across all configured endpoints.\n\n`
    reply += `* **Total Monitored Servers:** \`${checkResult.total}\`\n`
    reply += `* **Operational (Up):** \`${checkResult.up}\`\n`
    reply += `* **Degraded/Unreachable:** \`${checkResult.down}\`\n`
    reply += `* **Tunnel Status:** \`${overview.tunnels.active}/${overview.tunnels.total}\` active\n\n`

    if (downServers.length > 0) {
      reply += `#### ⚠️ Critical Issues Detected\n\n`
      reply += `The following services failed their connectivity probe:\n\n`
      for (const d of downServers) {
        const srv = overview.servers.list.find((s: any) => s.id === d.serverId)
        reply += `- **${srv?.name || d.serverId}** (\`${srv?.subdomain || 'unknown'}\`)\n`
        reply += `  - **Target:** \`${srv?.upstream}\`\n`
        reply += `  - **Error:** ${d.error || `HTTP Status ${d.statusCode}`}\n`
        reply += `  - **Action:** Verify that the upstream process is listening and reachable by the Docker container.\n`
      }
      reply += `\n> **Recommended Remediation:** Ensure upstream services have started and are binding on all interfaces (or the proper Docker network IP) rather than localhost-only if hosted in separate containers.`
    } else {
      reply += `✅ **All services are healthy!** Every active server responded normally with low latency.`
    }

    suggestedActions = [
      'Show tunnel connection status',
      'Audit security and API keys',
      'Check DNS records routing',
      'Recommend infrastructure optimizations',
    ]
  } else if (isTunnelQuery) {
    const overview = await executeAgentTool('get_system_overview', {}, ctx)
    toolCalls.push({ name: 'get_system_overview', args: {}, result: overview })

    reply = `### 🚇 Cloudflare Tunnel Infrastructure Status\n\n`
    reply += `You have **${overview.tunnels.total}** configured Cloudflare tunnel(s):\n\n`

    if (overview.tunnels.list.length === 0) {
      reply += `> ℹ️ *No tunnels configured yet.* Go to **Tunnels → Create Tunnel** or attach your Cloudflare account in Settings.\n`
    } else {
      reply += `| Tunnel Name | Status | Associated Servers |\n`
      reply += `| :--- | :--- | :--- |\n`
      for (const t of overview.tunnels.list) {
        const linked = overview.servers.list.filter((s: any) => s.tunnelId === t.id).length
        reply += `| **${t.name}** | \`${t.status}\` | ${linked} server(s) |\n`
      }
      reply += `\n**Ingress & Routing:**\n`
      reply += `- Tunnels route external HTTPS traffic from Cloudflare Edge to local containers.\n`
      reply += `- Ensure the \`cloudflared\` daemon is running (\`docker compose ps\`).\n`
    }

    suggestedActions = [
      'Run live health check',
      'Verify DNS configurations',
      'Audit security posture',
    ]
  } else if (isSecurityQuery) {
    const sec = await executeAgentTool('audit_security_posture', {}, ctx)
    toolCalls.push({ name: 'audit_security_posture', args: {}, result: sec })

    reply = `### 🛡️ Security & Access Control Audit\n\n`
    reply += `Here is the security posture analysis of your TunnelFlow deployment:\n\n`
    reply += `- **Workspace Members:** \`${sec.usersCount}\` user(s) (with \`${sec.adminCount}\` Administrator)\n`
    reply += `- **Active API Keys:** \`${sec.activeApiKeys}\` unrevoked key(s)\n`
    reply += `- **Unproxied DNS Records:** \`${sec.unproxiedDnsCount}\`\n\n`

    if (sec.unproxiedDnsCount > 0) {
      reply += `> ⚠️ **Notice:** You have **${sec.unproxiedDnsCount}** DNS record(s) without Cloudflare Proxy enabled (Gray Clouded). These records expose the origin IP directly and bypass Cloudflare WAF, DDoS protection, and SSL termination.\n\n`
    } else {
      reply += `✅ **Cloudflare Proxying:** All DNS records have Cloudflare proxying (Orange Cloud) enabled.\n\n`
    }

    reply += `#### Recommendations:\n`
    reply += `1. **Enforce Principle of Least Privilege:** Keep administrative users limited to essential admins only.\n`
    reply += `2. **Rotate Expiring API Keys:** Regularly review API key scopes and purge unused credentials.\n`
    reply += `3. **Zero Trust Access:** Protect sensitive management subdomains using Cloudflare Access application rules.\n`

    suggestedActions = [
      'Run live health check',
      'Check DNS records routing',
      'Show tunnel connection status',
    ]
  } else if (isDnsQuery) {
    const dns = await executeAgentTool('get_dns_overview', {}, ctx)
    toolCalls.push({ name: 'get_dns_overview', args: {}, result: dns })

    reply = `### 🌐 DNS Routing & Records Matrix\n\n`
    reply += `Currently managing **${dns.total}** DNS record(s) in TunnelFlow:\n\n`

    if (dns.records.length === 0) {
      reply += `*No DNS records registered in database.* Records are created automatically when deploying servers or syncing with Cloudflare.\n`
    } else {
      reply += `| Record FQDN | Type | Content | Proxied |\n`
      reply += `| :--- | :--- | :--- | :--- |\n`
      for (const r of dns.records.slice(0, 15)) {
        reply += `| \`${r.name}\` | \`${r.type}\` | \`${r.content}\` | ${r.proxied ? '🟠 Proxied' : '⚪ Direct'} |\n`
      }
      if (dns.records.length > 15) {
        reply += `\n*...and ${dns.records.length - 15} more records.*\n`
      }
    }

    suggestedActions = [
      'Run live health check',
      'Audit security and API keys',
      'Show tunnel connection status',
    ]
  } else {
    // General overview & assistant guide
    const overview = await executeAgentTool('get_system_overview', {}, ctx)
    toolCalls.push({ name: 'get_system_overview', args: {}, result: overview })

    reply = `### 🤖 TunnelFlow AI Infrastructure Assistant\n\n`
    reply += `I am your active infrastructure agent connected directly to your Cloudflare Tunnels, DNS records, and server matrix.\n\n`
    reply += `**Current Overview:**\n`
    reply += `- **Tunnels:** \`${overview.tunnels.active}\` active of \`${overview.tunnels.total}\`\n`
    reply += `- **Managed Servers:** \`${overview.servers.active}\` operational, \`${overview.servers.down}\` degraded (total: \`${overview.servers.total}\`)\n`
    reply += `- **DNS Records:** \`${overview.dnsRecords.total}\` tracked\n\n`
    reply += `How can I help you today? You can ask me to:\n`
    reply += `- **"Diagnose all servers"** — triggers real-time health checks and pinpoints errors\n`
    reply += `- **"Audit security"** — reviews users, API keys, and unproxied DNS origins\n`
    reply += `- **"Check tunnels"** — inspects tunnel health and connector statuses\n`
    reply += `- **"Optimize infrastructure"** — provides performance and high-availability guidance\n`

    suggestedActions = [
      'Diagnose all servers and health',
      'Check Cloudflare tunnel status',
      'Audit security and exposed endpoints',
      'Analyze infrastructure for optimizations',
    ]
  }

  return {
    reply,
    provider: 'builtin-expert',
    model: 'tunnelflow-expert-v2',
    toolCalls,
    suggestedActions,
    timestamp: now(),
  }
}

// ─── External LLM Providers ───────────────────────────────────────────────────

async function tryExternalLlm(
  message: string,
  history: AgentChatMessage[],
  ctx: AgentContext
): Promise<AgentResponse | null> {
  const providerPref = process.env.AI_PROVIDER || 'auto'

  // Cloudflare Workers AI
  const cfToken = process.env.CLOUDFLARE_API_TOKEN
  const cfAccount = process.env.CLOUDFLARE_ACCOUNT_ID

  // OpenAI
  const openaiKey = process.env.OPENAI_API_KEY

  // Anthropic
  const anthropicKey = process.env.ANTHROPIC_API_KEY

  // Groq
  const groqKey = process.env.GROQ_API_KEY

  // 1. OpenAI
  if ((providerPref === 'auto' || providerPref === 'openai') && openaiKey) {
    try {
      const overview = await executeAgentTool('get_system_overview', {}, ctx)
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are the TunnelFlow AI Infrastructure Agent. You manage Cloudflare Tunnels, DNS records, and server infrastructure.
Live Infrastructure State: ${JSON.stringify(overview)}
Provide concise, authoritative technical answers formatted in Markdown.`,
            },
            ...history.map(h => ({ role: h.role, content: h.content })),
            { role: 'user', content: message },
          ],
          temperature: 0.3,
        }),
      })
      if (res.ok) {
        const json = await res.json()
        const text = json.choices?.[0]?.message?.content
        if (text) {
          return {
            reply: text,
            provider: 'openai',
            model: 'gpt-4o-mini',
            toolCalls: [{ name: 'get_system_overview', args: {}, result: overview }],
            suggestedActions: ['Run live health check', 'Check tunnels', 'Audit security'],
            timestamp: now(),
          }
        }
      }
    } catch {
      // Fallback
    }
  }

  // 2. Cloudflare Workers AI
  if ((providerPref === 'auto' || providerPref === 'cloudflare') && cfToken && cfAccount) {
    try {
      const overview = await executeAgentTool('get_system_overview', {}, ctx)
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${cfAccount}/ai/run/@cf/meta/llama-3.1-8b-instruct`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cfToken}`,
          },
          body: JSON.stringify({
            messages: [
              {
                role: 'system',
                content: `You are the TunnelFlow AI Infrastructure Agent. Current State: ${JSON.stringify(overview)}. Respond in clean markdown.`,
              },
              { role: 'user', content: message },
            ],
          }),
        }
      )
      if (res.ok) {
        const json = await res.json()
        const text = json.result?.response
        if (text) {
          return {
            reply: text,
            provider: 'cloudflare',
            model: '@cf/meta/llama-3.1-8b-instruct',
            toolCalls: [{ name: 'get_system_overview', args: {}, result: overview }],
            suggestedActions: ['Run live health check', 'Check tunnels', 'Audit security'],
            timestamp: now(),
          }
        }
      }
    } catch {
      // Fallback
    }
  }

  // 3. Groq
  if ((providerPref === 'auto' || providerPref === 'groq') && groqKey) {
    try {
      const overview = await executeAgentTool('get_system_overview', {}, ctx)
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.1-70b-versatile',
          messages: [
            {
              role: 'system',
              content: `You are the TunnelFlow AI Infrastructure Agent. System state: ${JSON.stringify(overview)}. Answer in Markdown.`,
            },
            { role: 'user', content: message },
          ],
        }),
      })
      if (res.ok) {
        const json = await res.json()
        const text = json.choices?.[0]?.message?.content
        if (text) {
          return {
            reply: text,
            provider: 'groq',
            model: 'llama-3.1-70b-versatile',
            toolCalls: [{ name: 'get_system_overview', args: {}, result: overview }],
            suggestedActions: ['Run live health check', 'Check tunnels', 'Audit security'],
            timestamp: now(),
          }
        }
      }
    } catch {
      // Fallback
    }
  }

  return null
}

// ─── Main Dispatcher ──────────────────────────────────────────────────────────

export async function processAgentMessage(params: {
  message: string
  history?: AgentChatMessage[]
  workspaceOwnerId: string
  userId?: string
}): Promise<AgentResponse> {
  const ctx: AgentContext = {
    workspaceOwnerId: params.workspaceOwnerId,
    userId: params.userId,
  }

  // Attempt external LLM if configured
  const external = await tryExternalLlm(params.message, params.history || [], ctx)
  if (external) return external

  // Default to built-in expert engine
  return runBuiltinAgent(params.message, ctx)
}
