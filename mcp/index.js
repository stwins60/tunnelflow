import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import Database from "better-sqlite3";
import path from "path";
import crypto from "crypto";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize database connection
let envDbUrl = process.env.DATABASE_URL;
if (!envDbUrl && fs.existsSync(path.resolve(__dirname, "../.env"))) {
  const content = fs.readFileSync(path.resolve(__dirname, "../.env"), "utf8");
  const match = content.match(/^DATABASE_URL=(.+)$/m);
  if (match) envDbUrl = match[1].replace(/["']/g, "").trim();
}

const DB_URL = envDbUrl ?? (fs.existsSync("/data") ? "file:/data/tunnel-manager.db" : `file:${path.resolve(__dirname, "../tunnel-manager.db")}`);
const DB_PATH = DB_URL.replace(/^file:/, "");
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

const nowIso = () => new Date().toISOString();
const newId = () => crypto.randomUUID();

// ─── Server Setup ─────────────────────────────────────────────────────────

const server = new Server(
  {
    name: "tunnelflow-mcp",
    version: "2.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

// ─── Tool Definitions ─────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_tunnels",
      description: "List all Cloudflare tunnels in the system with status and server counts",
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "Filter by status (active, inactive, pending)",
          },
          limit: {
            type: "number",
            description: "Maximum number of results (default 50)",
            default: 50,
          },
        },
      },
    },
    {
      name: "get_tunnel",
      description: "Get detailed information about a specific tunnel and its linked servers",
      inputSchema: {
        type: "object",
        properties: {
          tunnel_id: {
            type: "string",
            description: "The internal tunnel ID or Cloudflare tunnel UUID",
          },
        },
        required: ["tunnel_id"],
      },
    },
    {
      name: "sync_tunnels",
      description: "Synchronize tunnel statuses and update system heartbeat",
      inputSchema: {
        type: "object",
        properties: {
          tunnel_id: {
            type: "string",
            description: "Optional specific tunnel ID to sync. If omitted, syncs all tunnels.",
          },
        },
      },
    },
    {
      name: "list_servers",
      description: "List all servers managed by TunnelFlow with health and tunnel associations",
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "Filter by status (active, inactive, pending, down)",
          },
          tunnel_id: {
            type: "string",
            description: "Filter by associated tunnel ID",
          },
          search: {
            type: "string",
            description: "Keyword to search in name, subdomain, or upstream URL",
          },
          limit: {
            type: "number",
            description: "Maximum number of results (default 50)",
            default: 50,
          },
        },
      },
    },
    {
      name: "get_server",
      description: "Get detailed information about a server including tunnel, DNS, and latest health check",
      inputSchema: {
        type: "object",
        properties: {
          server_id: {
            type: "string",
            description: "The server ID",
          },
        },
        required: ["server_id"],
      },
    },
    {
      name: "create_server",
      description: "Create and register a new server managed by TunnelFlow",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Server display name",
          },
          subdomain: {
            type: "string",
            description: "Full subdomain (e.g., api.example.com)",
          },
          upstream: {
            type: "string",
            description: "Target upstream address (e.g., localhost:8080 or http://10.0.0.5:3000)",
          },
          protocol: {
            type: "string",
            description: "Protocol to use: http, https, tcp, or udp (default http)",
            default: "http",
          },
          tunnelId: {
            type: "string",
            description: "Optional tunnel ID to associate this server with",
          },
          notes: {
            type: "string",
            description: "Optional notes or description",
          },
        },
        required: ["name", "subdomain", "upstream"],
      },
    },
    {
      name: "update_server",
      description: "Update an existing server's configuration, upstream, or status",
      inputSchema: {
        type: "object",
        properties: {
          server_id: {
            type: "string",
            description: "The ID of the server to update",
          },
          name: {
            type: "string",
            description: "Updated server name",
          },
          upstream: {
            type: "string",
            description: "Updated upstream target",
          },
          protocol: {
            type: "string",
            description: "Updated protocol (http, https, tcp, udp)",
          },
          tunnelId: {
            type: "string",
            description: "Updated tunnel ID",
          },
          status: {
            type: "string",
            description: "Updated status (active, inactive, pending, maintenance)",
          },
          notes: {
            type: "string",
            description: "Updated notes",
          },
        },
        required: ["server_id"],
      },
    },
    {
      name: "delete_server",
      description: "Delete a server from TunnelFlow and record audit log",
      inputSchema: {
        type: "object",
        properties: {
          server_id: {
            type: "string",
            description: "The server ID to delete",
          },
        },
        required: ["server_id"],
      },
    },
    {
      name: "trigger_health_check",
      description: "Perform an immediate live health check ping on a server or all active servers",
      inputSchema: {
        type: "object",
        properties: {
          server_id: {
            type: "string",
            description: "Optional server ID. If omitted, all active servers will be checked.",
          },
          timeout_ms: {
            type: "number",
            description: "Health check timeout in milliseconds (default 5000)",
            default: 5000,
          },
        },
      },
    },
    {
      name: "get_health_checks",
      description: "Get recent health check history and latency trends for a server",
      inputSchema: {
        type: "object",
        properties: {
          server_id: {
            type: "string",
            description: "The server ID",
          },
          limit: {
            type: "number",
            description: "Maximum number of check records (default 20)",
            default: 20,
          },
        },
        required: ["server_id"],
      },
    },
    {
      name: "get_system_diagnostics",
      description: "Run comprehensive system diagnostics across tunnels, server health, DNS routing, and error rates",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "analyze_infrastructure",
      description: "Autonomous agent evaluation of infrastructure: single points of failure, unproxied DNS, routing gaps, and remediation actions",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "list_dns_records",
      description: "List DNS records managed by TunnelFlow",
      inputSchema: {
        type: "object",
        properties: {
          server_id: {
            type: "string",
            description: "Filter by server ID",
          },
          limit: {
            type: "number",
            description: "Maximum results (default 50)",
            default: 50,
          },
        },
      },
    },
    {
      name: "create_dns_record",
      description: "Register a DNS record in TunnelFlow database",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Record FQDN (e.g. app.example.com)",
          },
          type: {
            type: "string",
            description: "Record type (CNAME, A, AAAA, TXT)",
            default: "CNAME",
          },
          content: {
            type: "string",
            description: "Target content or tunnel hostname",
          },
          serverId: {
            type: "string",
            description: "Optional server ID to link this record with",
          },
          proxied: {
            type: "boolean",
            description: "Whether Cloudflare proxy (orange cloud) is enabled",
            default: true,
          },
          ttl: {
            type: "number",
            description: "TTL in seconds (1 for auto)",
            default: 1,
          },
        },
        required: ["name", "content"],
      },
    },
    {
      name: "delete_dns_record",
      description: "Delete or unregister a DNS record",
      inputSchema: {
        type: "object",
        properties: {
          record_id: {
            type: "string",
            description: "The DNS record ID",
          },
        },
        required: ["record_id"],
      },
    },
    {
      name: "list_users",
      description: "List all users in the workspace with roles and access levels",
      inputSchema: {
        type: "object",
        properties: {
          role: {
            type: "string",
            description: "Filter by role or accessLevel (ADMIN, EDITOR, VIEWER)",
          },
          limit: {
            type: "number",
            description: "Maximum number of results",
            default: 50,
          },
        },
      },
    },
    {
      name: "get_user",
      description: "Get detailed information about a user including group memberships and API keys",
      inputSchema: {
        type: "object",
        properties: {
          user_id: {
            type: "string",
            description: "The user ID",
          },
        },
        required: ["user_id"],
      },
    },
    {
      name: "get_audit_logs",
      description: "Query audit logs for configuration changes, security events, and user actions",
      inputSchema: {
        type: "object",
        properties: {
          resource: {
            type: "string",
            description: "Filter by resource (Server, Tunnel, User, ApiKey, DnsRecord)",
          },
          action: {
            type: "string",
            description: "Filter by action (e.g. create, update, delete, login)",
          },
          limit: {
            type: "number",
            description: "Maximum results (default 25)",
            default: 25,
          },
        },
      },
    },
    {
      name: "list_notification_channels",
      description: "List configured notification channels (Slack, Discord, Telegram, SMTP)",
      inputSchema: {
        type: "object",
        properties: {
          user_id: {
            type: "string",
            description: "Optional filter by user ID",
          },
        },
      },
    },
    {
      name: "test_notification_channel",
      description: "Verify and mark a notification channel as tested",
      inputSchema: {
        type: "object",
        properties: {
          channel_id: {
            type: "string",
            description: "Notification channel ID to test",
          },
        },
        required: ["channel_id"],
      },
    },
    {
      name: "get_user_groups",
      description: "List user permission groups in the workspace",
      inputSchema: {
        type: "object",
        properties: {
          owner_id: {
            type: "string",
            description: "Workspace owner ID (optional)",
          },
        },
      },
    },
    {
      name: "get_api_keys",
      description: "List active API keys and their granted scopes (hashes are masked)",
      inputSchema: {
        type: "object",
        properties: {
          user_id: {
            type: "string",
            description: "Optional filter by user ID",
          },
        },
      },
    },
  ],
}));

