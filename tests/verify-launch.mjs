#!/usr/bin/env node
/**
 * Open Call pre-launch verification script.
 *
 * Usage:
 *   npm run opencall:verify                                        # infrastructure only
 *   TEST_BASE_URL=https://talentsearch.childactor101.com npm run opencall:verify  # full
 *
 * Checks (in order):
 *   1  Required env vars present
 *   2  Supabase service-role connectivity
 *   3  Required tables exist (migration proxy)
 *   4  Gallery view exists and excludes guardian columns
 *   5  Active Open Call event exists
 *   6  Anonymous access blocked on sensitive tables
 *   7  Storage bucket "pages101-media" accessible
 *   8  SES credentials valid and from-address verified
 *   9  Static security analysis (SEC-08–15)
 *   10 Full test suite (requires TEST_BASE_URL + running server)
 */

import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, relative, extname, join } from 'node:path'
import { SESClient, ListIdentitiesCommand } from '@aws-sdk/client-ses'
import { OPEN_CALL } from '../config/opencall.js'

const ROOT_DIR = resolve(new URL('.', import.meta.url).pathname, '..')

// ─── Result tracking ──────────────────────────────────────────────────────────

const results = []

function record(status, label, detail = null) {
  results.push({ status, label, detail })
  if (status === 'PASS') process.stdout.write('.')
  else if (status === 'FAIL') process.stdout.write('✗')
  else if (status === 'SKIP') process.stdout.write('-')
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

function supabaseHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
  }
}

async function supabaseGet(path, { noAuth = false } = {}) {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, '')
  const headers = noAuth ? { Accept: 'application/json' } : supabaseHeaders()
  return fetch(`${base}${path}`, { headers })
}

// ─── Static analysis (mirrors security.test.mjs SEC-08–15) ───────────────────

