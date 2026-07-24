/**
 * Session creation helpers for Phase 5 tests.
 * Duplicates the HMAC signing logic from lib/session.js so the tests
 * have no module-resolution dependency on the Next.js source tree.
 */

import { createHmac } from 'node:crypto'
import { requireEnv } from './env.mjs'

export const COOKIE_NAME = '__rep'

/**
 * Sign a session payload with HMAC-SHA256.
 * Returns the cookie value: base64url(payload).base64url(sig)
 */
export function signSession(payload, secret) {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', secret).update(payloadB64).digest('base64url')
  return `${payloadB64}.${sig}`
}

/**
 * Create a valid signed session cookie value for a given invite.
 * TTL defaults to 1 hour.
 */
export function createTestSession(inviteId, eventId, opts = {}) {
  const secret = requireEnv('TALENTSEARCH_SESSION_SECRET')
  const now = Math.floor(Date.now() / 1000)
  const ttl = opts.ttlSeconds ?? 3600
  const exp = opts.exp ?? now + ttl

  const payload = {
    iid: inviteId,
    eid: eventId,
    rn: opts.repName ?? '[TEST-P5] Jane Testington',
    ra: opts.repAgency ?? 'Test Agency P5',
    iat: now,
    exp,
  }

  return signSession(payload, secret)
}

/**
 * Create an EXPIRED session (exp = now - 60).
 */
export function createExpiredSession(inviteId, eventId) {
  const secret = requireEnv('TALENTSEARCH_SESSION_SECRET')
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iid: inviteId,
    eid: eventId,
    rn: '[TEST-P5] Expired Rep',
    iat: now - 7200,
    exp: now - 60,
  }
  return signSession(payload, secret)
}

/**
 * Create a tampered session — valid payload but corrupted signature.
 */
export function createTamperedSession(inviteId, eventId) {
  const valid = createTestSession(inviteId, eventId)
  const [payloadB64] = valid.split('.')
  return `${payloadB64}.INVALIDSIGNATUREXXXXXXXXXX`
}

/**
 * Build a cookie header string from a cookie value.
 */
export function cookieHeader(value) {
  return `${COOKIE_NAME}=${value}`
}
