// GET /api/rep/intros — the invite's introductions with family contact.
// Backs the "Introductions" view. Only applications with an existing intro
// request are included, and each contact returned is logged as a reveal.

import { cookies } from 'next/headers'
import { verifySession, COOKIE_NAME } from '../../../../lib/session'
import {
  findInviteById,
  findEventById,
  getIntroRequests,
  getGuardianContacts,
  logAccess,
} from '../../../../lib/supabase-p101'

export const dynamic = 'force-dynamic'

export async function GET() {
  const cookieStore = cookies()
  const secret = process.env.TALENTSEARCH_SESSION_SECRET
  const session = verifySession(cookieStore.get(COOKIE_NAME)?.value, secret)
  if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 })

  let invite, event
  try {
    invite = await findInviteById(session.iid)
    event = invite ? await findEventById(session.eid) : null
  } catch {
    return Response.json({ error: 'server_error' }, { status: 500 })
  }
  if (!invite || invite.revoked_at || new Date(invite.expires_at) <= new Date() || invite.event_id !== session.eid) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!event || new Date(event.review_close) <= new Date() || !['reviewing', 'open', 'closed'].includes(event.status)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  let requests
  try {
    requests = await getIntroRequests(session.iid)
  } catch {
    return Response.json({ error: 'server_error' }, { status: 500 })
  }
  if (!requests.length) return Response.json({ ok: true, intros: [] })

  let apps
  try {
    apps = await getGuardianContacts(session.eid, requests.map(r => r.application_id))
  } catch {
    return Response.json({ error: 'server_error' }, { status: 500 })
  }
  const byId = Object.fromEntries(apps.map(a => [a.id, a]))

  const intros = requests
    .filter(r => byId[r.application_id])
    .map(r => ({
      applicationId: r.application_id,
      actorName: byId[r.application_id].actor_name,
      requestedAt: r.requested_at,
      status: r.status,
      contact: {
        guardianName: byId[r.application_id].guardian_name ?? '',
        guardianEmail: byId[r.application_id].guardian_email ?? '',
        guardianPhone: byId[r.application_id].guardian_phone ?? '',
      },
    }))

  await Promise.all(intros.map(i =>
    logAccess({ invite_id: session.iid, event_id: session.eid, action: 'reveal_guardian_contact', application_id: i.applicationId })
      .catch(err => console.error('Access log failed:', err.message))
  ))

  return Response.json({ ok: true, intros })
}
