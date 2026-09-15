// PUT    /api/rep/notes/:applicationId  — save (create or replace) the note
// DELETE /api/rep/notes/:applicationId  — remove the note
//
// Notes are private to the invite in the signed session cookie. Full session
// + Supabase revocation check on every request; invite_id and event_id come
// from the cookie only — client-supplied IDs are ignored.

import { cookies } from 'next/headers'
import { verifySession, COOKIE_NAME } from '../../../../../lib/session'
import {
  findInviteById,
  findEventById,
  verifyApplicationForRep,
  upsertNote,
  deleteNote,
  logAccess,
} from '../../../../../lib/supabase-p101'

export const dynamic = 'force-dynamic'

const MAX_NOTE_LENGTH = 4000

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

  return session
}

async function verifyApp(session, applicationId) {
  try {
    return await verifyApplicationForRep(applicationId, session.eid)
  } catch {
    return undefined
  }
}

export async function PUT(request, { params }) {
  const session = await getVerifiedSession()
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const { applicationId } = params
  const app = await verifyApp(session, applicationId)
  if (app === undefined) return Response.json({ error: 'server_error' }, { status: 500 })
  if (!app) return Response.json({ error: 'not_found' }, { status: 404 })

  let payload
  try {
    payload = await request.json()
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 })
  }
  const body = typeof payload?.body === 'string' ? payload.body.trim() : ''
  if (!body) return Response.json({ error: 'empty' }, { status: 400 })
  if (body.length > MAX_NOTE_LENGTH) return Response.json({ error: 'too_long', max: MAX_NOTE_LENGTH }, { status: 400 })

  try {
    const row = await upsertNote(session.iid, session.eid, applicationId, body)
    await logAccess({ invite_id: session.iid, event_id: session.eid, action: 'save_note', application_id: applicationId })
    return Response.json({ ok: true, body: row?.body ?? body, updated_at: row?.updated_at ?? new Date().toISOString() })
  } catch (err) {
    console.error('upsertNote failed:', err.message)
    return Response.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function DELETE(request, { params }) {
  const session = await getVerifiedSession()
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const { applicationId } = params
  const app = await verifyApp(session, applicationId)
  if (app === undefined) return Response.json({ error: 'server_error' }, { status: 500 })
  if (!app) return Response.json({ error: 'not_found' }, { status: 404 })

  try {
    await deleteNote(session.iid, applicationId)
    await logAccess({ invite_id: session.iid, event_id: session.eid, action: 'delete_note', application_id: applicationId })
    return Response.json({ ok: true })
  } catch (err) {
    console.error('deleteNote failed:', err.message)
    return Response.json({ error: 'server_error' }, { status: 500 })
  }
}
