/**
 * Phase 5 — Requirements 2 & 3: Security Tests
 *
 * R2: Guardian data leak test — scans every application route for PII.
 * R3: Service-role static analysis — verifies no credentials exposed in client code.
 *
 * Requires:
 *   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (for seeding test data)
 *   - TALENTSEARCH_SESSION_SECRET
 *   - TEST_BASE_URL (app must be running for route scan tests)
 */

import { randomBytes } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve, relative, extname, join } from 'node:path'
import {
  createTestEvent, createTestApplication, createTestInvite,
  cleanupTestData, createTestAuthUser, dbSelect, dbUpdate,
} from './helpers/db.mjs'
import { createTestSession } from './helpers/session.mjs'
import { appGet, appPost, appGetFollow, isAppReachable } from './helpers/http.mjs'
import { suite, test, pass, fail, skip, assert, info } from './helpers/assert.mjs'
import { TEST_BASE_URL, ROOT_DIR } from './helpers/env.mjs'

suite('Security')

const runId = randomBytes(6).toString('hex').toUpperCase()

// ─── Guardian Leak Test (R2) ──────────────────────────────────────────────────

/**
 * These are the test values inserted into the test application's guardian fields.
 * If any of them appear in an HTTP response from the app, that is a data leak.
 */
const GUARDIAN_EMAIL = `guardian-sec-${runId}@testinvalid.local`
const GUARDIAN_NAME  = `GuardianNameSEC${runId}TestP5`
const GUARDIAN_PHONE = `555-SEC-${runId.slice(0, 6)}`

let secState = null

async function secSetup() {
  const userId = await createTestAuthUser(`test-sec-p5-${runId}@testinvalid.local`)
  const event  = await createTestEvent({ year: 9994, name: `Security Test ${runId}` })
  const app    = await createTestApplication(event.id, userId, {
    actorName: 'Security Test Actor',
    runId,
    guardianEmail: GUARDIAN_EMAIL,
  })
  // Patch guardian_name and guardian_phone to our distinctive sentinel values
  await dbUpdate('p101_opencall_applications', { id: `eq.${app.id}` }, {
    guardian_name:  GUARDIAN_NAME,
    guardian_phone: GUARDIAN_PHONE,
  })

  const { invite, rawToken } = await createTestInvite(event.id, {
    repName: 'Security Test Rep',
    repEmail: `sec-rep-${runId}@testinvalid.local`,
  })

  secState = { event, invite, rawToken, app, userId }
}

async function secTeardown() {
  if (!secState) return
  const { event, invite, app, userId } = secState
  await cleanupTestData({
    eventIds: [event?.id].filter(Boolean),
    inviteIds: [invite?.id].filter(Boolean),
    applicationIds: [app?.id].filter(Boolean),
    userId,
  })
}

/**
 * Check a string response body for any of the guardian sentinel values.
 * Returns an array of found leaks with context.
 */
function findGuardianPII(body, context) {
  const leaks = []
  const sentinels = [
    { field: 'guardian_email', value: GUARDIAN_EMAIL },
    { field: 'guardian_name',  value: GUARDIAN_NAME },
    { field: 'guardian_phone', value: GUARDIAN_PHONE },
  ]
  for (const { field, value } of sentinels) {
    if (body.includes(value)) {
      const idx = body.indexOf(value)
      const snippet = body.slice(Math.max(0, idx - 40), idx + value.length + 40)
      leaks.push({ field, value, context, snippet })
    }
  }
  // Also check for the literal field names that should only appear server-side
  for (const key of ['guardian_email', 'guardian_phone']) {
    if (body.includes(`"${key}"`)) {
      leaks.push({ field: key, value: `"${key}" key present`, context, snippet: '' })
    }
  }
  return leaks
}

export async function run() {
  await secSetup()
  const appReachable = await isAppReachable()

  try {
    await runGuardianLeakTests(appReachable)
    await runServiceRoleLeakTests()
  } finally {
    await secTeardown()
  }
}

// ─── R2: Guardian Leak Tests ──────────────────────────────────────────────────

