/**
 * Standalone PostgREST helper for Phase 5 tests.
 * Mirrors the logic in lib/supabase-p101.js but does NOT import from it
 * (avoids issues with server-only imports and Next.js module resolution).
 *
 * Uses the service-role key from environment variables loaded by env.mjs.
 */

import { requireEnv } from './env.mjs'
import { createHash, randomBytes } from 'node:crypto'

function getConfig() {
  return {
    url: requireEnv('SUPABASE_URL').replace(/\/$/, ''),
    key: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  }
}

function headers(key, extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    ...extra,
  }
}

export async function dbSelect(table, filters = {}, opts = {}) {
  const { url, key } = getConfig()
  const u = new URL(`${url}/rest/v1/${table}`)
  for (const [col, val] of Object.entries(filters)) u.searchParams.set(col, val)
  if (opts.select) u.searchParams.set('select', opts.select)
  if (opts.limit) u.searchParams.set('limit', String(opts.limit))
  if (opts.order) u.searchParams.set('order', opts.order)

  const res = await fetch(u, { headers: headers(key) })
  if (!res.ok) throw new Error(`dbSelect ${table} failed ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function dbInsert(table, row, { upsert = false, onConflict = '' } = {}) {
  const { url, key } = getConfig()
  let tableUrl = `${url}/rest/v1/${table}`
  const h = headers(key)
  if (upsert) {
    h['Prefer'] = `resolution=ignore-duplicates,return=representation`
    if (onConflict) tableUrl += `?on_conflict=${encodeURIComponent(onConflict)}`
  }
  const res = await fetch(tableUrl, { method: 'POST', headers: h, body: JSON.stringify(row) })
  if (!res.ok) throw new Error(`dbInsert ${table} failed ${res.status}: ${await res.text()}`)
  const text = await res.text()
  return text ? JSON.parse(text) : []
}

export async function dbUpdate(table, filters, patch) {
  const { url, key } = getConfig()
  const u = new URL(`${url}/rest/v1/${table}`)
  for (const [col, val] of Object.entries(filters)) u.searchParams.set(col, val)
  const h = headers(key, { Prefer: 'return=minimal' })
  const res = await fetch(u, { method: 'PATCH', headers: h, body: JSON.stringify(patch) })
  if (!res.ok) throw new Error(`dbUpdate ${table} failed ${res.status}: ${await res.text()}`)
}

export async function dbDelete(table, filters) {
  const { url, key } = getConfig()
  const u = new URL(`${url}/rest/v1/${table}`)
  for (const [col, val] of Object.entries(filters)) u.searchParams.set(col, val)
  const h = headers(key, { Prefer: 'return=minimal' })
  const res = await fetch(u, { method: 'DELETE', headers: h })
  if (!res.ok) throw new Error(`dbDelete ${table} failed ${res.status}: ${await res.text()}`)
}

// ─── Auth Admin API ────────────────────────────────────────────────────────────

export async function createTestAuthUser(email) {
  const { url, key } = getConfig()
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password: randomBytes(24).toString('hex'),
      email_confirm: true,
    }),
  })
  if (!res.ok) throw new Error(`createTestAuthUser failed ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.id
}

export async function deleteTestAuthUser(userId) {
  const { url, key } = getConfig()
  const res = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`deleteTestAuthUser failed ${res.status}: ${body}`)
  }
}

// ─── Token helpers ─────────────────────────────────────────────────────────────

export function generateTestToken() {
  const rawToken = randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(rawToken, 'utf8').digest('hex')
  return { rawToken, tokenHash }
}

// ─── Test fixture builders ─────────────────────────────────────────────────────

const TEST_PREFIX = '[TEST-P5]'

/**
 * Create a minimal test event that supports rep access.
 * Uses a large random year to avoid unique constraint collisions across runs.
 */
export async function createTestEvent(opts = {}) {
  const past = new Date('2020-01-01T00:00:00Z').toISOString()
  const future = new Date('2099-12-31T23:59:59Z').toISOString()
  // Use random year in range 9000000-9999999 to prevent cross-run collisions.
  // opts.year can be passed to force a specific year (for isolation tests).
  const year = opts.year ?? (9000000 + Math.floor(Math.random() * 999999))
  const row = await dbInsert('p101_opencall_events', {
    year,
    name: `${TEST_PREFIX} ${opts.name ?? 'Phase 5 Test Event'}`,
    submits_open: past,
    submits_close: future,
    review_close: future,
    status: opts.status ?? 'reviewing',
  })
  return row[0]
}

/**
 * Create a test application.
 * Inserts with status='submitted' so it appears in the gallery view.
 * guardianEmail / guardianName / guardianPhone are deliberately distinctive test values
 * so we can search responses for them in the leak test.
 */
