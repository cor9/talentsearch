// POST /api/rep/favorites/:applicationId  — add to favorites
// DELETE /api/rep/favorites/:applicationId — remove from favorites
//
// Full session + Supabase revocation check on every request.
// invite_id and event_id are derived from the signed session cookie only —
// client-supplied IDs are ignored.

import { cookies } from 'next/headers'
import { verifySession, COOKIE_NAME } from '../../../../../lib/session'
import {
  findInviteById,
  findEventById,
  findApplicationForRep,
  addFavorite,
  removeFavorite,
  logAccess,
} from '../../../../../lib/supabase-p101'

export const dynamic = 'force-dynamic'

async function getVerifiedSession() {
  const cookieStore = cookies()
  const sessionValue = cookieStore.get(COOKIE_NAME)?.value
  const secret = process.env.TALENTSEARCH_SESSION_SECRET

  const session = verifySession(sessionValue, secret)
  if (!session) return null

  // Full revocation + expiry check against Supabase
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

  return session
}

export async function POST(request, { params }) {
  const session = await getVerifiedSession()
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { applicationId } = params

  // Verify application belongs to the session's event and is submitted
  let app
  try {
    app = await findApplicationForRep(applicationId, session.eid)
  } catch {
    return Response.json({ error: 'server_error' }, { status: 500 })
  }

  if (!app) {
    return Response.json({ error: 'not_found' }, { status: 404 })
  }

  try {
    await addFavorite(session.iid, session.eid, applicationId)
    await logAccess({
      invite_id: session.iid,
      event_id: session.eid,
      action: 'favorite_application',
      application_id: applicationId,
    })
  } catch (err) {
    console.error('addFavorite failed:', err.message)
    return Response.json({ error: 'server_error' }, { status: 500 })
  }

  return Response.json({ ok: true })
}

export async function DELETE(request, { params }) {
  const session = await getVerifiedSession()
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { applicationId } = params

  // Verify application belongs to the session's event
  let app
  try {
    app = await findApplicationForRep(applicationId, session.eid)
  } catch {
    return Response.json({ error: 'server_error' }, { status: 500 })
  }

  if (!app) {
    return Response.json({ error: 'not_found' }, { status: 404 })
  }

  try {
    await removeFavorite(session.iid, applicationId)
    await logAccess({
      invite_id: session.iid,
      event_id: session.eid,
      action: 'unfavorite_application',
      application_id: applicationId,
    })
  } catch (err) {
    console.error('removeFavorite failed:', err.message)
    return Response.json({ error: 'server_error' }, { status: 500 })
  }

  return Response.json({ ok: true })
}
