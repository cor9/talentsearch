// POST /api/rep/intro/:applicationId — request an introduction to an actor.
// GET  /api/rep/intro/:applicationId — view the family's contact for an
//                                       introduction this invite already requested.
//
// Flow: an invited, authenticated rep affirmatively selects a child → the
// request is recorded with the rep's identity → the family is notified by email
// (with the rep's name, agency, role and email in the body) → the guardian's
// contact is returned to the rep and emailed to them. Families consented to
// "participating representatives contacting me at the email address and phone
// number provided". Every reveal is logged as reveal_guardian_contact.
//
// Rep identity comes from the signed __rep_id cookie once confirmed; the first
// request supplies it in the body and sets the cookie so later requests are
// one click. Contact is never exposed for an application without a request.

import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  verifySession, COOKIE_NAME,
  verifyIdentity, signIdentity, buildIdentityCookie, IDENTITY_COOKIE_NAME,
} from '../../../../../lib/session'
import {
  findInviteById,
  findEventById,
  findApplicationForRep,
  getIntroRequest,
  createIntroRequest,
  updateIntroRequest,
  markContactRevealed,
  logAccess,
} from '../../../../../lib/supabase-p101'
import {
  sendEmail,
  buildGuardianIntroHtml,
  buildRepIntroConfirmHtml,
} from '../../../../../lib/email'

export const dynamic = 'force-dynamic'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function getVerifiedContext() {
  const cookieStore = cookies()
  const sessionValue = cookieStore.get(COOKIE_NAME)?.value
  const secret = process.env.TALENTSEARCH_SESSION_SECRET

  const session = verifySession(sessionValue, secret)
  if (!session) return null

  let invite
  try {
    invite = await findInviteById(session.iid)
  } catch {
    return null
  }
  if (!invite || invite.revoked_at || new Date(invite.expires_at) <= new Date()) return null
  if (invite.event_id !== session.eid) return null

  let event
  try {
    event = await findEventById(session.eid)
  } catch {
    return null
  }
  if (!event || new Date(event.review_close) <= new Date()) return null
  if (!['reviewing', 'open', 'closed'].includes(event.status)) return null

  const identity = verifyIdentity(cookieStore.get(IDENTITY_COOKIE_NAME)?.value, secret, session.iid)
  return { session, invite, event, identity, secret }
}

function contactPayload(app) {
  return {
    guardianName: app.guardian_name ?? '',
    guardianEmail: app.guardian_email ?? '',
    guardianPhone: app.guardian_phone ?? '',
  }
}

// ─── GET: view contact for an existing request ───────────────────────────────

export async function GET(request, { params }) {
  const ctx = await getVerifiedContext()
  if (!ctx) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const { session } = ctx
  const { applicationId } = params

  let existing
  try {
    existing = await getIntroRequest(session.iid, applicationId)
  } catch {
    return Response.json({ error: 'server_error' }, { status: 500 })
  }
  if (!existing) return Response.json({ error: 'not_requested' }, { status: 404 })

  let app
  try {
    app = await findApplicationForRep(applicationId, session.eid)
  } catch {
    return Response.json({ error: 'server_error' }, { status: 500 })
  }
  if (!app) return Response.json({ error: 'not_found' }, { status: 404 })

  await safeLogAccess({ invite_id: session.iid, event_id: session.eid, action: 'reveal_guardian_contact', application_id: applicationId })
  try { await markContactRevealed(existing.id) } catch (err) { console.error('markContactRevealed failed:', err.message) }

  return Response.json({
    ok: true,
    requestedAt: existing.requested_at,
    status: existing.status,
    contact: contactPayload(app),
  })
}

// ─── POST: request an introduction ───────────────────────────────────────────