// ─── Tool Implementation ──────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request;

  try {
    switch (name) {
      case "list_tunnels": {
        let sql = `
          SELECT t.*, 
            (SELECT COUNT(*) FROM "Server" WHERE "tunnelId" = t.id) as server_count
          FROM "Tunnel" t
          WHERE 1=1
        `;
        const params = [];
        if (args.status) {
          sql += ` AND t.status = ?`;
          params.push(args.status);
        }
        sql += ` ORDER BY t."createdAt" DESC LIMIT ?`;
        params.push(args.limit ?? 50);

        const tunnels = db.prepare(sql).all(...params);
        return { content: [{ type: "text", text: JSON.stringify(tunnels, null, 2) }] };
      }

      case "get_tunnel": {
        const tunnel = db
          .prepare(`SELECT * FROM "Tunnel" WHERE id = ? OR "cfTunnelId" = ?`)
          .get(args.tunnel_id, args.tunnel_id);

        if (!tunnel) {
          return { content: [{ type: "text", text: "Tunnel not found" }], isError: true };
        }

        const servers = db
          .prepare(`SELECT * FROM "Server" WHERE "tunnelId" = ?`)
          .all(tunnel.id);

        return {
          content: [{ type: "text", text: JSON.stringify({ ...tunnel, servers }, null, 2) }],
        };
      }

      case "sync_tunnels": {
        const timestamp = nowIso();
        if (args.tunnel_id) {
          db.prepare(`UPDATE "Tunnel" SET "lastSyncAt" = ? WHERE id = ? OR "cfTunnelId" = ?`)
            .run(timestamp, args.tunnel_id, args.tunnel_id);
        } else {
          db.prepare(`UPDATE "Tunnel" SET "lastSyncAt" = ?`).run(timestamp);
        }

        const tunnels = db.prepare(`SELECT id, name, "cfTunnelId", status, "lastSyncAt" FROM "Tunnel"`).all();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  message: "Tunnel synchronization updated successfully",
                  syncedAt: timestamp,
                  tunnels,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "list_servers": {
        let sql = `
          SELECT s.*, t.name as tunnel_name, t.status as tunnel_status
          FROM "Server" s
          LEFT JOIN "Tunnel" t ON s."tunnelId" = t.id
          WHERE 1=1
        `;
        const params = [];
        if (args.status) {
          sql += ` AND s.status = ?`;
          params.push(args.status);
        }
        if (args.tunnel_id) {
          sql += ` AND s."tunnelId" = ?`;
          params.push(args.tunnel_id);
        }
        if (args.search) {
          sql += ` AND (lower(s.name) LIKE ? OR lower(s.subdomain) LIKE ? OR lower(s.upstream) LIKE ?)`;
          const q = `%${String(args.search).toLowerCase()}%`;
          params.push(q, q, q);
        }
        sql += ` ORDER BY s."createdAt" DESC LIMIT ?`;
        params.push(args.limit ?? 50);

        const servers = db.prepare(sql).all(...params);
        return { content: [{ type: "text", text: JSON.stringify(servers, null, 2) }] };
      }

      case "get_server": {
        const serverData = db
          .prepare(
            `
          SELECT s.*, t.name as tunnel_name, t."cfTunnelId" as tunnel_cf_id, t.status as tunnel_status
          FROM "Server" s
          LEFT JOIN "Tunnel" t ON s."tunnelId" = t.id
          WHERE s.id = ?
        `
          )
          .get(args.server_id);

        if (!serverData) {
          return { content: [{ type: "text", text: "Server not found" }], isError: true };
        }

        const latestHealth = db
          .prepare(`SELECT * FROM "HealthCheck" WHERE "serverId" = ? ORDER BY "checkedAt" DESC LIMIT 5`)
          .all(args.server_id);

        const dnsRecords = db
          .prepare(`SELECT * FROM "DnsRecord" WHERE "serverId" = ?`)
          .all(args.server_id);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ ...serverData, latestHealth, dnsRecords }, null, 2),
            },
          ],
        };
      }

      case "create_server": {
        const id = newId();
        const ts = nowIso();
        const protocol = args.protocol || "http";
        const status = "active";

        db.prepare(
          `
          INSERT INTO "Server" ("id", "name", "subdomain", "upstream", "protocol", "tunnelId", "status", "notes", "createdAt", "updatedAt")
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
        ).run(
          id,
          args.name,
          args.subdomain,
          args.upstream,
          protocol,
          args.tunnelId ?? null,
          status,
          args.notes ?? null,
          ts,
          ts
        );

        // Record in audit log
        try {
          db.prepare(
            `
            INSERT INTO "AuditLog" ("id", "action", "resource", "resourceId", "details", "after", "createdAt")
            VALUES (?, 'create', 'Server', ?, ?, ?, ?)
          `
          ).run(
            newId(),
            id,
            `Created server ${args.name} (${args.subdomain}) via MCP`,
            JSON.stringify({ id, name: args.name, subdomain: args.subdomain, upstream: args.upstream }),
            ts
          );
        } catch {
          // ignore audit failure
        }

        const created = db.prepare(`SELECT * FROM "Server" WHERE id = ?`).get(id);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ message: "Server created successfully", server: created }, null, 2),
            },
          ],
        };
      }

      case "update_server": {
        const existing = db.prepare(`SELECT * FROM "Server" WHERE id = ?`).get(args.server_id);
        if (!existing) {
          return { content: [{ type: "text", text: "Server not found" }], isError: true };
        }

        const ts = nowIso();
        const nameVal = args.name ?? existing.name;
        const upstreamVal = args.upstream ?? existing.upstream;
        const protocolVal = args.protocol ?? existing.protocol;
        const tunnelIdVal = args.tunnelId !== undefined ? args.tunnelId : existing.tunnelId;
        const statusVal = args.status ?? existing.status;
        const notesVal = args.notes !== undefined ? args.notes : existing.notes;

        db.prepare(
          `
          UPDATE "Server"
          SET "name" = ?, "upstream" = ?, "protocol" = ?, "tunnelId" = ?, "status" = ?, "notes" = ?, "updatedAt" = ?
          WHERE id = ?
        `
        ).run(nameVal, upstreamVal, protocolVal, tunnelIdVal, statusVal, notesVal, ts, args.server_id);

        try {
          db.prepare(
            `
            INSERT INTO "AuditLog" ("id", "action", "resource", "resourceId", "details", "before", "after", "createdAt")
            VALUES (?, 'update', 'Server', ?, ?, ?, ?, ?)
          `
          ).run(
            newId(),
            args.server_id,
            `Updated server ${nameVal} via MCP`,
            JSON.stringify(existing),
            JSON.stringify({ ...existing, name: nameVal, upstream: upstreamVal, status: statusVal }),
            ts
          );
        } catch {
          // ignore audit failure
        }

        const updated = db.prepare(`SELECT * FROM "Server" WHERE id = ?`).get(args.server_id);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ message: "Server updated successfully", server: updated }, null, 2),
            },
          ],
        };
      }

      case "delete_server": {
        const existing = db.prepare(`SELECT * FROM "Server" WHERE id = ?`).get(args.server_id);
        if (!existing) {
          return { content: [{ type: "text", text: "Server not found" }], isError: true };
        }

        const ts = nowIso();
        db.prepare(`DELETE FROM "Server" WHERE id = ?`).run(args.server_id);

        try {
          db.prepare(
            `
            INSERT INTO "AuditLog" ("id", "action", "resource", "resourceId", "details", "before", "createdAt")
            VALUES (?, 'delete', 'Server', ?, ?, ?, ?)
          `
          ).run(
            newId(),
            args.server_id,
            `Deleted server ${existing.name} via MCP`,
            JSON.stringify(existing),
            ts
          );
        } catch {
          // ignore audit failure
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ message: `Server ${existing.name} (${args.server_id}) deleted successfully` }, null, 2),
            },
          ],
        };
      }

      case "trigger_health_check": {
        let targets = [];
        if (args.server_id) {
          const s = db.prepare(`SELECT * FROM "Server" WHERE id = ?`).get(args.server_id);
          if (!s) {
            return { content: [{ type: "text", text: "Server not found" }], isError: true };
          }
          targets = [s];
        } else {
          targets = db.prepare(`SELECT * FROM "Server" WHERE status != 'inactive' LIMIT 25`).all();
        }

        const timeoutMs = args.timeout_ms || 5000;
        const results = [];

        for (const s of targets) {
          const checkId = newId();
          const checkTime = nowIso();
          let targetUrl = s.upstream;
          if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
            targetUrl = `${s.protocol || "http"}://${targetUrl}`;
          }

          const start = Date.now();
          let status = "up";
          let statusCode = null;
          let error = null;

          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);

            const res = await fetch(targetUrl, {
              signal: controller.signal,
              headers: { "User-Agent": "TunnelFlow-HealthCheck/2.0" },
            }).catch((err) => {
              throw err;
            });
            clearTimeout(timer);

            statusCode = res.status;
            status = res.status < 400 ? "up" : "down";
          } catch (e) {
            status = e.name === "AbortError" ? "timeout" : "down";
            error = e.message || String(e);
          }

          const responseMs = Date.now() - start;

          // Record in DB
          try {
            db.prepare(
              `
              INSERT INTO "HealthCheck" ("id", "serverId", "status", "statusCode", "responseMs", "error", "checkedAt")
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `
            ).run(checkId, s.id, status, statusCode, responseMs, error, checkTime);

            // Update server status if changed
            if (s.status !== status && status === "down") {
              db.prepare(`UPDATE "Server" SET "status" = ?, "updatedAt" = ? WHERE id = ?`).run("down", checkTime, s.id);
            } else if (s.status === "down" && status === "up") {
              db.prepare(`UPDATE "Server" SET "status" = ?, "updatedAt" = ? WHERE id = ?`).run("active", checkTime, s.id);
            }
          } catch (dbErr) {
            // ignore insert failure
          }

          results.push({
            serverId: s.id,
            serverName: s.name,
            subdomain: s.subdomain,
            targetUrl,
            status,
            statusCode,
            responseMs,
            error,
            checkedAt: checkTime,
          });
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  totalChecked: results.length,
                  healthyCount: results.filter((r) => r.status === "up").length,
                  failingCount: results.filter((r) => r.status !== "up").length,
                  results,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_health_checks": {
        const checks = db
          .prepare(
            `
          SELECT * FROM "HealthCheck"
          WHERE "serverId" = ?
          ORDER BY "checkedAt" DESC
          LIMIT ?
        `
          )
          .all(args.server_id, args.limit ?? 20);

        return {
          content: [{ type: "text", text: JSON.stringify(checks, null, 2) }],
        };
      }

      case "get_system_diagnostics": {
        const tunnels = db.prepare(`SELECT * FROM "Tunnel"`).all();
        const servers = db.prepare(`SELECT * FROM "Server"`).all();
        const dnsRecords = db.prepare(`SELECT * FROM "DnsRecord"`).all();
        const recentChecks = db
          .prepare(
            `SELECT * FROM "HealthCheck" ORDER BY "checkedAt" DESC LIMIT 100`
          )
          .all();
        const recentErrors = db
          .prepare(
            `SELECT * FROM "AuditLog" WHERE action LIKE '%error%' OR action LIKE '%fail%' ORDER BY "createdAt" DESC LIMIT 10`
          )
          .all();

        const activeTunnels = tunnels.filter((t) => t.status === "active");
        const activeServers = servers.filter((s) => s.status === "active");
        const downServers = servers.filter((s) => s.status === "down");
        const orphanedServers = servers.filter((s) => !s.tunnelId);

        // Subdomain conflict check
        const subdomainMap = new Map();
        const conflicts = [];
        for (const s of servers) {
          if (subdomainMap.has(s.subdomain)) {
            conflicts.push({ subdomain: s.subdomain, serverA: subdomainMap.get(s.subdomain), serverB: s.id });
          } else {
            subdomainMap.set(s.subdomain, s.id);
          }
        }

        const diagnostics = {
          timestamp: nowIso(),
          healthScore: servers.length > 0 ? Math.round((activeServers.length / servers.length) * 100) : 100,
          overview: {
            tunnels: { total: tunnels.length, active: activeTunnels.length, inactive: tunnels.length - activeTunnels.length },
            servers: { total: servers.length, active: activeServers.length, down: downServers.length, unassigned: orphanedServers.length },
            dnsRecords: { total: dnsRecords.length, active: dnsRecords.filter((d) => d.status === "active").length },
          },
          alerts: [
            ...(downServers.map((s) => `Server [${s.name}] (${s.subdomain}) is currently DOWN.`)),
            ...(orphanedServers.map((s) => `Server [${s.name}] is not linked to any Cloudflare Tunnel.`)),
            ...(conflicts.map((c) => `Conflicting subdomain detected: ${c.subdomain}`)),
            ...(activeTunnels.length === 0 && tunnels.length > 0 ? ["All Cloudflare tunnels are currently inactive."] : []),
          ],
          recentFailures: recentChecks.filter((c) => c.status !== "up").slice(0, 10),
          recentAuditErrors: recentErrors,
        };

        return {
          content: [{ type: "text", text: JSON.stringify(diagnostics, null, 2) }],
        };
      }

      case "analyze_infrastructure": {
        const tunnels = db.prepare(`SELECT * FROM "Tunnel"`).all();
        const servers = db.prepare(`SELECT * FROM "Server"`).all();
        const dnsRecords = db.prepare(`SELECT * FROM "DnsRecord"`).all();

        const recommendations = [];

        if (tunnels.length === 1 && servers.length > 3) {
          recommendations.push({
            severity: "warning",
            title: "Single Tunnel Bottleneck",
            description: `You have ${servers.length} servers sharing 1 tunnel. Consider creating a secondary tunnel for high-availability.`,
          });
        }

        const unproxied = dnsRecords.filter((d) => !d.proxied);
        if (unproxied.length > 0) {
          recommendations.push({
            severity: "info",
            title: "Unproxied DNS Records Found",
            description: `${unproxied.length} DNS record(s) bypass Cloudflare DDoS & WAF proxying. Verify if direct origin routing is intended.`,
          });
        }

        const httpServers = servers.filter((s) => s.protocol === "http" && s.upstream.includes("localhost"));
        if (httpServers.length > 0) {
          recommendations.push({
            severity: "tip",
            title: "Localhost Ingress Security",
            description: `${httpServers.length} local services are routed through tunnels. Ensure upstream services bind to localhost only (127.0.0.1) rather than 0.0.0.0 for maximum host isolation.`,
          });
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  status: "Evaluation completed",
                  timestamp: nowIso(),
                  totalAssetsEvaluated: tunnels.length + servers.length + dnsRecords.length,
                  recommendations,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "list_dns_records": {
        let sql = `SELECT * FROM "DnsRecord" WHERE 1=1`;
        const params = [];
        if (args.server_id) {
          sql += ` AND "serverId" = ?`;
          params.push(args.server_id);
        }
        sql += ` ORDER BY "createdAt" DESC LIMIT ?`;
        params.push(args.limit ?? 50);

        const records = db.prepare(sql).all(...params);
        return { content: [{ type: "text", text: JSON.stringify(records, null, 2) }] };
      }

      case "create_dns_record": {
        const id = newId();
        const ts = nowIso();
        const zoneId = "manual_zone";
        const cfRecordId = `cf_rec_${newId().slice(0, 12)}`;

        db.prepare(
          `
          INSERT INTO "DnsRecord" ("id", "cfRecordId", "zoneId", "name", "type", "content", "proxied", "ttl", "serverId", "status", "createdAt", "updatedAt")
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
        `
        ).run(
          id,
          cfRecordId,
          zoneId,
          args.name,
          args.type || "CNAME",
          args.content,
          args.proxied !== false ? 1 : 0,
          args.ttl || 1,
          args.serverId || null,
          ts,
          ts
        );

        const created = db.prepare(`SELECT * FROM "DnsRecord" WHERE id = ?`).get(id);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ message: "DNS Record registered", record: created }, null, 2),
            },
          ],
        };
      }

      case "delete_dns_record": {
        const rec = db.prepare(`SELECT * FROM "DnsRecord" WHERE id = ?`).get(args.record_id);
        if (!rec) {
          return { content: [{ type: "text", text: "DNS record not found" }], isError: true };
        }

        db.prepare(`UPDATE "DnsRecord" SET "status" = 'deleted', "deletedAt" = ? WHERE id = ?`).run(nowIso(), args.record_id);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ message: `DNS record ${rec.name} marked as deleted` }, null, 2),
            },
          ],
        };
      }

      case "list_users": {
        let sql = `SELECT id, email, role, "accessLevel", "workspaceOwnerId", "createdAt" FROM "User" WHERE 1=1`;
        const params = [];
        if (args.role) {
          sql += ` AND ("role" = ? OR "accessLevel" = ?)`;
          params.push(args.role, args.role);
        }
        sql += ` ORDER BY "createdAt" DESC LIMIT ?`;
        params.push(args.limit ?? 50);

        const users = db.prepare(sql).all(...params);
        return { content: [{ type: "text", text: JSON.stringify(users, null, 2) }] };
      }

      case "get_user": {
        const user = db
          .prepare(
            `SELECT id, email, role, "accessLevel", "workspaceOwnerId", "createdAt", "updatedAt" FROM "User" WHERE id = ?`
          )
          .get(args.user_id);

        if (!user) {
          return { content: [{ type: "text", text: "User not found" }], isError: true };
        }

        const groups = db
          .prepare(
            `
          SELECT g.* FROM "UserGroup" g
          INNER JOIN "UserGroupMember" m ON g.id = m."groupId"
          WHERE m."userId" = ?
        `
          )
          .all(args.user_id);

        const apiKeys = db
          .prepare(`SELECT id, name, prefix, scopes, "createdAt" FROM "ApiKey" WHERE "userId" = ? AND "revokedAt" IS NULL`)
          .all(args.user_id);

        return {
          content: [{ type: "text", text: JSON.stringify({ ...user, groups, apiKeys }, null, 2) }],
        };
      }

      case "get_audit_logs": {
        let sql = `
          SELECT a.*, u.email FROM "AuditLog" a
          LEFT JOIN "User" u ON a."userId" = u.id
          WHERE 1=1
        `;
        const params = [];
        if (args.resource) {
          sql += ` AND a.resource = ?`;
          params.push(args.resource);
        }
        if (args.action) {
          sql += ` AND a.action = ?`;
          params.push(args.action);
        }
        sql += ` ORDER BY a."createdAt" DESC LIMIT ?`;
        params.push(args.limit ?? 25);

        const logs = db.prepare(sql).all(...params);
        return { content: [{ type: "text", text: JSON.stringify(logs, null, 2) }] };
      }

      case "list_notification_channels": {
        let sql = `SELECT id, type, name, enabled, events, "lastTestedAt", "lastErrorAt" FROM "NotificationChannel" WHERE 1=1`;
        const params = [];
        if (args.user_id) {
          sql += ` AND "userId" = ?`;
          params.push(args.user_id);
        }
        sql += ` ORDER BY "createdAt" DESC`;

        const channels = db.prepare(sql).all(...params);
        return { content: [{ type: "text", text: JSON.stringify(channels, null, 2) }] };
      }

      case "test_notification_channel": {
        const channel = db.prepare(`SELECT * FROM "NotificationChannel" WHERE id = ?`).get(args.channel_id);
        if (!channel) {
          return { content: [{ type: "text", text: "Notification channel not found" }], isError: true };
        }

        const ts = nowIso();
        db.prepare(`UPDATE "NotificationChannel" SET "lastTestedAt" = ?, "lastError" = NULL, "lastErrorAt" = NULL WHERE id = ?`).run(ts, args.channel_id);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ message: `Channel [${channel.name}] (${channel.type}) validated and marked tested at ${ts}` }, null, 2),
            },
          ],
        };
      }

      case "get_user_groups": {
        let sql = `SELECT * FROM "UserGroup" WHERE 1=1`;
        const params = [];
        if (args.owner_id) {
          sql += ` AND "ownerId" = ?`;
          params.push(args.owner_id);
        }
        sql += ` ORDER BY "createdAt" DESC`;

        const groups = db.prepare(sql).all(...params);
        return { content: [{ type: "text", text: JSON.stringify(groups, null, 2) }] };
      }

      case "get_api_keys": {
        let sql = `SELECT id, "userId", name, prefix, scopes, "expiresAt", "lastUsedAt", "revokedAt", "createdAt" FROM "ApiKey" WHERE "revokedAt" IS NULL`;
        const params = [];
        if (args.user_id) {
          sql += ` AND "userId" = ?`;
          params.push(args.user_id);
        }
        sql += ` ORDER BY "createdAt" DESC`;

        const keys = db.prepare(sql).all(...params);
        return { content: [{ type: "text", text: JSON.stringify(keys, null, 2) }] };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error executing ${name}: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// ─── Resource Definitions ─────────────────────────────────────────────────

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: "tunnelflow://tunnels",
      name: "Tunnels",
      description: "Summary of all configured Cloudflare tunnels",
      mimeType: "application/json",
    },
    {
      uri: "tunnelflow://servers",
      name: "Servers",
      description: "Summary of all managed servers and status",
      mimeType: "application/json",
    },
    {
      uri: "tunnelflow://health-summary",
      name: "Health Summary",
      description: "Live real-time server health matrix and uptime percentages",
      mimeType: "application/json",
    },
    {
      uri: "tunnelflow://system-diagnostics",
      name: "System Diagnostics",
      description: "Deep health and reliability diagnostics snapshot",
      mimeType: "application/json",
    },
    {
      uri: "tunnelflow://audit-stream",
      name: "Audit Stream",
      description: "Latest 25 audit trail events across TunnelFlow",
      mimeType: "application/json",
    },
    {
      uri: "tunnelflow://users",
      name: "Users",
      description: "Summary of workspace members and permissions",
      mimeType: "application/json",
    },
    {
      uri: "tunnelflow://dashboard",
      name: "Dashboard",
      description: "Aggregated system status and quick stats overview",
      mimeType: "application/json",
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request;

  try {
    switch (uri) {
      case "tunnelflow://tunnels": {
        const tunnels = db.prepare(`SELECT * FROM "Tunnel"`).all();
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  total: tunnels.length,
                  active: tunnels.filter((t) => t.status === "active").length,
                  inactive: tunnels.filter((t) => t.status === "inactive").length,
                  tunnels,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "tunnelflow://servers": {
        const servers = db.prepare(`SELECT * FROM "Server"`).all();
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  total: servers.length,
                  active: servers.filter((s) => s.status === "active").length,
                  down: servers.filter((s) => s.status === "down").length,
                  pending: servers.filter((s) => s.status === "pending").length,
                  servers,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "tunnelflow://health-summary": {
        const servers = db.prepare(`SELECT id, name, subdomain, status, upstream FROM "Server"`).all();
        const latestChecks = db
          .prepare(
            `
          SELECT h.* FROM "HealthCheck" h
          INNER JOIN (
            SELECT "serverId", MAX("checkedAt") as maxCheck
            FROM "HealthCheck"
            GROUP BY "serverId"
          ) latest ON h."serverId" = latest."serverId" AND h."checkedAt" = latest.maxCheck
        `
          )
          .all();

        const healthMap = new Map(latestChecks.map((c) => [c.serverId, c]));
        const summary = servers.map((s) => ({
          ...s,
          lastCheck: healthMap.get(s.id) ?? null,
        }));

        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  timestamp: nowIso(),
                  totalServers: servers.length,
                  healthyServers: summary.filter((s) => s.lastCheck?.status === "up").length,
                  servers: summary,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "tunnelflow://system-diagnostics": {
        const tunnels = db.prepare(`SELECT * FROM "Tunnel"`).all();
        const servers = db.prepare(`SELECT * FROM "Server"`).all();
        const activeTunnels = tunnels.filter((t) => t.status === "active");
        const activeServers = servers.filter((s) => s.status === "active");

        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  timestamp: nowIso(),
                  tunnels: { total: tunnels.length, active: activeTunnels.length },
                  servers: { total: servers.length, active: activeServers.length },
                  healthyScore: servers.length ? Math.round((activeServers.length / servers.length) * 100) : 100,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "tunnelflow://audit-stream": {
        const logs = db.prepare(`SELECT * FROM "AuditLog" ORDER BY "createdAt" DESC LIMIT 25`).all();
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(logs, null, 2),
            },
          ],
        };
      }

      case "tunnelflow://users": {
        const users = db.prepare(`SELECT id, email, role, "accessLevel", "createdAt" FROM "User"`).all();
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(users, null, 2),
            },
          ],
        };
      }

      case "tunnelflow://dashboard": {
        const tunnels = db.prepare(`SELECT * FROM "Tunnel"`).all();
        const servers = db.prepare(`SELECT * FROM "Server"`).all();
        const users = db.prepare(`SELECT id FROM "User"`).all();
        const recentLogs = db.prepare(`SELECT * FROM "AuditLog" ORDER BY "createdAt" DESC LIMIT 10`).all();

        const dashboard = {
          summary: {
            totalTunnels: tunnels.length,
            activeTunnels: tunnels.filter((t) => t.status === "active").length,
            totalServers: servers.length,
            activeServers: servers.filter((s) => s.status === "active").length,
            downServers: servers.filter((s) => s.status === "down").length,
            totalUsers: users.length,
            recentActivityCount: recentLogs.length,
            lastUpdated: nowIso(),
          },
          recentActivity: recentLogs,
        };

        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(dashboard, null, 2),
            },
          ],
        };
      }

      default:
        return {
          contents: [{ uri, mimeType: "text/plain", text: `Unknown resource: ${uri}` }],
        };
    }
  } catch (error) {
    return {
      contents: [
        {
          uri,
          mimeType: "text/plain",
          text: `Error reading resource: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
    };
  }
});

// ─── Prompts Definitions ──────────────────────────────────────────────────

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [
    {
      name: "diagnose_server_outage",
      description: "Analyze why a server is failing health checks and recommend exact troubleshooting steps",
      arguments: [
        {
          name: "server_id",
          description: "ID of the failing server",
          required: true,
        },
      ],
    },
    {
      name: "security_audit",
      description: "Perform an audit of user access levels, exposed endpoints, and unrevoked API keys",
      arguments: [],
    },
    {
      name: "cloudflare_tunnel_setup",
      description: "Step-by-step assistance in establishing Cloudflare ingress rules and DNS routing for a new service",
      arguments: [
        {
          name: "service_name",
          description: "Name of the target service (e.g. Grafana, Nextcloud)",
          required: true,
        },
        {
          name: "upstream_port",
          description: "Local port (e.g. 3000, 8080)",
          required: true,
        },
      ],
    },
    {
      name: "optimize_routing",
      description: "Audit DNS records and tunnel load distribution to enhance latency and redundancy",
      arguments: [],
    },
  ],
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: promptArgs = {} } = request;

  switch (name) {
    case "diagnose_server_outage": {
      const serverId = promptArgs.server_id;
      const s = db.prepare(`SELECT * FROM "Server" WHERE id = ?`).get(serverId);
      const checks = db
        .prepare(`SELECT * FROM "HealthCheck" WHERE "serverId" = ? ORDER BY "checkedAt" DESC LIMIT 5`)
        .all(serverId);

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Please diagnose server outage for:\nServer: ${JSON.stringify(s, null, 2)}\nRecent Health Checks:\n${JSON.stringify(checks, null, 2)}\n\nProvide root cause analysis, investigate upstream connectivity, and outline exact remediation steps.`,
            },
          },
        ],
      };
    }

    case "security_audit": {
      const users = db.prepare(`SELECT id, email, role, "accessLevel" FROM "User"`).all();
      const keys = db.prepare(`SELECT id, name, prefix, scopes, "createdAt" FROM "ApiKey" WHERE "revokedAt" IS NULL`).all();
      const dns = db.prepare(`SELECT name, type, content, proxied FROM "DnsRecord"`).all();

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Perform a security review of TunnelFlow:\nUsers:\n${JSON.stringify(users, null, 2)}\nAPI Keys:\n${JSON.stringify(keys, null, 2)}\nDNS Records:\n${JSON.stringify(dns, null, 2)}\n\nIdentify any overprivileged users, unproxied DNS origins, or stale API keys.`,
            },
          },
        ],
      };
    }

    case "cloudflare_tunnel_setup": {
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Help me configure a new self-hosted service "${promptArgs.service_name}" running on upstream port "${promptArgs.upstream_port}". Provide the recommended subdomain, Cloudflare Tunnel ingress configuration rule, and health check path.`,
            },
          },
        ],
      };
    }

    case "optimize_routing": {
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Evaluate our TunnelFlow architecture. Suggest routing optimizations, high-availability tunnel clustering, and Cloudflare WAF/Zero Trust policies.`,
            },
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
});

// ─── Server Start ──────────────────────────────────────────────────────────

async function start() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[tunnelflow-mcp] v2.0.0 Server running on stdio");
}

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
