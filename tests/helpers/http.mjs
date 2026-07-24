/**
 * HTTP helpers for Phase 5 tests.
 * All requests target TEST_BASE_URL (the running Next.js app).
 */

import { TEST_BASE_URL } from './env.mjs'
import { COOKIE_NAME } from './session.mjs'

/**
 * Make a GET request to the app, returning response info.
 * Does NOT follow redirects — returns raw 3xx with Location header.
 */
export async function appGet(path, { cookieValue = null, headers = {} } = {}) {
  const url = `${TEST_BASE_URL}${path}`
  const reqHeaders = { ...headers }
  if (cookieValue) reqHeaders['Cookie'] = `${COOKIE_NAME}=${cookieValue}`

  const start = Date.now()
  const res = await fetch(url, {
    redirect: 'manual',
    headers: reqHeaders,
  })
  const elapsed = Date.now() - start

  return {
    status: res.status,
    location: res.headers.get('location') ?? '',
    headers: res.headers,
    elapsed,
    text: async () => res.text(),
    json: async () => {
      const t = await res.text()
      try { return JSON.parse(t) } catch { return null }
    },
  }
}

/**
 * Follow a redirect chain up to `maxRedirects` hops, returning the final response.
 * Preserves the session cookie across hops.
 */
export async function appGetFollow(path, { cookieValue = null, maxRedirects = 5 } = {}) {
  let currentPath = path
  let currentCookie = cookieValue
  let hops = 0

  while (hops < maxRedirects) {
    const res = await appGet(currentPath, { cookieValue: currentCookie })

    // Collect any new cookie from the response
    const setCookie = res.headers.get('set-cookie') ?? ''
    const cookieMatch = setCookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`))
    if (cookieMatch) currentCookie = cookieMatch[1]

    if (res.status >= 300 && res.status < 400 && res.location) {
      // Parse the location — may be absolute or relative
      const loc = res.location
      if (loc.startsWith('http')) {
        const u = new URL(loc)
        currentPath = u.pathname + u.search
      } else {
        currentPath = loc
      }
      hops++
      continue
    }

    return { res, finalPath: currentPath, cookie: currentCookie }
  }

  throw new Error(`Too many redirects from ${path}`)
}

/**
 * POST to a rep API endpoint.
 */
export async function appPost(path, { cookieValue = null, body = null, headers = {} } = {}) {
  const url = `${TEST_BASE_URL}${path}`
  const reqHeaders = { 'Content-Type': 'application/json', ...headers }
  if (cookieValue) reqHeaders['Cookie'] = `${COOKIE_NAME}=${cookieValue}`

  const start = Date.now()
  const res = await fetch(url, {
    method: 'POST',
    redirect: 'manual',
    headers: reqHeaders,
    body: body != null ? JSON.stringify(body) : undefined,
  })
  const elapsed = Date.now() - start
  const text = await res.text()

  let json = null
  try { json = JSON.parse(text) } catch { /* not json */ }

  return { status: res.status, json, text, elapsed, headers: res.headers }
}

/**
 * DELETE to a rep API endpoint.
 */
export async function appDelete(path, { cookieValue = null } = {}) {
  const url = `${TEST_BASE_URL}${path}`
  const reqHeaders = {}
  if (cookieValue) reqHeaders['Cookie'] = `${COOKIE_NAME}=${cookieValue}`

  const start = Date.now()
  const res = await fetch(url, {
    method: 'DELETE',
    redirect: 'manual',
    headers: reqHeaders,
  })
  const elapsed = Date.now() - start
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* not json */ }

  return { status: res.status, json, text, elapsed }
}

/**
 * Check if the talentsearch app is reachable and responding correctly.
 *
 * We distinguish "some app is running" from "talentsearch is running" by
 * hitting /access without a token — talentsearch redirects to /denied?r=invalid,
 * while any other app returns 404 or 200.
 *
 * Returns true only if talentsearch is confirmed to be the running app.
 */
export async function isAppReachable() {
  try {
    // GET /access without a token — talentsearch returns 302 to /denied?r=invalid
    const res = await fetch(`${TEST_BASE_URL}/access`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
    })
    if (res.status === 302 || res.status === 307) {
      const loc = res.headers.get('location') ?? ''
      if (loc.includes('/denied')) return true
    }
    // Also accept the /denied page returning 200 (empty token = redirect to denied)
    // If /access returns 404, we're talking to the wrong app
    if (res.status === 404) {
      process.stderr.write(
        `\n[test] WARNING: ${TEST_BASE_URL}/access returned 404.\n` +
        `       This is likely a different Next.js app (e.g. pages101-web).\n` +
        `       Start the talentsearch dev server:\n` +
        `         cd talentsearch && npm run dev\n` +
        `       Or set TEST_BASE_URL to the Vercel preview URL.\n\n`
      )
      return false
    }
    return false
  } catch {
    return false
  }
}

/**
 * Measure a repeated operation.
 * Returns { p50, p95, p99, min, max, mean, samples }
 */
export async function measure(label, n, fn) {
  const times = []
  for (let i = 0; i < n; i++) {
    const start = Date.now()
    await fn()
    times.push(Date.now() - start)
  }
  times.sort((a, b) => a - b)
  const mean = Math.round(times.reduce((s, t) => s + t, 0) / times.length)
  const p = (pct) => times[Math.floor(times.length * pct / 100)] ?? times[times.length - 1]
  return {
    label,
    n,
    min: times[0],
    max: times[times.length - 1],
    mean,
    p50: p(50),
    p95: p(95),
    p99: p(99),
    samples: times,
  }
}