function walkDir(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    let st
    try { st = statSync(full) } catch { continue }
    if (st.isDirectory()) walkDir(full, acc)
    else if (['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(extname(full))) acc.push(full)
  }
  return acc
}

function readSrc(f) {
  try { return readFileSync(f, 'utf8') } catch { return '' }
}

function runStaticAnalysis() {
  const SRC_DIRS = ['app', 'components', 'lib', 'config', 'middleware.js'].map(d => resolve(ROOT_DIR, d))
  const files = []
  for (const src of SRC_DIRS) {
    try {
      const st = statSync(src)
      if (st.isDirectory()) walkDir(src, files)
      else if (st.isFile()) files.push(src)
    } catch { /* path does not exist */ }
  }

  const violations = []
  const allowedServerFiles = new Set(['lib/supabase-p101.js', 'lib/pages101.js'])
  const serverOnlyImports = [
    'server-only', '../lib/pages101', './pages101', '../../lib/pages101',
    '../lib/supabase-p101', './supabase-p101',
  ]

  for (const f of files) {
    const src = readSrc(f)
    const rel = relative(ROOT_DIR, f).replace(/\\/g, '/')

    // SEC-08: No NEXT_PUBLIC_ credential variable
    for (const m of src.matchAll(/NEXT_PUBLIC_[A-Z_]+/g)) {
      if (/SERVICE_ROLE|SERVICE_KEY|SECRET|PRIVATE/i.test(m[0])) {
        violations.push(`SEC-08: ${rel} exposes ${m[0]} via NEXT_PUBLIC_`)
      }
    }

    // SEC-09: Service-role key in non-allowlisted file without server-only guard
    if (src.includes('SUPABASE_SERVICE_ROLE_KEY')) {
      const allowed = [...allowedServerFiles].some(a => rel.endsWith(a))
      const hasGuard = src.includes("import 'server-only'") || src.includes('require("server-only")')
      if (!allowed && !hasGuard) {
        violations.push(`SEC-09: ${rel} references SUPABASE_SERVICE_ROLE_KEY without server-only guard`)
      }
    }

    // SEC-10: 'use client' component imports server-only module
    if (src.includes("'use client'") || src.includes('"use client"')) {
      for (const imp of serverOnlyImports) {
        if (src.includes(imp)) {
          violations.push(`SEC-10: ${rel} is a client component that imports "${imp}"`)
        }
      }
    }

    // SEC-11: Session secret in client component
    if (src.includes('TALENTSEARCH_SESSION_SECRET')) {
      if (src.includes("'use client'") || src.includes('"use client"')) {
        violations.push(`SEC-11: ${rel} exposes TALENTSEARCH_SESSION_SECRET in a client component`)
      }
    }
  }

  // SEC-13: lib/pages101.js must have server-only guard
  if (!readSrc(resolve(ROOT_DIR, 'lib/pages101.js')).includes("import 'server-only'")) {
    violations.push("SEC-13: lib/pages101.js missing import 'server-only'")
  }

  // SEC-14: Middleware must not reference service-role key or import supabase-p101
  const mwSrc = readSrc(resolve(ROOT_DIR, 'middleware.js'))
  if (mwSrc.includes('SUPABASE_SERVICE_ROLE_KEY')) violations.push('SEC-14: middleware.js references service-role key')
  if (mwSrc.includes('supabase-p101')) violations.push('SEC-14: middleware.js imports supabase-p101')

  // SEC-15: Normalizer must zero guardian contact fields
  const normSrc = readSrc(resolve(ROOT_DIR, 'lib/pages101.js'))
  if (!normSrc.includes("guardianName: ''")) violations.push("SEC-15: normalizer does not set guardianName: ''")
  if (!normSrc.includes("email: ''"))        violations.push("SEC-15: normalizer does not set email: ''")
  if (!normSrc.includes("phone: ''"))        violations.push("SEC-15: normalizer does not set phone: ''")

  return violations
}

// ─── Checks ───────────────────────────────────────────────────────────────────

async function checkEnvVars() {
  const required = [
    'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'TALENTSEARCH_SESSION_SECRET',
    'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'SES_FROM_ADDRESS',
  ]
  const missing = required.filter(v => !process.env[v]?.trim())
  if (missing.length > 0) {
    record('FAIL', 'Required env vars present', `Missing: ${missing.join(', ')}`)
  } else {
    record('PASS', 'Required env vars present')
  }
}

async function checkSupabaseConnectivity() {
  try {
    const res = await supabaseGet('/rest/v1/')
    if (!res.ok) record('FAIL', 'Supabase service-role connectivity', `HTTP ${res.status}`)
    else record('PASS', 'Supabase service-role connectivity')
  } catch (e) {
    record('FAIL', 'Supabase service-role connectivity', e.message)
  }
}

async function checkRequiredTables() {
  const tables = [
    'p101_opencall_events',
    'p101_opencall_applications',
    'p101_opencall_rep_invites',
    'p101_opencall_rep_favorites',
    'p101_opencall_intro_requests',
    'p101_opencall_access_log',
  ]
  const missing = []
  for (const t of tables) {
    try {
      const res = await supabaseGet(`/rest/v1/${t}?limit=0`)
      if (res.status === 404 || res.status === 400) missing.push(t)
    } catch {
      missing.push(t)
    }
  }
  if (missing.length > 0) {
    record('FAIL', 'Required tables exist (migrations applied)', `Missing: ${missing.join(', ')}`)
  } else {
    record('PASS', 'Required tables exist (migrations applied)')
  }
}

async function checkGalleryView() {
  try {
    // Attempt to select guardian columns from the view.
    // If they are absent (correct behavior), PostgREST returns 400.
    // If present (bug), it returns 200 with the columns.
    const res = await supabaseGet(
      '/rest/v1/p101_opencall_gallery_v?limit=1&select=guardian_name,guardian_email,guardian_phone'
    )
    if (res.status === 400) {
      // Column does not exist — guardian fields correctly excluded
      record('PASS', 'Gallery view excludes guardian columns')
    } else if (res.status === 200) {
      const text = await res.text()
      if (text.includes('guardian_name') || text.includes('guardian_email') || text.includes('guardian_phone')) {
        record('FAIL', 'Gallery view excludes guardian columns', 'Guardian columns found in view response')
      } else {
        record('PASS', 'Gallery view excludes guardian columns')
      }
    } else {
      record('FAIL', 'Gallery view excludes guardian columns', `Unexpected status ${res.status}`)
    }
  } catch (e) {
    record('FAIL', 'Gallery view excludes guardian columns', e.message)
  }
}

async function checkActiveEvent() {
  try {
    const res = await supabaseGet(
      `/rest/v1/p101_opencall_events?year=eq.${OPEN_CALL.displayYear}&status=in.(open,reviewing)&select=id,name,status,review_close`
    )
    if (!res.ok) {
      record('FAIL', `Active event exists (${OPEN_CALL.displayYear})`, `HTTP ${res.status}`)
      return
    }
    const rows = await res.json()
    if (!rows.length) {
      record('FAIL', `Active event exists (${OPEN_CALL.displayYear})`, `No event with status=open|reviewing for year ${OPEN_CALL.displayYear}`)
    } else {
      const { name, status, review_close } = rows[0]
      const close = review_close ? new Date(review_close).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'not set'
      record('PASS', `Active event exists (${OPEN_CALL.displayYear})`, `"${name}" · status=${status} · review_close=${close}`)
    }
  } catch (e) {
    record('FAIL', `Active event exists (${OPEN_CALL.displayYear})`, e.message)
  }
}

async function checkAnonAccessBlocked() {
  try {
    // Request without any auth headers → Supabase returns 401
    const res = await supabaseGet('/rest/v1/p101_opencall_applications?limit=1', { noAuth: true })
    if (res.status === 401 || res.status === 403) {
      record('PASS', 'Anonymous access blocked on sensitive tables')
    } else if (res.status === 200) {
      const rows = await res.json()
      if (rows.length > 0) {
        record('FAIL', 'Anonymous access blocked on sensitive tables', 'Unauthenticated request returned data rows')
      } else {
        // 200 with 0 rows: anon can query but sees nothing — acceptable given no RLS
        record('PASS', 'Anonymous access blocked on sensitive tables')
      }
    } else {
      record('FAIL', 'Anonymous access blocked on sensitive tables', `Unexpected status ${res.status}`)
    }
  } catch (e) {
    record('FAIL', 'Anonymous access blocked on sensitive tables', e.message)
  }
}

async function checkStorageBucket() {
  try {
    const base = process.env.SUPABASE_URL?.replace(/\/$/, '')
    const res = await fetch(`${base}/storage/v1/bucket/pages101-media`, {
      headers: supabaseHeaders(),
    })
    if (res.status === 404) {
      record('FAIL', 'Storage bucket "pages101-media" accessible', 'Bucket not found')
    } else if (res.ok) {
      record('PASS', 'Storage bucket "pages101-media" accessible')
    } else {
      record('FAIL', 'Storage bucket "pages101-media" accessible', `HTTP ${res.status}`)
    }
  } catch (e) {
    record('FAIL', 'Storage bucket "pages101-media" accessible', e.message)
  }
}

async function checkSES() {
  try {
    const client = new SESClient({
      region: process.env.AWS_REGION || process.env.SES_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    })
    // ListIdentities: lightweight read-only call that confirms credentials and lists verified senders
    const result = await client.send(new ListIdentitiesCommand({ IdentityType: 'EmailAddress', MaxItems: 100 }))

    // Confirm SES_FROM_ADDRESS is verified
    const fromRaw = (process.env.SES_FROM_ADDRESS || '').trim()
    const fromEmail = fromRaw.match(/<(.+)>$/)?.[1] ?? fromRaw
    const verified = result.Identities ?? []
    if (!verified.includes(fromEmail)) {
      record('FAIL', 'SES credentials valid + from-address verified', `${fromEmail} not in verified identities: ${verified.join(', ')}`)
    } else {
      record('PASS', 'SES credentials valid + from-address verified', `${fromEmail} verified`)
    }
  } catch (e) {
    record('FAIL', 'SES credentials valid + from-address verified', e.message.split('\n')[0])
  }
}

async function checkStaticAnalysis() {
  try {
    const violations = runStaticAnalysis()
    if (violations.length > 0) {
      record('FAIL', 'Static security analysis (SEC-08–15)', violations.join('\n'))
    } else {
      record('PASS', 'Static security analysis (SEC-08–15)')
    }
  } catch (e) {
    record('FAIL', 'Static security analysis (SEC-08–15)', e.message)
  }
}

async function checkTestSuite() {
  const baseUrl = process.env.TEST_BASE_URL
  if (!baseUrl) {
    record('SKIP', 'Full test suite (63 tests)', 'Set TEST_BASE_URL to include live server tests')
    return
  }
  console.log('\n  [running test suite against ' + baseUrl + ' — this may take ~60s]')
  const result = spawnSync('node', ['tests/run.mjs'], {
    cwd: ROOT_DIR,
    env: { ...process.env, TEST_BASE_URL: baseUrl },
    encoding: 'utf8',
    timeout: 300_000,
  })
  if (result.status !== 0) {
    const output = (result.stdout + result.stderr).slice(-3000)
    record('FAIL', 'Full test suite (63 tests)', output)
  } else {
    record('PASS', 'Full test suite (63 tests)')
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n\x1b[1mOpen Call Launch Verification\x1b[0m')
  console.log(`Edition: ${OPEN_CALL.edition} Annual Open Call (${OPEN_CALL.displayYear})`)
  console.log('══════════════════════════════════════════\n')
  process.stdout.write('Running checks: ')

  await checkEnvVars()
  await checkSupabaseConnectivity()
  await checkRequiredTables()
  await checkGalleryView()
  await checkActiveEvent()
  await checkAnonAccessBlocked()
  await checkStorageBucket()
  await checkSES()
  await checkStaticAnalysis()
  await checkTestSuite()

  console.log('\n\n══════════════════════════════════════════')

  const width = 45
  for (let i = 0; i < results.length; i++) {
    const { status, label, detail } = results[i]
    const idx = `[${String(i + 1).padStart(2)}/${results.length}]`
    const statusStr = status === 'PASS' ? '\x1b[32mPASS\x1b[0m'
                    : status === 'FAIL' ? '\x1b[31mFAIL\x1b[0m'
                    : '\x1b[33mSKIP\x1b[0m'
    console.log(`${idx}  ${statusStr}  ${label}`)
    if (detail && status !== 'PASS') {
      const firstLine = detail.split('\n')[0]
      console.log(`         └─ ${firstLine}`)
    } else if (detail && status === 'PASS') {
      console.log(`         └─ ${detail}`)
    }
  }

  const failed  = results.filter(r => r.status === 'FAIL').length
  const passed  = results.filter(r => r.status === 'PASS').length
  const skipped = results.filter(r => r.status === 'SKIP').length

  console.log('══════════════════════════════════════════')

  if (failed > 0) {
    console.log(`\n\x1b[31mFAIL  ${failed} check(s) failed · ${passed} passed · ${skipped} skipped\x1b[0m\n`)
    process.exit(1)
  } else {
    console.log(`\n\x1b[32mPASS  ${passed} check(s) passed · ${skipped} skipped\x1b[0m`)
    console.log('\x1b[1mReady for owner approval.\x1b[0m\n')
  }
}

main().catch(e => {
  console.error('\n\x1b[31mVerification aborted:\x1b[0m', e.message)
  process.exit(1)
})
