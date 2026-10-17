# TunnelFlow MCP Server & AI Agent

The Model Context Protocol (MCP) server for TunnelFlow exposes comprehensive database querying, live health probe execution, server lifecycle management, and prompt engineering tools to Claude Code, Cursor, Windsurf, and custom AI agents.

## Installation

```bash
cd mcp
npm install
```

## Running the Server

### Stdio Transport (Local AI Agents, Claude Code, Cursor)

```bash
DATABASE_URL="file:/data/tunnel-manager.db" node index.js
```

### Supported Capabilities

- **Tools (22 Tools):** Observability, live health checks, server CRUD, DNS management, tunnel sync, audit logs, notification testing.
- **Resources (7 Resources):** `tunnelflow://health-summary`, `tunnelflow://system-diagnostics`, `tunnelflow://audit-stream`, `tunnelflow://tunnels`, `tunnelflow://servers`, `tunnelflow://users`, `tunnelflow://dashboard`.
- **Prompts (4 Prompts):** `diagnose_server_outage`, `security_audit`, `cloudflare_tunnel_setup`, `optimize_routing`.

## HTTP MCP Endpoint

TunnelFlow also supports MCP over HTTP JSON-RPC 2.0 at `/api/mcp`.
Authenticated via session or Bearer API key (`tfk_...`).
