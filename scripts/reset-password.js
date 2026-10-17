#!/usr/bin/env node
/**
 * CLI script to reset user passwords directly in SQLite.
 * Can be run bare-metal or inside Docker.
 */

const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')
const bcrypt = require('bcryptjs')

// Helper to load .env manually if running bare-metal/local dev
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env')
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8')
    for (const line of content.split('\n')) {
      const match = line.match(/^\s*([\w.\-]+)\s*=\s*(.*)?\s*$/)
      if (match) {
        const key = match[1]
        let value = match[2] || ''
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1)
        } else if (value.startsWith("'") && value.endsWith("'")) {
          value = value.slice(1, -1)
        }
        process.env[key] = value
      }
    }
  }
}

loadEnv()

const args = process.argv.slice(2)
if (args.length < 2) {
  console.log('Usage: node scripts/reset-password.js <email> <new_password>')
  process.exit(1)
}

const email = args[0]
const newPassword = args[1]

if (newPassword.length < 8) {
  console.error('Error: Password must be at least 8 characters long.')
  process.exit(1)
}

const DB_URL = process.env.DATABASE_URL ?? 'file:/data/tunnel-manager.db'
const DB_PATH = DB_URL.replace(/^file:/, '')

if (!fs.existsSync(DB_PATH)) {
  console.error(`Error: Database file not found at ${DB_PATH}`)
  process.exit(1)
}

let db
try {
  db = new Database(DB_PATH)
} catch (err) {
  console.error(`Error opening database at ${DB_PATH}:`, err.message)
  process.exit(1)
}

// Verify user exists
const user = db.prepare('SELECT id, email FROM "User" WHERE email = ?').get(email)
if (!user) {
  console.error(`Error: User with email "${email}" not found in database.`)
  process.exit(1)
}

// Hash password and update
console.log(`Hashing new password for ${email}...`)
const hashedPassword = bcrypt.hashSync(newPassword, 10)

try {
  const stmt = db.prepare('UPDATE "User" SET password = ?, updatedAt = ? WHERE email = ?')
  const result = stmt.run(hashedPassword, new Date().toISOString(), email)
  if (result.changes > 0) {
    console.log(`Success: Password for ${email} has been updated successfully.`)
  } else {
    console.error('Error: Database update execution did not modify any rows.')
  }
} catch (err) {
  console.error('Database query failed:', err.message)
  process.exit(1)
}
