// Token redemption route: GET /access?t=<raw-token>
// Validates the raw token, creates a signed session cookie, redirects to gallery.
// The raw token is removed from the URL immediately after this redirect.

import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { signSession, buildSessionCookie, COOKIE_NAME } from '../../lib/session'
import {
  findInviteByHash,
  findEventById,
  setInviteRedeemed,
  logAccess,
} from '../../lib/supabase-p101'

export const dynamic = 'force-dynamic'

// Maximum session TTL: 8 hours
const SESSION_TTL_SECONDS = 8 * 60 * 60

export async function GET(request) {
  const url = new URL(request.url)
  const rawToken = url.searchParams.get('t')

  // ─── 1. Basic format validation ──────────────────────────────────────────
  if (!rawToken || rawToken.length < 16 || rawToken.length > 512) {
    return buildDeniedRedirect(request, 'invalid')
  }

  // ─── 2. Hash the token ───────────────────────────────────────────────────
  let tokenHash
  try {
    tokenHash = createHash('sha256').update(rawToken, 'utf8').digest('hex')
  } catch {
    return buildDeniedRedirect(request, 'invalid')
  }

  // ─── 3. Look up invite ───────────────────────────────────────────────────
  let invite
  try {
    invite = await findInviteByHash(tokenHash)
  } catch (err) {
    console.error('Invite lookup failed:', err.message)
    return buildDeniedRedirect(request, 'error')
  }

  if (!invite) {
    // Unknown token — don't log (no invite_id to attribute it to)
    return buildDeniedRedirect(request, 'unknown')
  }

  const now = new Date()

  // ─── 4. Check revocation ─────────────────────────────────────────────────
  if (invite.revoked_at) {
    await safeLog({ invite_id: invite.id, event_id: invite.event_id, action: 'access_denied' })
    return buildDeniedRedirect(request, 'revoked')
  }

  // ─── 5. Check invite expiry ──────────────────────────────────────────────
  if (new Date(invite.expires_at) <= now) {
    await safeLog({ invite_id: invite.id, event_id: invite.event_id, action: 'access_denied' })
    return buildDeniedRedirect(request, 'expired')
  }

  // ─── 6. Check event status ───────────────────────────────────────────────
  let event
  try {
    event = await findEventById(invite.event_id)
  } catch (err) {
    console.error('Event lookup failed:', err.message)
    return buildDeniedRedirect(request, 'error')
  }

  if (!event) {
    return buildDeniedRedirect(request, 'error')
  }

  if (new Date(event.review_close) <= now) {
    await safeLog({ invite_id: invite.id, event_id: invite.event_id, action: 'access_denied' })
    return buildDeniedRedirect(request, 'closed')
  }

  if (!['reviewing', 'open', 'closed'].includes(event.status)) {
    // Draft events are not accessible to reps
    return buildDeniedRedirect(request, 'unavailable')
  }

  // ─── 7. Mark as redeemed (first time only) ───────────────────────────────
  const isFirstRedemption = !invite.redeemed_at
  try {
    await setInviteRedeemed(invite.id, isFirstRedemption)
  } catch (err) {
    console.error('Failed to mark redeemed_at:', err.message)
    // Non-fatal — continue
  }

  // ─── 8. Log invite_redeemed and session_start ────────────────────────────
  const logOpts = { invite_id: invite.id, event_id: invite.event_id }
  await Promise.all([
    safeLog({ ...logOpts, action: 'invite_redeemed' }),
    safeLog({ ...logOpts, action: 'session_start' }),
  ])

  // ─── 9. Build signed session ─────────────────────────────────────────────
  const secret = process.env.TALENTSEARCH_SESSION_SECRET
  if (!secret) {
    console.error('TALENTSEARCH_SESSION_SECRET is not set')
    return buildDeniedRedirect(request, 'error')
  }

  // Effective expiry = min(SESSION_TTL, invite.expires_at, event.review_close)
  const expiresAtMs = Math.min(
    now.getTime() + SESSION_TTL_SECONDS * 1000,
    new Date(invite.expires_at).getTime(),
    new Date(event.review_close).getTime()
  )
  const ttlSeconds = Math.max(0, Math.floor((expiresAtMs - now.getTime()) / 1000))

  if (ttlSeconds <= 0) {
    return buildDeniedRedirect(request, 'expired')
  }

  const payload = {
    iid: invite.id,        // invite_id
    eid: invite.event_id,  // event_id
    rn: invite.rep_name,   // invite recipient name (display only — not verified viewer identity)
    ra: invite.rep_agency, // agency / company (display only, may be null)
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor(expiresAtMs / 1000),
  }

  const sessionValue = signSession(payload, secret)
  const cookieOpts = buildSessionCookie(sessionValue, ttlSeconds)

  // ─── 10. Redirect to gallery — token removed from URL ────────────────────
  const galleryUrl = new URL('/', request.url)
  const response = NextResponse.redirect(galleryUrl, { status: 302 })

  response.cookies.set(cookieOpts)

  return response
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildDeniedRedirect(request, reason) {
  const denied = new URL('/denied', request.url)
  denied.searchParams.set('r', reason)
  return NextResponse.redirect(denied, { status: 302 })
}

async function safeLog(opts) {
  try {
    await logAccess(opts)
  } catch (err) {
    console.error('Access log failed:', err.message)
  }
}
