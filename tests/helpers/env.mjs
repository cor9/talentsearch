/**
 * Environment loader for Phase 5 tests.
 * Reads .env.local from the talentsearch project root and populates process.env.
 * Values already in process.env take precedence (CI/Vercel sets them directly).
 */

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dir, '../..')   // talentsearch project root

function parseEnvFile(filePath) {
  let content
  try { content = readFileSync(filePath, 'utf8') } catch { return }

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    let val = trimmed.slice(eqIdx + 1).trim()
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    // Do not override values set in the real environment
    if (!process.env[key]) process.env[key] = val
  }
}

// Load in order — .env.local overrides .env
parseEnvFile(resolve(ROOT, '.env'))
parseEnvFile(resolve(ROOT, '.env.local'))

export function requireEnv(name) {
  const val = process.env[name]
  if (!val) throw new Error(`Required env var missing: ${name}\n  Set it in talentsearch/.env.local or pass it to the test runner.`)
  return val
}

// Base URL of the running app — default to localhost dev server
export const TEST_BASE_URL = (process.env.TEST_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')

export const ROOT_DIR = ROOT
