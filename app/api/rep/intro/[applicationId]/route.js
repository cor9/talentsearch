// POST /api/rep/intro/:applicationId — request an introduction to an actor.
//
// Collects and stores the actual requester's identity (name, email, optional role
// and message). The invite link may be shared within an office, so the form is
// prefilled from the invite but must be confirmed/edited by the viewer.
//
// Idempotent: if a request already exists for (invite, application), returns
// the existing record without resending emails.
//
// Guardian contact is never returned in the response.

import { cookies } from 'next/headers'
import { verifySession, COOKIE_NAME } from '../../../../../lib/session'
import {
  findInviteById,
  findEventById,
  findApplicationForRep,
  getIntroRequest,
  createIntroRequest,
  updateIntroRequest,
  logAccess,
} from '../../../../../lib/supabase-p101'
import {
  sendEmail,
  buildGuardianIntroHtml,
  buildRepIntroConfirmHtml,
} from '../../../../../lib/email'

export const dynamic = 'force-dynamic'

async function getVerifiedSession() {
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

  if (!invite || invite.revoked_at || new Date(invite.expires_at) <= new Date()) {
    return null
  }
  if (invite.event_id !== session.eid) return null

  // Event review window check
  let event
  try {
    event = await findEventById(session.eid)
  } catch {
    return null
  }

  if (!event || new Date(event.review_close) <= new Date()) return null
  if (!['reviewing', 'open', 'closed'].includes(event.status)) return null

  return { session, invite, event }
}

export async function POST(request, { params }) {
  const verified = await getVerifiedSession()
  if (!verified) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { session, invite, event } = verified
  const { applicationId } = params

  // Parse and validate requester identity from request body
  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 })
  }

  const requesterName = String(body?.requesterName ?? '').trim()
  const requesterEmail = String(body?.requesterEmail ?? '').trim()
  const requesterRole = String(body?.requesterRole ?? '').trim() || null
  const requesterMessage = String(body?.requesterMessage ?? '').trim() || null

  if (!requesterName) {
    return Response.json({ error: 'requester_name_required' }, { status: 422 })
  }
  if (!requesterEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requesterEmail)) {
    return Response.json({ error: 'requester_email_invalid' }, { status: 422 })
  }
  if (requesterRole && requesterRole.length > 120) {
    return Response.json({ error: 'requester_role_too_long' }, { status: 422 })
  }
  if (requesterMessage && requesterMessage.length > 1000) {
    return Response.json({ error: 'requester_message_too_long' }, { status: 422 })
  }

  // Verify application is submitted and belongs to the session's event
  let app
  try {
    app = await findApplicationForRep(applicationId, session.eid)
  } catch {
    return Response.json({ error: 'server_error' }, { status: 500 })
  }

  if (!app) {
    return Response.json({ error: 'not_found' }, { status: 404 })
  }

  // Idempotency: return early if a request already exists for this (invite, application)
  let existing
  try {
    existing = await getIntroRequest(session.iid, applicationId)
  } catch {
    return Response.json({ error: 'server_error' }, { status: 500 })
  }

  if (existing) {
    return Response.json({ ok: true, status: existing.status, existing: true })
  }

  const eventName = event.name ?? 'Open Call'

  // Create the intro request record with requester identity
  let introReq
  try {
    introReq = await createIntroRequest(session.iid, session.eid, applicationId, {
      name: requesterName,
      email: requesterEmail,
      role: requesterRole,
      message: requesterMessage,
    })
  } catch (err) {
    console.error('createIntroRequest failed:', err.message)
    return Response.json({ error: 'server_error' }, { status: 500 })
  }

  if (!introReq) {
    return Response.json({ error: 'server_error' }, { status: 500 })
  }

  // Log the action
  await safeLogAccess({
    invite_id: session.iid,
    event_id: session.eid,
    action: 'request_introduction',
    application_id: applicationId,
  })

  // ─── Send emails ────────────────────────────────────────────────────────────
  // Reply-To is the requester's email so guardian replies go directly to them.
  // Guardian email address is server-side only — never in the response.
  // The invite agency is used for the office attribution, not the requester's name
  // in the guardian email — we show the requester's name separately.

  let guardianSent = false
  let repSent = false
  let failureCode = null

  try {
    await sendEmail({
      to: app.guardian_email,
      subject: `Introduction Request — ${eventName}`,
      html: buildGuardianIntroHtml({
        actorName: app.actor_name,
        requesterName,
        requesterRole,
        requesterMessage,
        repAgency: invite.rep_agency,
        eventName,
      }),
      replyTo: requesterEmail,
    })
    guardianSent = true
  } catch (err) {
    console.error('Guardian intro email failed:', sanitizeEmailError(err))
    failureCode = 'guardian_email_failed'
  }

  try {
    await sendEmail({
      to: requesterEmail,
      subject: `Introduction Request Received — ${eventName}`,
      html: buildRepIntroConfirmHtml({
        requesterName,
        actorName: app.actor_name,
        eventName,
      }),
    })
    repSent = true
  } catch (err) {
    console.error('Requester intro email failed:', sanitizeEmailError(err))
    if (!failureCode) failureCode = 'requester_email_failed'
  }

  // Update intro request with delivery results
  const now = new Date().toISOString()
  const patch = {}

  if (guardianSent && repSent) {
    patch.status = 'sent'
    patch.guardian_email_sent_at = now
    patch.rep_email_sent_at = now
  } else if (guardianSent && !repSent) {
    patch.status = 'partial_failure'
    patch.guardian_email_sent_at = now
    patch.failed_at = now
    patch.failure_code = failureCode
  } else if (!guardianSent && repSent) {
    patch.status = 'partial_failure'
    patch.rep_email_sent_at = now
    patch.failed_at = now
    patch.failure_code = failureCode
  } else {
    patch.status = 'failed'
    patch.failed_at = now
    patch.failure_code = failureCode
  }

  try {
    await updateIntroRequest(introReq.id, patch)
  } catch (err) {
    console.error('updateIntroRequest failed:', err.message)
  }

  if (!guardianSent && !repSent) {
    return Response.json({ error: 'email_delivery_failed' }, { status: 502 })
  }

  return Response.json({ ok: true, status: patch.status })
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
  const msg = String(err?.message || err)
  return msg.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]')
}
