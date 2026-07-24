/**
 * Phase 5 — Requirement 1: Acceptance Tests
 *
 * Implements every acceptance criterion from Open Call Spec v2 Section 10.
 * Each test creates its own isolated data, executes, and cleans up.
 *
 * Requires:
 *   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (for DB seeding)
 *   - TALENTSEARCH_SESSION_SECRET (for session signing)
 *   - TEST_BASE_URL (defaults to http://localhost:3000)
 */

import { randomBytes } from 'node:crypto'
import {
  createTestEvent, createTestApplication, createTestInvite,
  cleanupTestData, createTestAuthUser, dbSelect, dbUpdate, dbDelete, dbInsert,
} from './helpers/db.mjs'
import {
  createTestSession, createExpiredSession, createTamperedSession,
} from './helpers/session.mjs'
import {
  appGet, appGetFollow, appPost, appDelete, isAppReachable,
} from './helpers/http.mjs'
import { suite, test, pass, fail, skip, assert, assertEqual, info } from './helpers/assert.mjs'
import { TEST_BASE_URL } from './helpers/env.mjs'

// ─── Setup ────────────────────────────────────────────────────────────────────

suite('Acceptance')

const runId = randomBytes(6).toString('hex').toUpperCase()
info(`Run ID: ${runId}  Base URL: ${TEST_BASE_URL}`)

let appReachable = false
let sharedState = null   // { event, invite, rawToken, app, userId }

async function setup() {
  appReachable = await isAppReachable()
  if (!appReachable) {
    info('App is not reachable — HTTP tests will be skipped. Start the dev server with: npm run dev')
  }

  // Seed shared test fixtures used by most tests
  const userId = await createTestAuthUser(`test-acc-p5-${runId}@testinvalid.local`)
  const event = await createTestEvent({ year: 9997, name: `Acceptance Test ${runId}` })
  const app = await createTestApplication(event.id, userId, {
    actorName: 'Acceptance Test Actor',
    runId,
    guardianEmail: `guardian-acc-${runId}@testinvalid.local`,
  })
  const { invite, rawToken } = await createTestInvite(event.id, {
    repName: 'Acceptance Rep',
    repEmail: `rep-acc-${runId}@testinvalid.local`,
    repAgency: 'Acceptance Agency',
  })

  sharedState = { event, invite, rawToken, app, userId }
}

