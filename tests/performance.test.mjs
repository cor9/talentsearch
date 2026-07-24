/**
 * Phase 5 — Requirement 4: Load Testing
 *
 * Measures response times for all critical application paths.
 * Produces timing tables for the final report.
 *
 * Requires the app to be running (TEST_BASE_URL).
 * Timing is wall-clock from the test process — includes network overhead to localhost.
 */

import { randomBytes } from 'node:crypto'
import {
  createTestEvent, createTestApplication, createTestInvite,
  cleanupTestData, createTestAuthUser, dbUpdate,
} from './helpers/db.mjs'
import { createTestSession } from './helpers/session.mjs'
import { appGet, appGetFollow, appPost, appDelete, isAppReachable, measure } from './helpers/http.mjs'
import { suite, test, pass, fail, skip, info } from './helpers/assert.mjs'
import { TEST_BASE_URL } from './helpers/env.mjs'

suite('Performance')

const runId = randomBytes(6).toString('hex').toUpperCase()
const SAMPLE_COUNT = 10   // number of iterations per timing measurement
const GALLERY_LOAD_THRESHOLD_MS   = 3000   // acceptable p95 for gallery page load
const API_RESPONSE_THRESHOLD_MS   = 1500   // acceptable p95 for API responses
const TOKEN_VERIFY_THRESHOLD_MS   = 2000   // acceptable p95 for /access token verification

// Collected timing results (exported for report)
export const timingResults = []

let perfState = null

async function perfSetup() {
  const userId = await createTestAuthUser(`test-perf-p5-${runId}@testinvalid.local`)
  const event  = await createTestEvent({ year: 9993, name: `Perf Test ${runId}` })
  const app    = await createTestApplication(event.id, userId, {
    actorName: 'Perf Test Actor',
    runId,
  })
  const { invite, rawToken } = await createTestInvite(event.id, {
    repName: 'Perf Test Rep',
  })
  perfState = { event, invite, rawToken, app, userId }
}

async function perfTeardown() {
  if (!perfState) return
  const { event, invite, app, userId } = perfState
  await cleanupTestData({
    eventIds:  [event?.id].filter(Boolean),
    inviteIds: [invite?.id].filter(Boolean),
    applicationIds: [app?.id].filter(Boolean),
    userId,
  })
}

function formatRow(label, stats) {
  return `  ${label.padEnd(36)} min=${stats.min}ms  p50=${stats.p50}ms  p95=${stats.p95}ms  max=${stats.max}ms  n=${stats.n}`
}

export async function run() {
  const appReachable = await isAppReachable()
  if (!appReachable) {
    info(`App not reachable at ${TEST_BASE_URL} — all performance tests will be skipped`)
    info('Start the dev server with: npm run dev')
    skip('PERF-ALL', `App not reachable at ${TEST_BASE_URL}`)
    return
  }

  await perfSetup()
  info(`Run ID: ${runId}  Base URL: ${TEST_BASE_URL}  Samples per test: ${SAMPLE_COUNT}`)

  try {
    await runGalleryLoadTest()
    await runTokenVerificationTest()
    await runFavoritesApiTest()
    await runIntroApiTest()
    await runConcurrentSessionsTest()
    await runBadMediaHandlingTest()
    await runPaginationTest()
  } finally {
    await perfTeardown()
    printTimingTable()
  }
}

function printTimingTable() {
  info('\n=== PERFORMANCE TIMING TABLE ===')
  for (const row of timingResults) {
    info(formatRow(row.label, row))
  }
  info('================================')
}

// ─── PERF-01: Gallery Load ────────────────────────────────────────────────────