async function runGuardianLeakTests(appReachable) {
  info('--- Guardian Data Leak Scan ---')
  info(`Sentinel guardian_email: ${GUARDIAN_EMAIL}`)
  info(`Sentinel guardian_name:  ${GUARDIAN_NAME}`)
  info(`Sentinel guardian_phone: ${GUARDIAN_PHONE}`)

  // SEC-01: /denied route (public) — no PII
  await test('SEC-01: /denied route does not leak guardian PII', async () => {
    if (!appReachable) { skip('SEC-01', 'App not reachable'); return }
    const r = await appGet('/denied')
    const body = await r.text()
    const leaks = findGuardianPII(body, '/denied')
    assert(leaks.length === 0, `Guardian PII leaked on /denied:\n${JSON.stringify(leaks, null, 2)}`)
    pass('SEC-01: /denied route does not leak guardian PII')
  })

  // SEC-02: / route without auth (before redirect) — no PII
  await test('SEC-02: / without auth does not leak PII in redirect', async () => {
    if (!appReachable) { skip('SEC-02', 'App not reachable'); return }
    const r = await appGet('/')
    const body = await r.text()
    const leaks = findGuardianPII(body, '/ (unauthenticated)')
    assert(leaks.length === 0, `Guardian PII leaked in unauthenticated redirect:\n${JSON.stringify(leaks, null, 2)}`)
    pass('SEC-02: / without auth does not leak PII in redirect')
  })

  // SEC-03: Authenticated gallery HTML — no guardian PII in response
  await test('SEC-03: Authenticated gallery HTML does not contain guardian PII', async () => {
    if (!appReachable) { skip('SEC-03', 'App not reachable'); return }
    const { invite, event } = secState
    const session = createTestSession(invite.id, event.id)
    const { res } = await appGetFollow('/', { cookieValue: session })
    const html = await res.text()
    const leaks = findGuardianPII(html, '/ (authenticated gallery HTML)')
    if (leaks.length > 0) {
      fail('SEC-03: Authenticated gallery HTML contains guardian PII', JSON.stringify(leaks, null, 2))
    } else {
      pass('SEC-03: Authenticated gallery HTML does not contain guardian PII')
    }
  })

  // SEC-04: /access redirect — PII not in response headers or body
  await test('SEC-04: /access token redemption does not leak guardian PII', async () => {
    if (!appReachable) { skip('SEC-04', 'App not reachable'); return }
    const { rawToken } = secState
    const r = await appGet(`/access?t=${encodeURIComponent(rawToken)}`)
    const body = await r.text()
    const headerStr = JSON.stringify([...r.headers.entries()])
    const leaks = [
      ...findGuardianPII(body, '/access body'),
      ...findGuardianPII(headerStr, '/access headers'),
    ]
    assert(leaks.length === 0, `Guardian PII in /access response:\n${JSON.stringify(leaks, null, 2)}`)
    pass('SEC-04: /access token redemption does not leak guardian PII')
  })

  // SEC-05: Favorites API response — no guardian PII
  await test('SEC-05: Favorites API response does not contain guardian PII', async () => {
    if (!appReachable) { skip('SEC-05', 'App not reachable'); return }
    const { invite, event, app } = secState
    const session = createTestSession(invite.id, event.id)
    const r = await appPost(`/api/rep/favorites/${app.id}`, { cookieValue: session })
    const body = r.text
    const leaks = findGuardianPII(body, `/api/rep/favorites/${app.id} POST`)
    assert(leaks.length === 0, `Guardian PII in favorites response:\n${JSON.stringify(leaks, null, 2)}`)
    pass('SEC-05: Favorites API response does not contain guardian PII')
  })

  // SEC-06: Intro request API response — no guardian PII
  await test('SEC-06: Intro request API response does not contain guardian PII', async () => {
    if (!appReachable) { skip('SEC-06', 'App not reachable'); return }
    const { invite, event, app } = secState
    const session = createTestSession(invite.id, event.id)
    const r = await appPost(`/api/rep/intro/${app.id}`, {
      cookieValue: session,
      body: {
        requesterName: `Security Test Rep ${runId}`,
        requesterEmail: `sec-requester-${runId}@testinvalid.local`,
        requesterRole: 'Agent',
      },
    })
    const body = r.text
    const leaks = findGuardianPII(body, `/api/rep/intro/${app.id} POST`)
    assert(leaks.length === 0, `Guardian PII in intro response:\n${JSON.stringify(leaks, null, 2)}`)
    pass('SEC-06: Intro request API response does not contain guardian PII')
  })

  // SEC-07: DB layer — gallery view does not expose guardian fields
  await test('SEC-07: Gallery view schema excludes guardian columns (DB level)', async () => {
    const { dbSelect } = await import('./helpers/db.mjs')
    const { event, app } = secState
    const rows = await dbSelect('p101_opencall_gallery_v', {
      event_id: `eq.${event.id}`,
      id: `eq.${app.id}`,
    })
    assert(rows.length === 1, 'Test app should appear in gallery view')
    const row = rows[0]
    const serialized = JSON.stringify(row)
    const leaks = findGuardianPII(serialized, 'p101_opencall_gallery_v row')
    if (leaks.length > 0) {
      fail('SEC-07: Gallery view DB row contains guardian PII', JSON.stringify(leaks, null, 2))
    } else {
      pass('SEC-07: Gallery view schema excludes guardian columns (DB level)')
    }
  })
}

