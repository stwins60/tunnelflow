# Quick Start: TunnelFlow MCP Server & AI Agent

TunnelFlow provides both a **Model Context Protocol (MCP) server** for external AI tools (Claude Code, Cursor, Windsurf) and an **integrated AI Infrastructure Agent** directly within the TunnelFlow dashboard.

---

## 1. Using the AI Agent in TunnelFlow

TunnelFlow features a built-in AI Infrastructure Agent:
- Navigate to **AI Agent** in the dashboard sidebar (`/dashboard/ai-agent`)
- Ask questions, run real-time health probes, diagnose failing servers, and review security posture
- **Zero-config out of the box:** Powered by TunnelFlow's Autonomous Expert Engine with direct access to local database metrics and health checks
- **Optional LLM Providers:** Configure `AI_PROVIDER` and API keys for OpenAI, Anthropic, Groq, or Cloudflare Workers AI in your `.env`

---

## 2. Using with Claude Code, Cursor, and MCP Clients

The MCP server is configured in `.claude/settings.json` and supports stdio and HTTP JSON-RPC 2.0.

### Setup

```bash
cd mcp
npm install
```

### Available Tools (22 Tools)

#### Observability & Diagnostics
- `get_system_diagnostics` — Comprehensive health index, unreachable servers, and conflict detection
- `trigger_health_check` — Run an immediate live health probe on servers and record results
- `analyze_infrastructure` — Autonomous evaluation of single points of failure and routing gaps
- `get_health_checks` — Latency history and status checks for a server
- `get_audit_logs` — Track user modifications, access events, and errors

#### Server Management
- `list_servers` — List managed servers with health status and tunnel associations
- `get_server` — Inspect server details, upstream address, DNS records, and health checks
- `create_server` — Provision and register a new server
- `update_server` — Update upstream, protocol, notes, or status
- `delete_server` — Remove a server and record audit trail

#### Tunnels & Ingress
- `list_tunnels` — See all Cloudflare tunnels and status
- `get_tunnel` — Tunnel details and linked backend servers
- `sync_tunnels` — Update tunnel synchronization heartbeat

#### DNS & Routing
- `list_dns_records` — List all registered DNS records
- `create_dns_record` — Create a DNS CNAME / A record
- `delete_dns_record` — Delete or unregister a DNS record

#### Access Control & Notifications
- `list_users` — List workspace users and roles
- `get_user` — User details and permissions
- `get_user_groups` — Permission groups
- `get_api_keys` — List API keys and granted scopes
- `list_notification_channels` — View Slack, Discord, Telegram, and SMTP channels
- `test_notification_channel` — Verify and test notification channels

---

### Resources (7 Resources)

- `tunnelflow://health-summary` — Real-time server health matrix and uptime percentages
- `tunnelflow://system-diagnostics` — Deep health diagnostics snapshot
- `tunnelflow://audit-stream` — Latest audit trail events
- `tunnelflow://tunnels` — Tunnel status summary
- `tunnelflow://servers` — Server summary
- `tunnelflow://users` — User and access level summary
- `tunnelflow://dashboard` — High-level system overview

---

### Prompts (4 Prompts)

- `diagnose_server_outage` — Root cause analysis of failing server health checks
- `security_audit` — Audit user access levels, unproxied DNS origins, and API keys
- `cloudflare_tunnel_setup` — Step-by-step guidance for configuring ingress rules and DNS
- `optimize_routing` — Routing optimization and high-availability suggestions

---

## 3. Remote HTTP MCP Endpoint (`/api/mcp`)

TunnelFlow also exposes an HTTP JSON-RPC 2.0 MCP endpoint:
- **URL:** `POST http://localhost:3000/api/mcp`
- **Authentication:** Standard session cookie or `Authorization: Bearer <tfk_api_key>`
- Supports `initialize`, `tools/list`, `tools/call`, `resources/list`, `resources/read`, `prompts/list`

---

## 4. Standalone CLI Agent

Run diagnostics from the command line:

```bash
node scripts/ai-agent.js "Diagnose all servers"
```
