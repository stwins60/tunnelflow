#!/usr/bin/env node
/**
 * Production startup script.
 * Database schema is initialised automatically on first connection in src/lib/db.ts.
 */

const { execSync } = require('child_process')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

function run(cmd) {
  console.log(`[startup] ${cmd}`)
  execSync(cmd, { stdio: 'inherit', cwd: ROOT })
}

// Validate required env vars
const required = ['DATABASE_URL', 'ENCRYPTION_KEY', 'SESSION_SECRET']
const missing = required.filter((k) => !process.env[k])
if (missing.length > 0) {
  console.error(`[startup] Missing required environment variables: ${missing.join(', ')}`)
  console.error('[startup] See .env.example for documentation')
  process.exit(1)
}

// Warn about weak secrets
if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length < 32) {
  console.warn('[startup] WARNING: ENCRYPTION_KEY should be at least 32 characters for security')
}

// Start Next.js server (db schema is auto-created on first request via src/lib/db.ts)
const port = process.env.PORT ?? 3000
run(`node node_modules/.bin/next start -p ${port}`)