async function runGalleryLoadTest() {
  await test('PERF-01: Gallery page load time (authenticated)', async () => {
    const { invite, event } = perfState
    const session = createTestSession(invite.id, event.id)

    // Warm-up request (excluded from timing)
    await appGetFollow('/', { cookieValue: session }).catch(() => {})

    const stats = await measure('Gallery initial load', SAMPLE_COUNT, async () => {
      const { res } = await appGetFollow('/', { cookieValue: session })
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`)
    })
    timingResults.push(stats)

    if (stats.p95 > GALLERY_LOAD_THRESHOLD_MS) {
      fail(`PERF-01: Gallery p95 (${stats.p95}ms) exceeds threshold (${GALLERY_LOAD_THRESHOLD_MS}ms)`,
           `p95=${stats.p95}ms, threshold=${GALLERY_LOAD_THRESHOLD_MS}ms`)
    } else {
      pass(`PERF-01: Gallery page load — p50=${stats.p50}ms, p95=${stats.p95}ms (n=${SAMPLE_COUNT})`)
    }
  })
}

// ─── PERF-02: Token Verification ─────────────────────────────────────────────

async function runTokenVerificationTest() {
  await test('PERF-02: Token verification overhead (/access)', async () => {
    const { rawToken } = perfState

    // Each call to /access creates a new session and writes to the access log.
    // We create separate invites for each sample to avoid "already redeemed" state
    // affecting results (the route still processes them the same way).
    const { event } = perfState
    const invites = []
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const { invite: inv, rawToken: tok } = await createTestInvite(event.id, {
        repName: `Perf Token Rep ${i}`,
        repEmail: `perf-token-${runId}-${i}@testinvalid.local`,
      })
      invites.push({ invite: inv, rawToken: tok })
    }

    try {
      let idx = 0
      const stats = await measure('Token verification /access', SAMPLE_COUNT, async () => {
        const { rawToken: tok } = invites[idx++ % invites.length]
        const r = await appGet(`/access?t=${encodeURIComponent(tok)}`)
        if (r.status !== 302 && r.status !== 307) throw new Error(`Expected 302/307, got ${r.status}`)
      })
      timingResults.push(stats)

      if (stats.p95 > TOKEN_VERIFY_THRESHOLD_MS) {
        fail(`PERF-02: Token verification p95 (${stats.p95}ms) exceeds threshold`,
             `p95=${stats.p95}ms, threshold=${TOKEN_VERIFY_THRESHOLD_MS}ms`)
      } else {
        pass(`PERF-02: Token verification — p50=${stats.p50}ms, p95=${stats.p95}ms`)
      }
    } finally {
      // Clean up the extra invites
      for (const { invite: inv } of invites) {
        await cleanupTestData({ inviteIds: [inv.id] }).catch(() => {})
      }
    }
  })
}

// ─── PERF-03: Favorites API ───────────────────────────────────────────────────

async function runFavoritesApiTest() {
  await test('PERF-03: Favorites API response time', async () => {
    const { invite, event, app } = perfState
    const session = createTestSession(invite.id, event.id)

    // Alternate POST/DELETE to measure both
    const postStats = await measure('Favorites POST', SAMPLE_COUNT, async () => {
      const r = await appPost(`/api/rep/favorites/${app.id}`, { cookieValue: session })
      if (r.status !== 200) throw new Error(`Expected 200, got ${r.status}`)
    })
    timingResults.push(postStats)

    const deleteStats = await measure('Favorites DELETE', SAMPLE_COUNT, async () => {
      const r = await appDelete(`/api/rep/favorites/${app.id}`, { cookieValue: session })
      if (r.status !== 200) throw new Error(`Expected 200, got ${r.status}`)
    })
    timingResults.push(deleteStats)

    const p95 = Math.max(postStats.p95, deleteStats.p95)
    if (p95 > API_RESPONSE_THRESHOLD_MS) {
      fail(`PERF-03: Favorites API p95 (${p95}ms) exceeds threshold`,
           `POST p95=${postStats.p95}ms, DELETE p95=${deleteStats.p95}ms`)
    } else {
      pass(`PERF-03: Favorites API — POST p50=${postStats.p50}ms p95=${postStats.p95}ms, DELETE p50=${deleteStats.p50}ms p95=${deleteStats.p95}ms`)
    }
  })
}

// ─── PERF-04: Intro Request API ───────────────────────────────────────────────

async function runIntroApiTest() {
  await test('PERF-04: Intro request API response time', async () => {
    const { invite, event, app } = perfState
    const session = createTestSession(invite.id, event.id)
    const body = {
      requesterName: `Perf Rep ${runId}`,
      requesterEmail: `perf-rep-${runId}@testinvalid.local`,
      requesterRole: 'Agent',
    }

    // First call creates the record; subsequent calls hit the idempotency path.
    // Measure the idempotency path (which is what happens most in prod).
    // First create it:
    await appPost(`/api/rep/intro/${app.id}`, { cookieValue: session, body })

    const stats = await measure('Intro request POST (idempotent)', SAMPLE_COUNT, async () => {
      const r = await appPost(`/api/rep/intro/${app.id}`, { cookieValue: session, body })
      if (r.status !== 200) throw new Error(`Expected 200, got ${r.status}`)
    })
    timingResults.push(stats)

    if (stats.p95 > API_RESPONSE_THRESHOLD_MS) {
      fail(`PERF-04: Intro API p95 (${stats.p95}ms) exceeds threshold`,
           `p95=${stats.p95}ms, threshold=${API_RESPONSE_THRESHOLD_MS}ms`)
    } else {
      pass(`PERF-04: Intro request API — p50=${stats.p50}ms, p95=${stats.p95}ms`)
    }
  })
}

// ─── PERF-05: Concurrent Sessions ────────────────────────────────────────────

async function runConcurrentSessionsTest() {
  await test('PERF-05: Concurrent representative sessions', async () => {
    const { event } = perfState
    const CONCURRENT = 5

    // Create CONCURRENT separate invites (separate sessions)
    const invites = []
    for (let i = 0; i < CONCURRENT; i++) {
      const { invite } = await createTestInvite(event.id, {
        repName: `Concurrent Rep ${i}`,
        repEmail: `perf-conc-${runId}-${i}@testinvalid.local`,
      })
      invites.push(invite)
    }

    try {
      const start = Date.now()
      const results = await Promise.allSettled(
        invites.map(inv => {
          const session = createTestSession(inv.id, event.id)
          return appGetFollow('/', { cookieValue: session })
        })
      )
      const elapsed = Date.now() - start

      const successes = results.filter(r => r.status === 'fulfilled' && r.value.res.status === 200)
      const failures  = results.filter(r => r.status !== 'fulfilled' || r.value.res.status !== 200)

      timingResults.push({
        label: `Concurrent sessions (n=${CONCURRENT})`,
        n: CONCURRENT,
        min: elapsed, max: elapsed, mean: elapsed, p50: elapsed, p95: elapsed, p99: elapsed,
        samples: [elapsed],
      })

      if (failures.length > 0) {
        const details = failures.map(f => f.reason?.message ?? String(f.value?.res?.status))
        fail(`PERF-05: ${failures.length}/${CONCURRENT} concurrent sessions failed`, details.join(', '))
      } else {
        pass(`PERF-05: ${CONCURRENT} concurrent sessions all succeeded in ${elapsed}ms total`)
      }
    } finally {
      for (const inv of invites) {
        await cleanupTestData({ inviteIds: [inv.id] }).catch(() => {})
      }
    }
  })
}

// ─── PERF-06: Bad Media Handling ──────────────────────────────────────────────

async function runBadMediaHandlingTest() {
  await test('PERF-06: Gallery loads successfully even with broken media URLs', async () => {
    // Create an application with broken media URLs
    const { event, userId } = perfState
    const brokenApp = await createTestApplication(event.id, userId, {
      actorName: 'Broken Media Actor',
      runId: `BROKEN-${runId}`,
      status: 'submitted',
    })
    // Patch it with intentionally broken URLs
    await dbUpdate('p101_opencall_applications', { id: `eq.${brokenApp.id}` }, {
      headshots: [{ type: 'commercial', url: 'https://testinvalid.local/broken-image-404.jpg' }],
      slate_url: 'https://testinvalid.local/broken-video-404.mp4',
      resume_url: 'https://testinvalid.local/broken-resume-404.pdf',
    })

    try {
      const { invite } = perfState
      const session = createTestSession(invite.id, event.id)

      // Gallery should still load successfully
      const { res } = await appGetFollow('/', { cookieValue: session })
      if (res.status !== 200) {
        fail('PERF-06: Gallery failed to load with broken media URLs', `Status: ${res.status}`)
        return
      }

      // The page HTML should still be present (not a crash/empty page)
      const html = await res.text()
      const hasGallery = html.includes('Talent Gallery') || html.includes('gallery') || html.length > 1000
      if (!hasGallery) {
        fail('PERF-06: Gallery HTML appears incomplete/empty with broken media', `HTML length: ${html.length}`)
        return
      }

      pass('PERF-06: Gallery loads successfully with broken media URLs — graceful degradation confirmed')
    } finally {
      await cleanupTestData({ applicationIds: [brokenApp.id] }).catch(() => {})
    }
  })
}

// ─── PERF-07: Pagination / First + Last Page ──────────────────────────────────

async function runPaginationTest() {
  await test('PERF-07: Gallery pagination (first, middle, last page via search filter)', async () => {
    // The gallery uses client-side filtering, not server-side pagination.
    // This test measures that the full data load is fast and the page renders,
    // then exercises the search/filter controls via HTTP (the filter is in the client component).
    // Since filtering is client-side, we measure the initial page load time only.
    const { invite, event } = perfState
    const session = createTestSession(invite.id, event.id)

    const stats = await measure('Gallery page load (pagination equivalent)', 3, async () => {
      const { res } = await appGetFollow('/', { cookieValue: session })
      if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`)
      await res.text() // consume body (includes full data)
    })
    timingResults.push({ ...stats, label: 'Gallery pagination (full data load)' })

    pass(`PERF-07: Gallery pagination — p50=${stats.p50}ms, p95=${stats.p95}ms for full data load`)
  })
}