export async function POST(request, { params }) {
  const ctx = await getVerifiedContext()
  if (!ctx) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const { session, invite, event, secret } = ctx
  const { applicationId } = params

  let body = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  // ─── Resolve requester identity: body (first time / edit) else cookie ─────
  let identity = ctx.identity
  const provided = {
    name: String(body?.requesterName ?? '').trim(),
    email: String(body?.requesterEmail ?? '').trim(),
    role: String(body?.requesterRole ?? '').trim(),
    agency: String(body?.requesterAgency ?? '').trim(),
  }
  const bodyHasIdentity = provided.name || provided.email
  if (bodyHasIdentity) {
    if (!provided.name) return Response.json({ error: 'requester_name_required' }, { status: 422 })
    if (!EMAIL_RE.test(provided.email)) return Response.json({ error: 'requester_email_invalid' }, { status: 422 })
    if (provided.role.length > 120) return Response.json({ error: 'requester_role_too_long' }, { status: 422 })
    if (provided.agency.length > 200) return Response.json({ error: 'requester_agency_too_long' }, { status: 422 })
    identity = { name: provided.name, email: provided.email, role: provided.role, agency: provided.agency }
  }
  if (!identity) return Response.json({ error: 'identity_required' }, { status: 422 })

  const requesterMessage = String(body?.requesterMessage ?? '').trim() || null
  if (requesterMessage && requesterMessage.length > 1000) {
    return Response.json({ error: 'requester_message_too_long' }, { status: 422 })
  }

  // ─── Verify application belongs to this event and is submitted ───────────
  let app
  try {
    app = await findApplicationForRep(applicationId, session.eid)
  } catch {
    return Response.json({ error: 'server_error' }, { status: 500 })
  }
  if (!app) return Response.json({ error: 'not_found' }, { status: 404 })

  const respond = (data, status = 200) => {
    const res = NextResponse.json(data, { status })
    if (bodyHasIdentity) {
      res.cookies.set(buildIdentityCookie(signIdentity({ iid: session.iid, ...identity, iat: Math.floor(Date.now() / 1000) }, secret)))
    }
    return res
  }

  // ─── Idempotent: existing request → return contact again (logged) ────────
  let existing
  try {
    existing = await getIntroRequest(session.iid, applicationId)
  } catch {
    return Response.json({ error: 'server_error' }, { status: 500 })
  }
  if (existing) {
    await safeLogAccess({ invite_id: session.iid, event_id: session.eid, action: 'reveal_guardian_contact', application_id: applicationId })
    return respond({ ok: true, existing: true, status: existing.status, requestedAt: existing.requested_at, contact: contactPayload(app) })
  }

  const eventName = event.name ?? 'Open Call'

  let introReq
  try {
    introReq = await createIntroRequest(session.iid, session.eid, applicationId, {
      name: identity.name,
      email: identity.email,
      role: identity.role || null,
      agency: identity.agency || invite.rep_agency || null,
      message: requesterMessage,
    })
  } catch (err) {
    console.error('createIntroRequest failed:', err.message)
    return Response.json({ error: 'server_error' }, { status: 500 })
  }
  if (!introReq) return Response.json({ error: 'server_error' }, { status: 500 })

  await safeLogAccess({ invite_id: session.iid, event_id: session.eid, action: 'request_introduction', application_id: applicationId })
  await safeLogAccess({ invite_id: session.iid, event_id: session.eid, action: 'reveal_guardian_contact', application_id: applicationId })

  const now = new Date().toISOString()

  // ─── Seed bypass — no external email for fictional test records ──────────
  if (app.is_seed) {
    try {
      await updateIntroRequest(introReq.id, { status: 'sent', guardian_email_sent_at: now, rep_email_sent_at: now, contact_revealed_at: now })
    } catch (err) {
      console.error('updateIntroRequest (seed) failed:', err.message)
    }
    return respond({ ok: true, status: 'sent', simulated: true, requestedAt: now, contact: contactPayload(app) })
  }

  // ─── Notify the family; send the rep a record with the contact ───────────
  let guardianSent = false
  let repSent = false
  let failureCode = null

  try {
    await sendEmail({
      to: app.guardian_email,
      subject: `Good news: a rep would like to connect about ${app.actor_name}`,
      html: buildGuardianIntroHtml({
        actorName: app.actor_name,
        guardianName: app.guardian_name,
        requesterName: identity.name,
        requesterAgency: identity.agency || invite.rep_agency || '',
        requesterRole: identity.role,
        requesterEmail: identity.email,
        requesterMessage,
        eventName,
      }),
      replyTo: identity.email,
    })
    guardianSent = true
  } catch (err) {
    console.error('Guardian intro email failed:', sanitizeEmailError(err))
    failureCode = 'guardian_email_failed'
  }

  try {
    await sendEmail({
      to: identity.email,
      subject: `Introduction requested: ${app.actor_name} — ${eventName}`,
      html: buildRepIntroConfirmHtml({
        requesterName: identity.name,
        actorName: app.actor_name,
        guardianName: app.guardian_name,
        guardianEmail: app.guardian_email,
        guardianPhone: app.guardian_phone,
        eventName,
      }),
      replyTo: 'info@childactor101.com',
    })
    repSent = true
  } catch (err) {
    console.error('Requester intro email failed:', sanitizeEmailError(err))
    if (!failureCode) failureCode = 'requester_email_failed'
  }

  const patch = { contact_revealed_at: now }
  if (guardianSent && repSent) {
    patch.status = 'sent'; patch.guardian_email_sent_at = now; patch.rep_email_sent_at = now
  } else if (guardianSent) {
    patch.status = 'partial_failure'; patch.guardian_email_sent_at = now; patch.failed_at = now; patch.failure_code = failureCode
  } else if (repSent) {
    patch.status = 'partial_failure'; patch.rep_email_sent_at = now; patch.failed_at = now; patch.failure_code = failureCode
  } else {
    patch.status = 'failed'; patch.failed_at = now; patch.failure_code = failureCode
  }
  try {
    await updateIntroRequest(introReq.id, patch)
  } catch (err) {
    console.error('updateIntroRequest failed:', err.message)
  }

  // The request is recorded and the contact is the rep's to use even if the
  // family email bounced; surface the delivery state so the UI can say so.
  return respond({
    ok: true,
    status: patch.status,
    familyNotified: guardianSent,
    requestedAt: now,
    contact: contactPayload(app),
  })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function safeLogAccess(opts) {
  try {
    await logAccess(opts)
  } catch (err) {
    console.error('Access log failed:', err.message)
  }
}

function sanitizeEmailError(err) {
  const msg = String(err?.message ?? err)
  return msg.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '<email>')
}
