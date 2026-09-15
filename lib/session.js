// Representative session — HMAC-SHA256 signed, short-lived.
// Format: base64url(JSON payload) + "." + base64url(HMAC-SHA256 signature)
// The signing secret lives in TALENTSEARCH_SESSION_SECRET (never client-visible).

import { createHmac, timingSafeEqual } from 'crypto'

const COOKIE_NAME = '__rep'

// ─── Sign ─────────────────────────────────────────────────────────────────────

export function signSession(payload, secret) {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', secret).update(payloadB64).digest('base64url')
  return `${payloadB64}.${sig}`
}

// ─── Verify (Node.js runtime — route handlers and server components) ──────────

export function verifySession(cookieValue, secret) {
  if (!cookieValue || !secret) return null

  const parts = cookieValue.split('.')
  if (parts.length !== 2) return null

  const [payloadB64, sigB64] = parts

  try {
    const expectedSig = createHmac('sha256', secret).update(payloadB64).digest('base64url')
    const a = Buffer.from(sigB64 + '='.repeat((4 - sigB64.length % 4) % 4), 'base64')
    const b = Buffer.from(expectedSig + '='.repeat((4 - expectedSig.length % 4) % 4), 'base64')
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  } catch {
    return null
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
    if (!payload.exp || Date.now() / 1000 > payload.exp) return null
    if (!payload.iid || !payload.eid) return null
    return payload
  } catch {
    return null
  }
}

// ─── Build session cookie options ─────────────────────────────────────────────
// TTL is the minimum of 8 hours, invite expiry, and event review close.

export function buildSessionCookie(sessionValue, ttlSeconds) {
  const isProduction = process.env.NODE_ENV === 'production'
  return {
    name: COOKIE_NAME,
    value: sessionValue,
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: ttlSeconds,
  }
}

export { COOKIE_NAME }

// ─── Rep identity cookie ──────────────────────────────────────────────────────
// Confirmed requester identity (name, agency, role, email) so that after the
// first introduction request, every later one is a single click. Signed with
// the session secret and bound to the invite id; lives per browser so an
// office sharing one link can have different people identify themselves.

const IDENTITY_COOKIE_NAME = '__rep_id'
const IDENTITY_TTL_SECONDS = 120 * 24 * 60 * 60

export function signIdentity(identity, secret) {
  return signSession(identity, secret)
}

export function verifyIdentity(cookieValue, secret, inviteId) {
  if (!cookieValue || !secret) return null
  const parts = cookieValue.split('.')
  if (parts.length !== 2) return null
  const [payloadB64, sigB64] = parts
  try {
    const expectedSig = createHmac('sha256', secret).update(payloadB64).digest('base64url')
    const a = Buffer.from(sigB64 + '='.repeat((4 - sigB64.length % 4) % 4), 'base64')
    const b = Buffer.from(expectedSig + '='.repeat((4 - expectedSig.length % 4) % 4), 'base64')
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
    if (!payload || payload.iid !== inviteId) return null
    if (!payload.name || !payload.email) return null
    return {
      name: String(payload.name),
      agency: payload.agency ? String(payload.agency) : '',
      role: payload.role ? String(payload.role) : '',
      email: String(payload.email),
    }
  } catch {
    return null
  }
}

export function buildIdentityCookie(value) {
  const isProduction = process.env.NODE_ENV === 'production'
  return {
    name: IDENTITY_COOKIE_NAME,
    value,
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: IDENTITY_TTL_SECONDS,
  }
}

export { IDENTITY_COOKIE_NAME }
