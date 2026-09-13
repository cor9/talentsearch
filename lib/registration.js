// Shared validation for reusable rep registration links.
// A registration link authorizes /join and /api/join only. It NEVER creates a
// gallery session; the personal invite it mints does that via /access.

import { createHash } from 'crypto'
import { findRegistrationLinkByHash, findEventById } from './supabase-p101'

export function hashToken(raw) {
  return createHash('sha256').update(raw, 'utf8').digest('hex')
}

// Returns { ok: true, link, event } or { ok: false, reason }.
// reason ∈ 'invalid' | 'unknown' | 'disabled' | 'expired' | 'closed' | 'unavailable' | 'error'
export async function validateRegistrationToken(rawToken) {
  if (!rawToken || rawToken.length < 16 || rawToken.length > 512) {
    return { ok: false, reason: 'invalid' }
  }

  let link
  try {
    link = await findRegistrationLinkByHash(hashToken(rawToken))
  } catch (err) {
    console.error('Registration link lookup failed:', err.message)
    return { ok: false, reason: 'error' }
  }
  if (!link) return { ok: false, reason: 'unknown' }

  const now = new Date()
  if (link.disabled_at) return { ok: false, reason: 'disabled' }
  if (new Date(link.expires_at) <= now) return { ok: false, reason: 'expired' }

  let event
  try {
    event = await findEventById(link.event_id)
  } catch (err) {
    console.error('Event lookup failed:', err.message)
    return { ok: false, reason: 'error' }
  }
  if (!event) return { ok: false, reason: 'error' }
  if (new Date(event.review_close) <= now) return { ok: false, reason: 'closed' }
  if (!['reviewing', 'open', 'closed'].includes(event.status)) return { ok: false, reason: 'unavailable' }

  return { ok: true, link, event }
}

export const REGISTRATION_DENIED = {
  invalid:     { heading: 'Invalid Registration Link', body: 'This registration link is not valid. Please use the exact link that was shared with you.' },
  unknown:     { heading: 'Invalid Registration Link', body: 'This registration link is not recognized. Please use the exact link that was shared with you.' },
  disabled:    { heading: 'Registration Closed', body: 'This registration link has been turned off. If you already registered, use the personal access link in your email. Otherwise contact Child Actor 101 for access.' },
  expired:     { heading: 'Registration Closed', body: 'This registration link has expired. Contact Child Actor 101 if you need access.' },
  closed:      { heading: 'Review Period Closed', body: 'The review window for this Open Call has closed. Registration is no longer available.' },
  unavailable: { heading: 'Gallery Unavailable', body: 'The Open Call gallery is not currently accepting representative registrations.' },
  error:       { heading: 'Something Went Wrong', body: 'We could not verify this link right now. Please try again in a few minutes.' },
}