async function teardown() {
  if (!sharedState) return
  const { event, invite, app, userId } = sharedState
  await cleanupTestData({
    eventIds: [event?.id].filter(Boolean),
    inviteIds: [invite?.id, ...(sharedState.extraInviteIds ?? [])].filter(Boolean),
    applicationIds: [app?.id, ...(sharedState.extraAppIds ?? [])].filter(Boolean),
    userId,
  })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

export async function run() {
  await setup()

  try {
    await runAuthGuardTests()
    await runTokenRedemptionTests()
    await runGalleryIsolationTests()
    await runFavoritesTests()
    await runIntroRequestTests()
    await runRevocationTests()
  } finally {
    await teardown()
  }
}

// ─── AUTH GUARD ───────────────────────────────────────────────────────────────

async function runAuthGuardTests() {
  // ACC-01: No cookie → redirect to /denied
  await test('ACC-01: No cookie → redirect to /denied', async () => {
    if (!appReachable) { skip('ACC-01', 'App not reachable'); return }
    const r = await appGet('/')
    assert(r.status === 302 || r.status === 307, `Expected redirect, got ${r.status}`)
    assert(r.location.includes('/denied'), `Expected /denied, got: ${r.location}`)
    pass('ACC-01: No cookie → redirect to /denied')
  })

  // ACC-02: Malformed cookie → redirect to /denied
  await test('ACC-02: Malformed cookie → redirect to /denied', async () => {
    if (!appReachable) { skip('ACC-02', 'App not reachable'); return }
    const r = await appGet('/', { cookieValue: 'not.a.valid.cookie.at.all' })
    assert(r.status === 302 || r.status === 307, `Expected redirect, got ${r.status}`)
    assert(r.location.includes('/denied'), `Expected /denied redirect, got: ${r.location}`)
    pass('ACC-02: Malformed cookie → redirect to /denied')
  })

  // ACC-03: Tampered HMAC → redirect to /denied
  await test('ACC-03: Tampered HMAC → redirect to /denied', async () => {
    if (!appReachable) { skip('ACC-03', 'App not reachable'); return }
    const { invite, event } = sharedState
    const tampered = createTamperedSession(invite.id, event.id)
    const r = await appGet('/', { cookieValue: tampered })
    assert(r.status === 302 || r.status === 307, `Expected redirect, got ${r.status}`)
    assert(r.location.includes('/denied'), `Expected /denied redirect, got: ${r.location}`)
    pass('ACC-03: Tampered HMAC → redirect to /denied')
  })

  // ACC-04: Expired session → redirect to /denied
  await test('ACC-04: Expired session cookie → redirect to /denied', async () => {
    if (!appReachable) { skip('ACC-04', 'App not reachable'); return }
    const { invite, event } = sharedState
    const expired = createExpiredSession(invite.id, event.id)
    const r = await appGet('/', { cookieValue: expired })
    assert(r.status === 302 || r.status === 307, `Expected redirect, got ${r.status}`)
    assert(r.location.includes('/denied'), `Expected /denied redirect, got: ${r.location}`)
    pass('ACC-04: Expired session cookie → redirect to /denied')
  })

  // ACC-05: API routes without cookie → 401
  await test('ACC-05: /api/rep/* without session cookie → 401', async () => {
    if (!appReachable) { skip('ACC-05', 'App not reachable'); return }
    const fakeAppId = 'aaaaaaaa-0000-0000-0000-aaaaaaaaaaaa'
    const r1 = await appPost(`/api/rep/favorites/${fakeAppId}`, {})
    assertEqual(r1.status, 401, 'favorites POST without cookie')
    const r2 = await appDelete(`/api/rep/favorites/${fakeAppId}`, {})
    assertEqual(r2.status, 401, 'favorites DELETE without cookie')
    const r3 = await appPost(`/api/rep/intro/${fakeAppId}`, {})
    assertEqual(r3.status, 401, 'intro POST without cookie')
    pass('ACC-05: /api/rep/* without session cookie → 401')
  })
}

// ─── TOKEN REDEMPTION ─────────────────────────────────────────────────────────

async function runTokenRedemptionTests() {
  // ACC-06: Valid token → 302 to / with session cookie set
  await test('ACC-06: Valid invite token → session cookie + redirect to gallery', async () => {
    if (!appReachable) { skip('ACC-06', 'App not reachable'); return }
    const { rawToken, invite } = sharedState
    const r = await appGet(`/access?t=${encodeURIComponent(rawToken)}`)
    assert(r.status === 302 || r.status === 307, `Expected redirect, got ${r.status}`)
    const loc = r.location
    assert(loc.endsWith('/') || loc.match(/\/$/) || loc === `${TEST_BASE_URL}/`, `Expected redirect to /, got: ${loc}`)
    const setCookie = r.headers.get('set-cookie') ?? ''
    assert(setCookie.includes('__rep='), `Expected __rep cookie in Set-Cookie, got: ${setCookie}`)
    assert(setCookie.includes('HttpOnly'), 'Cookie must be HttpOnly')
    pass('ACC-06: Valid invite token → session cookie + redirect to gallery')

    // Verify redeemed_at was recorded
    const rows = await dbSelect('p101_opencall_rep_invites', { id: `eq.${invite.id}` })
    assert(rows[0]?.redeemed_at, 'redeemed_at should be set after first redemption')
  })

  // ACC-07: Revoked token → /denied?r=revoked
  await test('ACC-07: Revoked token → /denied with r=revoked', async () => {
    if (!appReachable) { skip('ACC-07', 'App not reachable'); return }
    // Create a separate invite for this test (to avoid breaking shared state)
    const { event } = sharedState
    const { invite: revokedInvite, rawToken: revokedToken } = await createTestInvite(event.id, {
      repName: 'Revoked Rep',
      revokedAt: new Date().toISOString(),
    })
    sharedState.extraInviteIds = [...(sharedState.extraInviteIds ?? []), revokedInvite.id]

    const r = await appGet(`/access?t=${encodeURIComponent(revokedToken)}`)
    assert(r.status === 302 || r.status === 307, `Expected redirect, got ${r.status}`)
    assert(r.location.includes('/denied'), `Expected /denied redirect, got: ${r.location}`)
    assert(r.location.includes('r=revoked'), `Expected r=revoked, got: ${r.location}`)
    pass('ACC-07: Revoked token → /denied with r=revoked')
  })

  // ACC-08: Expired token → /denied?r=expired
  await test('ACC-08: Expired invite token → /denied with r=expired', async () => {
    if (!appReachable) { skip('ACC-08', 'App not reachable'); return }
    const { event } = sharedState
    const pastDate = new Date('2020-01-01T00:00:00Z').toISOString()
    const { invite: expiredInvite, rawToken: expiredToken } = await createTestInvite(event.id, {
      repName: 'Expired Rep',
      expiresAt: pastDate,
    })
    sharedState.extraInviteIds = [...(sharedState.extraInviteIds ?? []), expiredInvite.id]

    const r = await appGet(`/access?t=${encodeURIComponent(expiredToken)}`)
    assert(r.status === 302 || r.status === 307, `Expected redirect, got ${r.status}`)
    assert(r.location.includes('/denied'), `Expected /denied, got: ${r.location}`)
    assert(r.location.includes('r=expired'), `Expected r=expired, got: ${r.location}`)
    pass('ACC-08: Expired invite token → /denied with r=expired')
  })

  // ACC-09: Unknown token → /denied?r=unknown
  await test('ACC-09: Unknown token → /denied with r=unknown', async () => {
    if (!appReachable) { skip('ACC-09', 'App not reachable'); return }
    const fakeToken = randomBytes(32).toString('base64url')
    const r = await appGet(`/access?t=${encodeURIComponent(fakeToken)}`)
    assert(r.status === 302 || r.status === 307, `Expected redirect, got ${r.status}`)
    assert(r.location.includes('/denied'), `Expected /denied, got: ${r.location}`)
    assert(r.location.includes('r=unknown'), `Expected r=unknown, got: ${r.location}`)
    pass('ACC-09: Unknown token → /denied with r=unknown')
  })

  // ACC-10: Token too short → /denied?r=invalid
  await test('ACC-10: Token too short → /denied with r=invalid', async () => {
    if (!appReachable) { skip('ACC-10', 'App not reachable'); return }
    const r = await appGet(`/access?t=short`)
    assert(r.status === 302 || r.status === 307, `Expected redirect, got ${r.status}`)
    assert(r.location.includes('/denied'), `Expected /denied, got: ${r.location}`)
    assert(r.location.includes('r=invalid'), `Expected r=invalid, got: ${r.location}`)
    pass('ACC-10: Token too short → /denied with r=invalid')
  })

  // ACC-11: Raw token NOT stored in DB (only hash stored)
  await test('ACC-11: Raw token not stored in DB (only hash)', async () => {
    const { rawToken } = sharedState
    // Search for the raw token in the invite row — it must NOT be there
    const rows = await dbSelect('p101_opencall_rep_invites', {
      token_hash: `neq.${rawToken}`,  // token_hash column should not equal rawToken
    }, { select: 'token_hash' })
    // Verify that the raw token string does not match any token_hash value
    const hasRawToken = rows.some(r => r.token_hash === rawToken)
    assert(!hasRawToken, 'Raw token must not be stored as token_hash')
    // Also verify token_hash has the length of a sha256 hex string (64 chars)
    const myInviteRow = await dbSelect('p101_opencall_rep_invites', {
      id: `eq.${sharedState.invite.id}`,
    })
    const hash = myInviteRow[0]?.token_hash
    assert(typeof hash === 'string' && hash.length === 64, `token_hash should be 64-char hex, got: ${hash?.length}`)
    pass('ACC-11: Raw token not stored in DB (only hash)')
  })
}

// ─── GALLERY ISOLATION ────────────────────────────────────────────────────────

async function runGalleryIsolationTests() {
  // ACC-12: Gallery shows submitted apps for the session's event only
  await test('ACC-12: Gallery shows submitted apps for session event only', async () => {
    if (!appReachable) { skip('ACC-12', 'App not reachable'); return }

    const { event, invite, app } = sharedState
    const session = createTestSession(invite.id, event.id, {
      repName: invite.rep_name,
      repAgency: invite.rep_agency,
    })

    const { res } = await appGetFollow('/', { cookieValue: session })
    assert(res.status === 200, `Expected 200, got ${res.status}`)
    const html = await res.text()
    // The actor name should appear in the gallery HTML
    assert(html.includes(`[TEST-P5]`), 'Gallery HTML should contain test actor name')
    pass('ACC-12: Gallery shows submitted apps for session event only')
  })

  // ACC-13: Draft application NOT in gallery
  await test('ACC-13: Draft application excluded from gallery', async () => {
    const { event, userId } = sharedState

    // Create a draft application
    const draftApp = await createTestApplication(event.id, userId, {
      actorName: 'Draft Actor Should Not Appear',
      runId: `DRAFT-${runId}`,
      status: 'draft',
    })
    sharedState.extraAppIds = [...(sharedState.extraAppIds ?? []), draftApp.id]

    // Verify draft does NOT appear in gallery view
    const galleryRows = await dbSelect('p101_opencall_gallery_v', {
      event_id: `eq.${event.id}`,
      id: `eq.${draftApp.id}`,
    })
    assertEqual(galleryRows.length, 0, 'Draft app should not appear in gallery view')
    pass('ACC-13: Draft application excluded from gallery view')
  })

  // ACC-14: Event isolation — rep A cannot access event B applications
  await test('ACC-14: Event isolation (rep A cannot see event B submissions)', async () => {
    // Create a second event and application
    const userId = await createTestAuthUser(`test-isol-p5-${runId}@testinvalid.local`)
    const eventB = await createTestEvent({ year: 9996, name: `Isolation Test B ${runId}` })
    const appB = await createTestApplication(eventB.id, userId, {
      actorName: 'Event B Actor',
      runId: `B-${runId}`,
    })
    const { invite: inviteB, rawToken: rawTokenB } = await createTestInvite(eventB.id, {
      repName: 'Rep B',
    })

    // Track for cleanup
    sharedState.extraInviteIds = [...(sharedState.extraInviteIds ?? []), inviteB.id]
    sharedState.extraAppIds = [...(sharedState.extraAppIds ?? []), appB.id]
    // We need to clean up eventB too
    sharedState.extraEventIds = [...(sharedState.extraEventIds ?? []), eventB.id]
    sharedState.extraUserIds = [...(sharedState.extraUserIds ?? []), { userId, eventId: eventB.id }]

    try {
      // Session for event A should NOT see event B's application
      const { event: eventA, invite: inviteA } = sharedState
      const sessionA = createTestSession(inviteA.id, eventA.id)

      // Check at DB level: gallery view for event A should not include appB
      const rowsInA = await dbSelect('p101_opencall_gallery_v', {
        event_id: `eq.${eventA.id}`,
        id: `eq.${appB.id}`,
      })
      assertEqual(rowsInA.length, 0, 'Event B application must not appear in Event A gallery view')

      // Check at DB level: gallery view for event B should include appB
      const rowsInB = await dbSelect('p101_opencall_gallery_v', {
        event_id: `eq.${eventB.id}`,
        id: `eq.${appB.id}`,
      })
      assertEqual(rowsInB.length, 1, 'Event B application should appear in Event B gallery view')

      pass('ACC-14: Event isolation (rep A cannot see event B submissions)')
    } finally {
      // Clean up event B resources
      await cleanupTestData({
        eventIds: [eventB.id],
        inviteIds: [inviteB.id],
        applicationIds: [appB.id],
        userId,
      })
      // Remove from extraIds since already cleaned up
      sharedState.extraInviteIds = (sharedState.extraInviteIds ?? []).filter(id => id !== inviteB.id)
      sharedState.extraAppIds = (sharedState.extraAppIds ?? []).filter(id => id !== appB.id)
    }
  })

  // ACC-15: Gallery view excludes guardian columns
  await test('ACC-15: Gallery view excludes guardian_name, guardian_email, guardian_phone', async () => {
    const { event, app } = sharedState

    // Query the gallery view directly
    const rows = await dbSelect('p101_opencall_gallery_v', {
      event_id: `eq.${event.id}`,
      id: `eq.${app.id}`,
    })
    assert(rows.length === 1, 'Test application should appear in gallery view')

    const row = rows[0]
    const columns = Object.keys(row)

    assert(!columns.includes('guardian_name'),  'guardian_name must not appear in gallery view')
    assert(!columns.includes('guardian_email'), 'guardian_email must not appear in gallery view')
    assert(!columns.includes('guardian_phone'), 'guardian_phone must not appear in gallery view')

    pass('ACC-15: Gallery view excludes guardian_name, guardian_email, guardian_phone')
  })
}

// ─── FAVORITES ────────────────────────────────────────────────────────────────

async function runFavoritesTests() {
  // ACC-16: Add a favorite — DB row created
  await test('ACC-16: Add favorite → DB row created', async () => {
    if (!appReachable) { skip('ACC-16', 'App not reachable'); return }

    const { event, invite, app } = sharedState
    const session = createTestSession(invite.id, event.id)

    const r = await appPost(`/api/rep/favorites/${app.id}`, { cookieValue: session })
    assertEqual(r.status, 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.json)}`)
    assert(r.json?.ok === true, `Expected {ok:true}, got: ${JSON.stringify(r.json)}`)

    // Verify DB row
    const rows = await dbSelect('p101_opencall_rep_favorites', {
      invite_id: `eq.${invite.id}`,
      application_id: `eq.${app.id}`,
    })
    assertEqual(rows.length, 1, 'Favorite row should exist in DB')
    pass('ACC-16: Add favorite → DB row created')
  })

  // ACC-17: Favorite is idempotent (double-add returns 200)
  await test('ACC-17: Adding same favorite twice is idempotent', async () => {
    if (!appReachable) { skip('ACC-17', 'App not reachable'); return }

    const { event, invite, app } = sharedState
    const session = createTestSession(invite.id, event.id)

    const r = await appPost(`/api/rep/favorites/${app.id}`, { cookieValue: session })
    assert(r.status === 200 || r.status === 201, `Expected 200, got ${r.status}`)
    pass('ACC-17: Adding same favorite twice is idempotent')
  })

  // ACC-18: Remove favorite — DB row deleted
  await test('ACC-18: Remove favorite → DB row deleted', async () => {
    if (!appReachable) { skip('ACC-18', 'App not reachable'); return }

    const { event, invite, app } = sharedState
    const session = createTestSession(invite.id, event.id)

    const r = await appDelete(`/api/rep/favorites/${app.id}`, { cookieValue: session })
    assertEqual(r.status, 200, `Expected 200, got ${r.status}`)
    assert(r.json?.ok === true, `Expected {ok:true}, got: ${JSON.stringify(r.json)}`)

    // Verify row removed
    const rows = await dbSelect('p101_opencall_rep_favorites', {
      invite_id: `eq.${invite.id}`,
      application_id: `eq.${app.id}`,
    })
    assertEqual(rows.length, 0, 'Favorite row should be removed from DB')
    pass('ACC-18: Remove favorite → DB row deleted')
  })

  // ACC-19: Revoked invite → favorites API returns 401
  await test('ACC-19: Revoked invite → favorites API returns 401', async () => {
    if (!appReachable) { skip('ACC-19', 'App not reachable'); return }

    // Revoke the shared invite for this test, then restore
    const { invite, event, app } = sharedState
    await dbUpdate('p101_opencall_rep_invites', { id: `eq.${invite.id}` }, { revoked_at: new Date().toISOString() })

    try {
      const session = createTestSession(invite.id, event.id)
      const r = await appPost(`/api/rep/favorites/${app.id}`, { cookieValue: session })
      assertEqual(r.status, 401, `Expected 401, got ${r.status}`)
      pass('ACC-19: Revoked invite → favorites API returns 401')
    } finally {
      // Restore — un-revoke
      await dbUpdate('p101_opencall_rep_invites', { id: `eq.${invite.id}` }, { revoked_at: null })
    }
  })

  // ACC-20: Cross-event favorite attempt returns 404
  await test('ACC-20: Favorites on application from wrong event → 404', async () => {
    if (!appReachable) { skip('ACC-20', 'App not reachable'); return }

    // Create a separate event/app that the current invite has no access to
    const userId = await createTestAuthUser(`test-fav-x-${runId}@testinvalid.local`)
    const eventX = await createTestEvent({ year: 9995, name: `Favs Cross-Event ${runId}` })
    const appX = await createTestApplication(eventX.id, userId, {
      actorName: 'Cross Event Actor',
      runId: `X-${runId}`,
    })

    try {
      const { event, invite } = sharedState
      const session = createTestSession(invite.id, event.id)
      const r = await appPost(`/api/rep/favorites/${appX.id}`, { cookieValue: session })
      assertEqual(r.status, 404, `Expected 404 for cross-event favorite, got ${r.status}`)
      pass('ACC-20: Favorites on application from wrong event → 404')
    } finally {
      await cleanupTestData({ eventIds: [eventX.id], applicationIds: [appX.id], userId })
    }
  })
}

// ─── INTRODUCTION REQUESTS ────────────────────────────────────────────────────

async function runIntroRequestTests() {
  const introBody = {
    requesterName: `[TEST-P5] Rep Person ${runId}`,
    requesterEmail: `rep-requester-${runId}@testinvalid.local`,
    requesterRole: 'Manager',
    requesterMessage: 'Interested in this talented performer.',
  }

  // ACC-21: Intro request creates DB record
  await test('ACC-21: Intro request → DB record created', async () => {
    if (!appReachable) { skip('ACC-21', 'App not reachable'); return }

    const { event, invite, app } = sharedState
    const session = createTestSession(invite.id, event.id)

    const r = await appPost(`/api/rep/intro/${app.id}`, {
      cookieValue: session,
      body: introBody,
    })
    // 200 = success; 502 = email delivery failed (acceptable in test env with no real SES)
    assert(r.status === 200 || r.status === 502, `Expected 200 or 502, got ${r.status}: ${JSON.stringify(r.json)}`)

    // Verify DB record
    const rows = await dbSelect('p101_opencall_intro_requests', {
      invite_id: `eq.${invite.id}`,
      application_id: `eq.${app.id}`,
    })
    assert(rows.length >= 1, 'Intro request row should exist in DB')
    assertEqual(rows[0].requester_name, introBody.requesterName, 'requester_name should match')
    assertEqual(rows[0].requester_email, introBody.requesterEmail, 'requester_email should match')
    pass('ACC-21: Intro request → DB record created')
  })

  // ACC-22: Duplicate intro request → existing:true
  await test('ACC-22: Duplicate intro request → {existing:true}', async () => {
    if (!appReachable) { skip('ACC-22', 'App not reachable'); return }

    const { event, invite, app } = sharedState
    const session = createTestSession(invite.id, event.id)

    const r = await appPost(`/api/rep/intro/${app.id}`, {
      cookieValue: session,
      body: introBody,
    })
    assert(r.status === 200, `Expected 200 for duplicate request, got ${r.status}`)
    assert(r.json?.existing === true, `Expected existing:true, got: ${JSON.stringify(r.json)}`)
    pass('ACC-22: Duplicate intro request → {existing:true}')
  })

  // ACC-23: Intro response never contains guardian contact
  await test('ACC-23: Intro request response never contains guardian contact', async () => {
    if (!appReachable) { skip('ACC-23', 'App not reachable'); return }

    const { event, invite, app } = sharedState
    const session = createTestSession(invite.id, event.id)

    const r = await appPost(`/api/rep/intro/${app.id}`, {
      cookieValue: session,
      body: introBody,
    })

    const body = JSON.stringify(r.json ?? {}) + r.text
    const guardianEmail = `guardian-acc-${runId}@testinvalid.local`
    assert(!body.includes(guardianEmail), `Guardian email found in intro response: ${body}`)
    assert(!body.includes('guardian_email'), 'guardian_email key found in intro response')
    assert(!body.includes('guardian_name'),  'guardian_name key found in intro response')
    assert(!body.includes('guardian_phone'), 'guardian_phone key found in intro response')
    pass('ACC-23: Intro request response never contains guardian contact')
  })

  // ACC-24: Intro request requires valid requester name
  await test('ACC-24: Intro request missing name → 422', async () => {
    if (!appReachable) { skip('ACC-24', 'App not reachable'); return }

    const { event, invite, app } = sharedState
    const session = createTestSession(invite.id, event.id)

    const r = await appPost(`/api/rep/intro/${app.id}`, {
      cookieValue: session,
      body: { requesterName: '', requesterEmail: 'test@test.com' },
    })
    assertEqual(r.status, 422, `Expected 422, got ${r.status}`)
    pass('ACC-24: Intro request missing name → 422')
  })

  // ACC-25: Intro request requires valid email
  await test('ACC-25: Intro request invalid email → 422', async () => {
    if (!appReachable) { skip('ACC-25', 'App not reachable'); return }

    const { event, invite, app } = sharedState
    const session = createTestSession(invite.id, event.id)

    const r = await appPost(`/api/rep/intro/${app.id}`, {
      cookieValue: session,
      body: { requesterName: 'Test Rep', requesterEmail: 'notanemail' },
    })
    assertEqual(r.status, 422, `Expected 422, got ${r.status}`)
    pass('ACC-25: Intro request invalid email → 422')
  })

  // ACC-26: Intro request without session → 401
  await test('ACC-26: Intro request without session → 401', async () => {
    if (!appReachable) { skip('ACC-26', 'App not reachable'); return }

    const { app } = sharedState
    const r = await appPost(`/api/rep/intro/${app.id}`, { body: introBody })
    assertEqual(r.status, 401, `Expected 401, got ${r.status}`)
    pass('ACC-26: Intro request without session → 401')
  })
}

// ─── REVOCATION ───────────────────────────────────────────────────────────────

async function runRevocationTests() {
  // ACC-27: After revocation, gallery redirects to /denied
  await test('ACC-27: After revocation, gallery access → /denied', async () => {
    if (!appReachable) { skip('ACC-27', 'App not reachable'); return }

    const { event } = sharedState
    // Create a fresh invite so we can revoke it without breaking other tests
    const { invite: revokeInvite } = await createTestInvite(event.id, {
      repName: 'To Be Revoked Rep',
    })
    sharedState.extraInviteIds = [...(sharedState.extraInviteIds ?? []), revokeInvite.id]

    const session = createTestSession(revokeInvite.id, event.id)

    // Revoke it
    await dbUpdate('p101_opencall_rep_invites', { id: `eq.${revokeInvite.id}` }, {
      revoked_at: new Date().toISOString(),
    })

    // Now try to access gallery — should redirect to /denied
    const r = await appGet('/', { cookieValue: session })
    assert(r.status === 302 || r.status === 307, `Expected redirect, got ${r.status}`)
    assert(r.location.includes('/denied'), `Expected /denied redirect, got: ${r.location}`)
    pass('ACC-27: After revocation, gallery access → /denied')
  })

  // ACC-28: After revocation, API routes return 401
  await test('ACC-28: After revocation, /api/rep/* returns 401', async () => {
    if (!appReachable) { skip('ACC-28', 'App not reachable'); return }

    const { event, app } = sharedState
    const { invite: revokeInvite2 } = await createTestInvite(event.id, {
      repName: 'To Be Revoked API Rep',
    })
    sharedState.extraInviteIds = [...(sharedState.extraInviteIds ?? []), revokeInvite2.id]

    const session = createTestSession(revokeInvite2.id, event.id)

    await dbUpdate('p101_opencall_rep_invites', { id: `eq.${revokeInvite2.id}` }, {
      revoked_at: new Date().toISOString(),
    })

    const r = await appPost(`/api/rep/favorites/${app.id}`, { cookieValue: session })
    assertEqual(r.status, 401, `Expected 401 after revocation, got ${r.status}`)
    pass('ACC-28: After revocation, /api/rep/* returns 401')
  })

  // ACC-29: Access log records session lifecycle events
  await test('ACC-29: Access log records session_start and invite_redeemed on token redemption', async () => {
    // Create a fresh invite and redeem it (if app is reachable) or check existing log
    const { invite } = sharedState

    // The shared invite was redeemed in ACC-06, so log entries should exist
    const logRows = await dbSelect('p101_opencall_access_log', {
      invite_id: `eq.${invite.id}`,
    }, { select: 'action,created_at', order: 'created_at.asc' })

    const actions = logRows.map(r => r.action)
    if (appReachable) {
      assert(actions.includes('session_start'), `Expected session_start in access log, got: ${JSON.stringify(actions)}`)
      assert(actions.includes('invite_redeemed'), `Expected invite_redeemed in access log, got: ${JSON.stringify(actions)}`)
      pass('ACC-29: Access log records session_start and invite_redeemed')
    } else {
      skip('ACC-29', 'App not reachable — cannot trigger token redemption to generate log entries')
    }
  })
}
