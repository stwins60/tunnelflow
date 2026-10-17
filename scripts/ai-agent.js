#!/usr/bin/env node
/**
 * TunnelFlow Autonomous AI Infrastructure Agent CLI
 *
 * Usage:
 *   node scripts/ai-agent.js "Diagnose all servers"
 *   node scripts/ai-agent.js --health-check
 *   node scripts/ai-agent.js --security-audit
 */

const Database = require('better-sqlite3')
const fs = require('fs')
const path = require('path')

// Read DATABASE_URL from .env if present and not set
let envDbUrl = process.env.DATABASE_URL
if (!envDbUrl && fs.existsSync(path.resolve(__dirname, '../.env'))) {
  const content = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf8')
  const match = content.match(/^DATABASE_URL=(.+)$/m)
  if (match) envDbUrl = match[1].replace(/["']/g, '').trim()
}

const DB_URL = envDbUrl || (fs.existsSync('/data') ? 'file:/data/tunnel-manager.db' : `file:${path.resolve(__dirname, '../tunnel-manager.db')}`)
const DB_PATH = DB_URL.replace(/^file:/, '')
const dbDir = path.dirname(DB_PATH)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

let db
try {
  db = new Database(DB_PATH)
} catch (e) {
  console.error(`[ai-agent] Failed to open database at ${DB_PATH}:`, e.message)
  process.exit(1)
}

async function runCli() {
  const args = process.argv.slice(2)
  const query = args.join(' ') || 'Diagnose all servers'

  console.log(`\n======================================================`)
  console.log(`🤖 TunnelFlow Autonomous AI Infrastructure Agent`)
  console.log(`======================================================`)
  console.log(`Prompt: "${query}"\n`)

  const tunnels = db.prepare('SELECT * FROM "Tunnel"').all()
  const servers = db.prepare('SELECT * FROM "Server"').all()
  const activeServers = servers.filter((s) => s.status === 'active')
  const downServers = servers.filter((s) => s.status === 'down')
  const dnsRecords = db.prepare('SELECT * FROM "DnsRecord"').all()

  console.log(`📊 System Snapshot:`)
  console.log(`  - Cloudflare Tunnels: ${tunnels.length} configured (${tunnels.filter((t) => t.status === 'active').length} active)`)
  console.log(`  - Managed Servers:    ${servers.length} total (${activeServers.length} up, ${downServers.length} down)`)
  console.log(`  - DNS Records:        ${dnsRecords.length} registered`)
  console.log(``)

  if (downServers.length > 0) {
    console.log(`⚠️  ACTION REQUIRED: ${downServers.length} server(s) are in DEGRADED/DOWN status:`)
    downServers.forEach((s) => {
      console.log(`    - [${s.name}] (${s.subdomain}) -> ${s.upstream}`)
    })
    console.log(``)
  } else {
    console.log(`✅ All servers are healthy and operational.`)
  }

  // Check single point of failure
  if (tunnels.length === 1 && servers.length > 3) {
    console.log(`💡 Recommendation: Single tunnel bottleneck. Consider provisioning a secondary tunnel for high-availability.`)
  }

  const unproxied = dnsRecords.filter((d) => !d.proxied)
  if (unproxied.length > 0) {
    console.log(`🛡️  Security Note: ${unproxied.length} DNS record(s) have proxy disabled (exposing origin IP).`)
  }

  console.log(`\n======================================================\n`)
}

runCli().catch((err) => {
  console.error('[ai-agent] Error:', err)
  process.exit(1)
})