export async function createTestApplication(eventId, userId, opts = {}) {
  const runId = opts.runId ?? 'DEFAULT'
  const row = await dbInsert('p101_opencall_applications', {
    event_id: eventId,
    user_id: userId,
    actor_name: `${TEST_PREFIX} ${opts.actorName ?? 'Alice Testmore'} ${runId}`,
    birth_year: opts.birthYear ?? 2016,
    birth_month: opts.birthMonth ?? 6,
    gender: 'Female',
    city: 'Los Angeles',
    state: 'CA',
    country: 'US',
    guardian_name: `${TEST_PREFIX} GuardianName ${runId}`,
    guardian_email: opts.guardianEmail ?? `test-guardian-p5-${runId.toLowerCase()}@testinvalid.local`,
    guardian_phone: `555-0100-${runId.replace(/[^0-9]/g, '').slice(0, 6)}`,
    union_status: 'non_union',
    coogan_status: 'yes',
    work_permit: 'not_required',
    passport: false,
    has_current_rep: false,
    seeking: ['theatrical', 'commercial'],
    casting_platforms: ['actors_access'],
    casting_profile_urls: ['https://testinvalid.local/actor/test-p5'],
    headshots: [{ type: 'commercial', url: 'https://testinvalid.local/headshot1.jpg' }],
    resume_url: 'https://testinvalid.local/resume.pdf',
    slate_url: 'https://testinvalid.local/slate.mp4',
    reel_url: null,
    other_video_url: null,
    ethnicity: [],
    local_hire_cities: [],
    rep_context: null,
    supplemental_notes: null,
    status: opts.status ?? 'submitted',
    submitted_at: opts.status === 'draft' ? null : new Date().toISOString(),
    consents: {
      guardian_consent: true,
      reviewer_visibility_consent: true,
      contact_consent: true,
    },
  })
  return row[0]
}

/**
 * Create a test representative invite.
 */
export async function createTestInvite(eventId, opts = {}) {
  const { rawToken, tokenHash } = generateTestToken()
  const future = opts.expiresAt ?? new Date('2099-12-31T23:59:59Z').toISOString()
  const row = await dbInsert('p101_opencall_rep_invites', {
    event_id: eventId,
    rep_name: `${TEST_PREFIX} ${opts.repName ?? 'Jane Testington'}`,
    rep_email: opts.repEmail ?? `test-rep-p5-${Date.now()}@testinvalid.local`,
    rep_agency: opts.repAgency ?? 'Test Agency P5',
    token_hash: tokenHash,
    expires_at: future,
    revoked_at: opts.revokedAt ?? null,
    redeemed_at: opts.redeemedAt ?? null,
  })
  return { invite: row[0], rawToken, tokenHash }
}

// ─── Cleanup helpers ───────────────────────────────────────────────────────────

export async function cleanupTestData({ eventIds = [], inviteIds = [], applicationIds = [], userId = null }) {
  const errs = []

  // Order matters: child rows before parents

  // 1. Access log (FK: invite_id, application_id)
  for (const invId of inviteIds) {
    try { await dbDelete('p101_opencall_access_log', { invite_id: `eq.${invId}` }) } catch (e) { errs.push(e.message) }
  }

  // 2. Intro requests (FK: invite_id, application_id, event_id)
  for (const invId of inviteIds) {
    try { await dbDelete('p101_opencall_intro_requests', { invite_id: `eq.${invId}` }) } catch (e) { errs.push(e.message) }
  }

  // 3. Favorites (FK: invite_id, application_id, event_id)
  for (const invId of inviteIds) {
    try { await dbDelete('p101_opencall_rep_favorites', { invite_id: `eq.${invId}` }) } catch (e) { errs.push(e.message) }
  }

  // 4. Invites (FK: event_id)
  for (const invId of inviteIds) {
    try { await dbDelete('p101_opencall_rep_invites', { id: `eq.${invId}` }) } catch (e) { errs.push(e.message) }
  }

  // 5. Applications (FK: event_id, user_id)
  for (const appId of applicationIds) {
    try { await dbDelete('p101_opencall_applications', { id: `eq.${appId}` }) } catch (e) { errs.push(e.message) }
  }

  // 6. Events
  for (const evId of eventIds) {
    try { await dbDelete('p101_opencall_events', { id: `eq.${evId}` }) } catch (e) { errs.push(e.message) }
  }

  // 7. Auth user (must be last — applications FK user_id)
  if (userId) {
    try { await deleteTestAuthUser(userId) } catch (e) { errs.push(e.message) }
  }

  if (errs.length) {
    process.stderr.write(`[cleanup] Errors during cleanup (non-fatal):\n${errs.map(e => `  ${e}`).join('\n')}\n`)
  }
}