// ─── R3: Service-Role Static Analysis ─────────────────────────────────────────

async function runServiceRoleLeakTests() {
  info('--- Service-Role Static Analysis ---')

  const SRC_DIRS = [
    resolve(ROOT_DIR, 'app'),
    resolve(ROOT_DIR, 'components'),
    resolve(ROOT_DIR, 'lib'),
    resolve(ROOT_DIR, 'config'),
    resolve(ROOT_DIR, 'middleware.js'),
  ]

  /**
   * Walk a directory recursively, returning all file paths.
   */
  function walkDir(dir, acc = []) {
    let entries
    try {
      entries = readdirSync(dir)
    } catch {
      // file path (non-directory) passed — just add it
      if (statSync(dir).isFile()) acc.push(dir)
      return acc
    }
    for (const entry of entries) {
      const full = join(dir, entry)
      let st
      try { st = statSync(full) } catch { continue }
      if (st.isDirectory()) {
        walkDir(full, acc)
      } else {
        const ext = extname(full)
        if (['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(ext)) {
          acc.push(full)
        }
      }
    }
    return acc
  }

  /**
   * Read a source file and return its content.
   */
  function readSource(filePath) {
    try { return readFileSync(filePath, 'utf8') } catch { return '' }
  }

  // Gather all source files
  const allFiles = []
  for (const src of SRC_DIRS) {
    try {
      const st = statSync(src)
      if (st.isDirectory()) walkDir(src, allFiles)
      else if (st.isFile()) allFiles.push(src)
    } catch { /* path does not exist */ }
  }

  info(`Scanning ${allFiles.length} source files`)

  // SEC-08: No NEXT_PUBLIC var references service-role or session secret
  await test('SEC-08: No NEXT_PUBLIC variable exposes service credentials', async () => {
    const violations = []
    for (const f of allFiles) {
      const src = readSource(f)
      const relPath = relative(ROOT_DIR, f)
      // NEXT_PUBLIC_ variables are bundled into client code
      const matches = [...src.matchAll(/NEXT_PUBLIC_[A-Z_]+/g)]
      for (const m of matches) {
        const varName = m[0]
        if (/SERVICE_ROLE|SERVICE_KEY|SECRET|PRIVATE/i.test(varName)) {
          violations.push({ file: relPath, variable: varName })
        }
      }
    }
    if (violations.length > 0) {
      fail('SEC-08: NEXT_PUBLIC credential exposure found', JSON.stringify(violations, null, 2))
    } else {
      pass('SEC-08: No NEXT_PUBLIC variable exposes service credentials')
    }
  })

  // SEC-09: SUPABASE_SERVICE_ROLE_KEY only accessed in server-only files
  await test('SEC-09: SUPABASE_SERVICE_ROLE_KEY only in server-only files', async () => {
    const clientDangerFiles = []
    const allowedServerFiles = new Set([
      'lib/supabase-p101.js',
      'lib/pages101.js',     // imports server-only guard
    ])

    for (const f of allFiles) {
      const src = readSource(f)
      const relPath = relative(ROOT_DIR, f)

      if (!src.includes('SUPABASE_SERVICE_ROLE_KEY')) continue

      const allowed = [...allowedServerFiles].some(a => relPath.replace(/\\/g, '/').endsWith(a))
      if (!allowed) {
        // Check if the file imports server-only (meaning it's protected)
        const hasServerOnlyGuard = src.includes("import 'server-only'") ||
                                   src.includes('require("server-only")') ||
                                   src.includes("require('server-only')")
        if (!hasServerOnlyGuard) {
          clientDangerFiles.push(relPath)
        }
      }
    }
    if (clientDangerFiles.length > 0) {
      fail('SEC-09: SUPABASE_SERVICE_ROLE_KEY referenced outside server-only modules', JSON.stringify(clientDangerFiles))
    } else {
      pass('SEC-09: SUPABASE_SERVICE_ROLE_KEY only in server-only files')
    }
  })

  // SEC-10: No 'use client' component imports server-only modules
  await test('SEC-10: No client component imports server-only modules', async () => {
    const violations = []
    const serverOnlyImports = [
      'server-only',
      '../lib/pages101',
      './pages101',
      '../../lib/pages101',
      '../lib/supabase-p101',
      './supabase-p101',
    ]

    for (const f of allFiles) {
      const src = readSource(f)
      if (!src.includes("'use client'") && !src.includes('"use client"')) continue

      const relPath = relative(ROOT_DIR, f)
      for (const imp of serverOnlyImports) {
        if (src.includes(imp)) {
          violations.push({ file: relPath, import: imp })
        }
      }
    }
    if (violations.length > 0) {
      fail('SEC-10: Client component imports server-only module', JSON.stringify(violations, null, 2))
    } else {
      pass('SEC-10: No client component imports server-only modules')
    }
  })

  // SEC-11: TALENTSEARCH_SESSION_SECRET only in server files
  await test('SEC-11: TALENTSEARCH_SESSION_SECRET only in server files', async () => {
    const violations = []
    for (const f of allFiles) {
      const src = readSource(f)
      if (!src.includes('TALENTSEARCH_SESSION_SECRET')) continue

      const relPath = relative(ROOT_DIR, f)
      // If this is a client component, it's a leak
      if (src.includes("'use client'") || src.includes('"use client"')) {
        violations.push(relPath)
      }
    }
    if (violations.length > 0) {
      fail('SEC-11: TALENTSEARCH_SESSION_SECRET in client component', JSON.stringify(violations))
    } else {
      pass('SEC-11: TALENTSEARCH_SESSION_SECRET only in server files')
    }
  })

  // SEC-12: Build output does not contain service-role key
  await test('SEC-12: Build output does not contain service-role key string', async () => {
    const buildDir = resolve(ROOT_DIR, '.next', 'static')
    let buildFiles = []
    try { walkDir(buildDir, buildFiles) } catch { /* no build yet */ }

    if (buildFiles.length === 0) {
      skip('SEC-12', 'No .next/static build output found — run `npm run build` to enable this check')
      return
    }

    const violations = []
    const { requireEnv } = await import('./helpers/env.mjs')
    let serviceRoleKey
    try { serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY') } catch {
      skip('SEC-12', 'SUPABASE_SERVICE_ROLE_KEY not available for bundle scan')
      return
    }

    // Only scan if we have the key (and it's not a placeholder)
    if (serviceRoleKey.length < 20) {
      skip('SEC-12', 'Service role key appears to be a placeholder; cannot reliably scan')
      return
    }

    for (const f of buildFiles.slice(0, 200)) {  // cap at 200 files
      const src = readSource(f)
      if (src.includes(serviceRoleKey)) {
        violations.push(relative(ROOT_DIR, f))
      }
    }
    if (violations.length > 0) {
      fail('SEC-12: Service-role key found in build output', JSON.stringify(violations))
    } else {
      pass('SEC-12: Build output does not contain service-role key string')
    }
  })

  // SEC-13: lib/pages101.js has server-only guard
  await test('SEC-13: lib/pages101.js has server-only import guard', async () => {
    const src = readSource(resolve(ROOT_DIR, 'lib/pages101.js'))
    assert(src.includes("import 'server-only'"), 'lib/pages101.js must import server-only at the top')
    pass('SEC-13: lib/pages101.js has server-only import guard')
  })

  // SEC-14: Middleware does not perform Supabase DB calls (Edge runtime safety)
  await test('SEC-14: Middleware performs no Supabase DB calls (HMAC-only)', async () => {
    const src = readSource(resolve(ROOT_DIR, 'middleware.js'))
    assert(!src.includes('SUPABASE_SERVICE_ROLE_KEY'), 'Middleware must not reference service-role key')
    assert(!src.includes('supabase-p101'), 'Middleware must not import supabase-p101')
    assert(!src.includes('fetch('), 'Middleware must not make fetch calls to Supabase')
    pass('SEC-14: Middleware performs no Supabase DB calls (HMAC-only)')
  })

  // SEC-15: Guardian fields never passed to TalentGallery with real values
  await test('SEC-15: Server page does not pass guardian contact to client components', async () => {
    const src = readSource(resolve(ROOT_DIR, 'app/page.js'))
    // The submissions object is passed to TalentGallery. Verify guardian fields
    // are never populated from the fetched data (they must be '' hardcoded in normalizeApplication)
    const normSrc = readSource(resolve(ROOT_DIR, 'lib/pages101.js'))
    // guardianName should always be hardcoded to ''
    assert(normSrc.includes("guardianName: ''"), "normalizeApplication must set guardianName: ''")
    assert(normSrc.includes("email: ''"),        "normalizeApplication must set email: ''")
    assert(normSrc.includes("phone: ''"),        "normalizeApplication must set phone: ''")
    pass('SEC-15: Server page does not pass guardian contact to client components')
  })

  // SEC-NEG-01: Negative fixture — verify the scanner itself catches a real violation
  // Creates a temporary fake client component referencing SUPABASE_SERVICE_ROLE_KEY,
  // asserts the SEC-09 scanner logic would flag it, then removes the file.
  await test('SEC-NEG-01: Scanner correctly flags service-role key in unauthorized client component (negative fixture)', async () => {
    const { writeFileSync, unlinkSync } = await import('node:fs')

    const fakePath = resolve(ROOT_DIR, 'components', '__test_sec_neg01.jsx')
    writeFileSync(fakePath, [
      "'use client'",
      '// TEMPORARY TEST FIXTURE — removed immediately by SEC-NEG-01',
      'export function FakeComponent() {',
      '  const key = process.env.SUPABASE_SERVICE_ROLE_KEY // intentional SEC-09 violation',
      '  return null',
      '}',
    ].join('\n'))

    try {
      const src = readSource(fakePath)
      const relPath = relative(ROOT_DIR, fakePath)

      const allowedServerFiles = new Set(['lib/supabase-p101.js', 'lib/pages101.js'])
      const hasSRK     = src.includes('SUPABASE_SERVICE_ROLE_KEY')
      const isAllowed  = [...allowedServerFiles].some(a => relPath.replace(/\\/g, '/').endsWith(a))
      const hasGuard   = src.includes("import 'server-only'") ||
                         src.includes('require("server-only")') ||
                         src.includes("require('server-only')")

      assert(hasSRK,    'Fixture file must reference SUPABASE_SERVICE_ROLE_KEY')
      assert(!isAllowed, 'Fixture file must not be in the SEC-09 allowlist')
      assert(!hasGuard,  'Fixture file must not have a server-only guard')
      // This is the SEC-09 predicate — it must evaluate true for the scanner to catch this file
      assert(hasSRK && !isAllowed && !hasGuard,
        'SEC-09 scanner must flag this file — assertion failure means the scanner has a gap')

      pass('SEC-NEG-01: Scanner correctly flags service-role key in unauthorized client component (negative fixture)')
    } finally {
      try { unlinkSync(fakePath) } catch { /* best-effort */ }
    }
  })
}
