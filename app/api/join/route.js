// POST /api/join — rep self-registration via a reusable registration link.
//
// Body: { g, name, email, agency, role, website? }
// - Validates the registration link (never grants a session itself).
// - Dedupes by (event, email): an existing non-revoked invite gets its token
//   rotated and re-sent instead of creating a duplicate row. A revoked invite
//   for that email is refused.
// - Otherwise mints a PERSONAL invite (registered_via = link.id), auto-approved,
//   expiring with the registration link, and emails the access link. The raw
//   token is never stored and never returned to the browser.

import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { validateRegistrationToken, hashToken } from '../../../lib/registration'
import {
  findInviteByEmail,
  createRegisteredInvite,
  rotateInviteToken,
  logAccess,
} from '../../../lib/supabase-p101'
import { sendEmail, buildRepInviteHtml } from '../../../lib/email'

export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function str(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  // Honeypot filled → pretend success, send nothing.
  if (str(body.website, 10)) {
    return NextResponse.json({ ok: true })
  }

  const result = await validateRegistrationToken(str(body.g, 512))
  if (!result.ok) {
    const msg = {
      disabled: 'This registration link has been turned off.',
      expired: 'This registration link has expired.',
      closed: 'The review period for this Open Call has closed.',
    }[result.reason] ?? 'This registration link is not valid.'
    return NextResponse.json({ error: msg }, { status: 403 })
  }
  const { link, event } = result

  const name = str(body.name, 120)
  const email = str(body.email, 254).toLowerCase()
  const agency = str(body.agency, 200)
  const role = str(body.role, 120)

  if (name.length < 2) return NextResponse.json({ error: 'Please enter your full name.' }, { status: 400 })
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Please enter a valid work email address.' }, { status: 400 })
  if (agency.length < 2) return NextResponse.json({ error: 'Please enter your agency or company.' }, { status: 400 })

  const rawToken = randomBytes(32).toString('base64url')
  const tokenHash = hashToken(rawToken)

  // ─── Dedupe on (event, email) ────────────────────────────────────────────
  let invite
  let existing = false
  try {
    const prior = await findInviteByEmail(event.id, email)
    if (prior) {
      if (prior.revoked_at) {
        return NextResponse.json(
          { error: 'Access for this email address has been closed. Contact info@childactor101.com if you believe this is an error.' },
          { status: 403 }
        )
      }
      // Rotate the token and refresh the expiry so a stale/expired invite comes back to life.
      await rotateInviteToken(prior.id, tokenHash, {
        expires_at: link.expires_at,
        rep_name: prior.rep_name || name,
        rep_agency: prior.rep_agency || agency,
        rep_role: role || null,
      })
      invite = { ...prior, rep_name: prior.rep_name || name, expires_at: link.expires_at }
      existing = true
    } else {
      invite = await createRegisteredInvite({
        event_id: event.id,
        rep_name: name,
        rep_email: email,
        rep_agency: agency,
        rep_role: role || null,
        token_hash: tokenHash,
        expires_at: link.expires_at,
        registered_via: link.id,
      })
      if (!invite) throw new Error('insert returned no row')
    }
  } catch (err) {
    console.error('Registration failed:', err.message)
    return NextResponse.json({ error: 'We could not complete your registration. Please try again.' }, { status: 500 })
  }

  // ─── Email the personal access link ──────────────────────────────────────
  const base = process.env.TALENTSEARCH_BASE_URL?.replace(/\/$/, '') || new URL(request.url).origin
  const inviteUrl = `${base}/access?t=${encodeURIComponent(rawToken)}`

  try {
    await sendEmail({
      to: email,
      replyTo: 'info@childactor101.com',
      subject: 'Your Child Actor 101 Open Call access link',
      html: buildRepInviteHtml({
        repName: invite.rep_name,
        eventName: event.name,
        inviteUrl,
        expiresAt: link.expires_at,
        reviewClose: event.review_close,
        sourceName: link.source_name,
      }),
    })
  } catch (err) {
    console.error('Registration email failed:', err.message)
    return NextResponse.json(
      { error: 'We registered you but could not send the email. Please contact info@childactor101.com.' },
      { status: 502 }
    )
  }

  try {
    await logAccess({
      invite_id: invite.id,
      event_id: event.id,
      action: existing ? 'registration_resent' : 'rep_registered',
    })
  } catch (err) {
    console.error('Registration log failed:', err.message)
  }

  return NextResponse.json({ ok: true, existing })
}
