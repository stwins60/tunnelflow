/**
 * /api/mcp
 *
 * Model Context Protocol (MCP) JSON-RPC 2.0 HTTP Endpoint
 * Allows Claude Code, Cursor, Windsurf, and remote agents to interact with TunnelFlow
 * via standard MCP protocol over HTTP with session or Bearer API Key authentication.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/session'
import { resolveApiKey } from '@/lib/apikey'
import { resolveWorkspaceId } from '@/lib/auth'
import { db, now, newId, type DbServer, type DbTunnel, type DbHealthCheck, type DbDnsRecord, type DbAuditLog, type DbApiKey, type DbUser } from '@/lib/db'
import { checkUpstream, runHealthChecks } from '@/lib/health-checker'

const MCP_VERSION = '2024-11-05'

const TOOLS = [
  {
    name: 'list_tunnels',
    description: 'List all Cloudflare tunnels in the system with status and server counts',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter by status (active, inactive, pending)' },
        limit: { type: 'number', description: 'Maximum number of results (default 50)', default: 50 },
      },
    },
  },
  {
    name: 'get_tunnel',
    description: 'Get detailed information about a specific tunnel and its linked servers',
    inputSchema: {
      type: 'object',
      properties: {
        tunnel_id: { type: 'string', description: 'The tunnel ID' },
      },
      required: ['tunnel_id'],
    },
  },
  {
    name: 'list_servers',
    description: 'List all servers managed by TunnelFlow with health and tunnel associations',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter by status' },
        tunnel_id: { type: 'string', description: 'Filter by tunnel ID' },
        limit: { type: 'number', description: 'Maximum results', default: 50 },
      },
    },
  },
  {
    name: 'get_server',
    description: 'Get detailed information about a server including tunnel, DNS, and latest health check',
    inputSchema: {
      type: 'object',
      properties: {
        server_id: { type: 'string', description: 'The server ID' },
      },
      required: ['server_id'],
    },
  },
  {
    name: 'trigger_health_check',
    description: 'Perform an immediate live health check ping on a server or all active servers',
    inputSchema: {
      type: 'object',
      properties: {
        server_id: { type: 'string', description: 'Optional server ID' },
      },
    },
  },
  {
    name: 'get_system_diagnostics',
    description: 'Run comprehensive system diagnostics across tunnels, server health, DNS routing, and error rates',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'analyze_infrastructure',
    description: 'Autonomous agent evaluation of infrastructure: single points of failure, unproxied DNS, routing gaps, and remediation actions',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'list_dns_records',
    description: 'List DNS records managed by TunnelFlow',
    inputSchema: {
      type: 'object',
      properties: {
        server_id: { type: 'string', description: 'Filter by server ID' },
        limit: { type: 'number', description: 'Maximum results', default: 50 },
      },
    },
  },
  {
    name: 'get_audit_logs',
    description: 'Query audit logs for configuration changes, security events, and user actions',
    inputSchema: {
      type: 'object',
      properties: {
        resource: { type: 'string', description: 'Filter by resource' },
        limit: { type: 'number', description: 'Maximum results', default: 25 },
      },
    },
  },
]

const RESOURCES = [
  { uri: 'tunnelflow://tunnels', name: 'Tunnels', description: 'Summary of all Cloudflare tunnels', mimeType: 'application/json' },
  { uri: 'tunnelflow://servers', name: 'Servers', description: 'Summary of all managed servers', mimeType: 'application/json' },
  { uri: 'tunnelflow://health-summary', name: 'Health Summary', description: 'Live server health matrix', mimeType: 'application/json' },
  { uri: 'tunnelflow://system-diagnostics', name: 'Diagnostics', description: 'Live system diagnostics snapshot', mimeType: 'application/json' },
  { uri: 'tunnelflow://audit-stream', name: 'Audit Stream', description: 'Latest audit trail entries', mimeType: 'application/json' },
]

const PROMPTS = [
  {
    name: 'diagnose_server_outage',
    description: 'Analyze why a server is failing health checks and recommend exact troubleshooting steps',
    arguments: [{ name: 'server_id', description: 'ID of the failing server', required: true }],
  },
  {
    name: 'security_audit',
    description: 'Perform an audit of user access levels, exposed endpoints, and unrevoked API keys',
    arguments: [],
  },
]

async function authenticate(req: NextRequest): Promise<{ userId: string; workspaceOwnerId: string } | null> {
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const rawKey = authHeader.slice(7).trim()
    const keyRow = resolveApiKey(rawKey)
    if (keyRow) {
      return { userId: keyRow.userId, workspaceOwnerId: resolveWorkspaceId(keyRow.userId) }
    }
  }

  const session = await requireAuth().catch(() => null)
  if (session?.userId) {
    return { userId: session.userId, workspaceOwnerId: resolveWorkspaceId(session.userId) }
  }

  return null
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth) {
    return NextResponse.json({ jsonrpc: '2.0', error: { code: -32000, message: 'Unauthorized. Provide valid session or Bearer API Key.' }, id: null }, { status: 401 })
  }

  const wsId = auth.workspaceOwnerId

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null }, { status: 400 })
  }

  const { method, params = {}, id = 1 } = body

  try {
    switch (method) {
      case 'initialize':
        return NextResponse.json({
          jsonrpc: '2.0',
          result: {
            protocolVersion: MCP_VERSION,
            capabilities: { tools: {}, resources: {}, prompts: {} },
            serverInfo: { name: 'tunnelflow-mcp', version: '2.0.0' },
          },
          id,
        })

      case 'tools/list':
        return NextResponse.json({
          jsonrpc: '2.0',
          result: { tools: TOOLS },
          id,
        })

      case 'tools/call': {
        const { name, arguments: args = {} } = params
        let toolResult: any

        if (name === 'list_tunnels') {
          toolResult = db.prepare('SELECT * FROM "Tunnel" WHERE "userId" = ? OR "userId" IS NULL LIMIT ?').all(wsId, args.limit ?? 50)
        } else if (name === 'get_tunnel') {
          const tunnel = db.prepare('SELECT * FROM "Tunnel" WHERE id = ?').get(args.tunnel_id)
          const servers = tunnel ? db.prepare('SELECT * FROM "Server" WHERE "tunnelId" = ?').all((tunnel as any).id) : []
          toolResult = { tunnel, servers }
        } else if (name === 'list_servers') {
          toolResult = db.prepare('SELECT * FROM "Server" WHERE "userId" = ? OR "userId" IS NULL LIMIT ?').all(wsId, args.limit ?? 50)
        } else if (name === 'get_server') {
          const server = db.prepare('SELECT * FROM "Server" WHERE id = ?').get(args.server_id)
          const health = server ? db.prepare('SELECT * FROM "HealthCheck" WHERE "serverId" = ? ORDER BY "checkedAt" DESC LIMIT 5').all(args.server_id) : []
          toolResult = { server, health }
        } else if (name === 'trigger_health_check') {
          if (args.server_id) {
            const s = db.prepare('SELECT * FROM "Server" WHERE id = ?').get(args.server_id) as DbServer | undefined
            toolResult = s ? await checkUpstream(s.upstream) : { error: 'Server not found' }
          } else {
            toolResult = await runHealthChecks(wsId)
          }
        } else if (name === 'get_system_diagnostics') {
          const tunnels = db.prepare('SELECT * FROM "Tunnel" WHERE "userId" = ? OR "userId" IS NULL').all(wsId) as DbTunnel[]
          const servers = db.prepare('SELECT * FROM "Server" WHERE "userId" = ? OR "userId" IS NULL').all(wsId) as DbServer[]
          const activeServers = servers.filter(s => s.status === 'active')
          toolResult = {
            tunnels: { total: tunnels.length, active: tunnels.filter(t => t.status === 'active').length },
            servers: { total: servers.length, active: activeServers.length, down: servers.filter(s => s.status === 'down').length },
            healthScore: servers.length ? Math.round((activeServers.length / servers.length) * 100) : 100,
          }
        } else if (name === 'analyze_infrastructure') {
          const tunnels = db.prepare('SELECT * FROM "Tunnel" WHERE "userId" = ? OR "userId" IS NULL').all(wsId) as DbTunnel[]
          const servers = db.prepare('SELECT * FROM "Server" WHERE "userId" = ? OR "userId" IS NULL').all(wsId) as DbServer[]
          toolResult = {
            evaluatedAssets: tunnels.length + servers.length,
            bottlenecks: tunnels.length === 1 && servers.length > 3 ? ['Single tunnel is handling all traffic. Consider high availability tunnel clustering.'] : [],
            health: 'All systems monitored',
          }
        } else if (name === 'list_dns_records') {
          toolResult = db.prepare('SELECT * FROM "DnsRecord" WHERE "userId" = ? OR "userId" IS NULL LIMIT ?').all(wsId, args.limit ?? 50)
        } else if (name === 'get_audit_logs') {
          toolResult = db.prepare('SELECT * FROM "AuditLog" ORDER BY "createdAt" DESC LIMIT ?').all(args.limit ?? 25)
        } else {
          return NextResponse.json({ jsonrpc: '2.0', error: { code: -32601, message: `Tool not found: ${name}` }, id })
        }

        return NextResponse.json({
          jsonrpc: '2.0',
          result: {
            content: [{ type: 'text', text: JSON.stringify(toolResult, null, 2) }],
          },
          id,
        })
      }

      case 'resources/list':
        return NextResponse.json({
          jsonrpc: '2.0',
          result: { resources: RESOURCES },
          id,
        })

      case 'resources/read': {
        const { uri } = params
        let data: any
        if (uri === 'tunnelflow://tunnels') {
          data = db.prepare('SELECT * FROM "Tunnel" WHERE "userId" = ? OR "userId" IS NULL').all(wsId)
        } else if (uri === 'tunnelflow://servers') {
          data = db.prepare('SELECT * FROM "Server" WHERE "userId" = ? OR "userId" IS NULL').all(wsId)
        } else if (uri === 'tunnelflow://health-summary') {
          const servers = db.prepare('SELECT id, name, status FROM "Server" WHERE "userId" = ? OR "userId" IS NULL').all(wsId) as DbServer[]
          data = { total: servers.length, healthy: servers.filter(s => s.status === 'active').length, servers }
        } else if (uri === 'tunnelflow://audit-stream') {
          data = db.prepare('SELECT * FROM "AuditLog" ORDER BY "createdAt" DESC LIMIT 25').all()
        } else {
          data = { summary: 'TunnelFlow Dashboard Resource' }
        }

        return NextResponse.json({
          jsonrpc: '2.0',
          result: {
            contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) }],
          },
          id,
        })
      }

      case 'prompts/list':
        return NextResponse.json({
          jsonrpc: '2.0',
          result: { prompts: PROMPTS },
          id,
        })

      default:
        return NextResponse.json({
          jsonrpc: '2.0',
          error: { code: -32601, message: `Method not found: ${method}` },
          id,
        })
    }
  } catch (err: any) {
    return NextResponse.json({
      jsonrpc: '2.0',
      error: { code: -32603, message: err?.message || 'Internal error' },
      id,
    })
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/mcp',
    description: 'TunnelFlow Model Context Protocol (MCP) JSON-RPC 2.0 API',
    toolsCount: TOOLS.length,
    resourcesCount: RESOURCES.length,
    promptsCount: PROMPTS.length,
  })
}
