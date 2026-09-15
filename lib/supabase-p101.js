// Raw PostgREST helper for the Pages101 Supabase project.
// Uses the service-role key (server-side only — never imported in client components).
// All mutations (insert, update, delete) go through this module.

function getConfig() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  return { url: url.replace(/\/$/, ''), key }
}

function headers(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }
}

// ─── SELECT ───────────────────────────────────────────────────────────────────

export async function dbSelect(table, filters = {}, opts = {}) {
  const { url, key } = getConfig()
  const u = new URL(`${url}/rest/v1/${table}`)

  for (const [col, val] of Object.entries(filters)) {
    u.searchParams.set(col, val)
  }
  if (opts.select) u.searchParams.set('select', opts.select)
  if (opts.limit) u.searchParams.set('limit', String(opts.limit))
  if (opts.order) u.searchParams.set('order', opts.order)

  // no-store: authorization reads (invite revocation, registration-link
  // disable, event review_close) must never be served from Next's Data Cache.
  const res = await fetch(u, { headers: headers(key), cache: 'no-store' })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`dbSelect ${table} failed ${res.status}: ${body}`)
  }
  return res.json()
}

// ─── INSERT ───────────────────────────────────────────────────────────────────

export async function dbInsert(table, row, { upsert = false, onConflict = '' } = {}) {
  const { url, key } = getConfig()
  const h = headers(key)
  let tableUrl = `${url}/rest/v1/${table}`
  if (upsert) {
    h['Prefer'] = `resolution=ignore-duplicates,return=representation`
    if (onConflict) tableUrl += `?on_conflict=${encodeURIComponent(onConflict)}`
  }
  const res = await fetch(tableUrl, {
    method: 'POST',
    headers: h,
    body: JSON.stringify(row),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`dbInsert ${table} failed ${res.status}: ${body}`)
  }
  const text = await res.text()
  return text ? JSON.parse(text) : []
}

// ─── UPDATE ───────────────────────────────────────────────────────────────────

export async function dbUpdate(table, filters, patch) {
  const { url, key } = getConfig()
  const u = new URL(`${url}/rest/v1/${table}`)
  for (const [col, val] of Object.entries(filters)) {
    u.searchParams.set(col, val)
  }
  const h = headers(key)
  h['Prefer'] = 'return=minimal'
  const res = await fetch(u, { method: 'PATCH', headers: h, body: JSON.stringify(patch) })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`dbUpdate ${table} failed ${res.status}: ${body}`)
  }
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function dbDelete(table, filters) {
  const { url, key } = getConfig()
  const u = new URL(`${url}/rest/v1/${table}`)
  for (const [col, val] of Object.entries(filters)) {
    u.searchParams.set(col, val)
  }
  const h = { ...headers(key), Prefer: 'return=minimal' }
  const res = await fetch(u, { method: 'DELETE', headers: h })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`dbDelete ${table} failed ${res.status}: ${body}`)
  }
}

// ─── Domain-specific helpers ──────────────────────────────────────────────────

export async function findInviteByHash(tokenHash) {
  const rows = await dbSelect(
    'p101_opencall_rep_invites',
    { 'token_hash': `eq.${tokenHash}` },
    { select: 'id,event_id,rep_name,rep_email,rep_agency,expires_at,revoked_at,redeemed_at' }
  )
  return rows[0] ?? null
}

export async function findInviteById(inviteId) {
  const rows = await dbSelect(
    'p101_opencall_rep_invites',
    { 'id': `eq.${inviteId}` },
    { select: 'id,event_id,rep_name,rep_email,rep_agency,expires_at,revoked_at' }
  )
  return rows[0] ?? null
}

export async function findEventById(eventId) {
  const rows = await dbSelect(
    'p101_opencall_events',
    { 'id': `eq.${eventId}` },
    { select: 'id,name,status,review_close,is_test' }
  )
  return rows[0] ?? null
}

// Fetches guardian contact for sending intro emails. Only use where guardian PII is needed.
// is_seed is included so the intro route can skip SES for test/seed applications.
export async function findApplicationForRep(applicationId, eventId) {
  const rows = await dbSelect(
    'p101_opencall_applications',
    { 'id': `eq.${applicationId}`, 'event_id': `eq.${eventId}`, 'status': 'eq.submitted' },
    { select: 'id,event_id,status,actor_name,guardian_name,guardian_email,is_seed' }
  )
  return rows[0] ?? null
}

// Lightweight ownership check — no guardian PII. Use this in favorites handlers.
export async function verifyApplicationForRep(applicationId, eventId) {
  const rows = await dbSelect(
    'p101_opencall_applications',
    { 'id': `eq.${applicationId}`, 'event_id': `eq.${eventId}`, 'status': 'eq.submitted' },
    { select: 'id' }
  )
  return rows[0] ?? null
}

export async function setInviteRedeemed(inviteId, firstTime) {
  if (firstTime) {
    await dbUpdate(
      'p101_opencall_rep_invites',
      { id: `eq.${inviteId}` },
      { redeemed_at: new Date().toISOString() }
    )
  }
}

export async function logAccess(opts) {
  // opts: { invite_id, event_id, action, application_id? }
  const row = {
    invite_id: opts.invite_id,
    event_id: opts.event_id,
    action: opts.action,
  }
  if (opts.application_id) row.application_id = opts.application_id
  await dbInsert('p101_opencall_access_log', row)
}

export async function getFavorites(inviteId) {
  return dbSelect(
    'p101_opencall_rep_favorites',
    { 'invite_id': `eq.${inviteId}` },
    { select: 'application_id,created_at', order: 'created_at.desc' }
  )
}

export async function addFavorite(inviteId, eventId, applicationId) {
  // Upsert — duplicate is silently ignored
  await dbInsert(
    'p101_opencall_rep_favorites',
    { invite_id: inviteId, event_id: eventId, application_id: applicationId },
    { upsert: true, onConflict: 'invite_id,application_id' }
  )
}

export async function removeFavorite(inviteId, applicationId) {
  await dbDelete('p101_opencall_rep_favorites', {
    'invite_id': `eq.${inviteId}`,
    'application_id': `eq.${applicationId}`,
  })
}

export async function getIntroRequest(inviteId, applicationId) {
  const rows = await dbSelect(
    'p101_opencall_intro_requests',
    { 'invite_id': `eq.${inviteId}`, 'application_id': `eq.${applicationId}` },
    { select: 'id,status,requester_name,requester_email,requested_at,guardian_email_sent_at,rep_email_sent_at' }
  )
  return rows[0] ?? null
}

export async function createIntroRequest(inviteId, eventId, applicationId, requester) {
  // requester: { name, email, role?, message? }
  const rows = await dbInsert('p101_opencall_intro_requests', {
    invite_id: inviteId,
    event_id: eventId,
    application_id: applicationId,
    status: 'pending',
    requester_name: requester.name,
    requester_email: requester.email,
    requester_role: requester.role || null,
    requester_message: requester.message || null,
  })
  return rows[0] ?? null
}

export async function updateIntroRequest(id, patch) {
  await dbUpdate('p101_opencall_intro_requests', { id: `eq.${id}` }, patch)
}

// ─── Rep self-registration (reusable registration links) ─────────────────────
// A registration link never grants gallery access. It only authorizes the
// /api/join route to mint a PERSONAL invite for the registering rep.

export async function findRegistrationLinkByHash(tokenHash) {
  const rows = await dbSelect(
    'p101_opencall_registration_links',
    { token_hash: `eq.${tokenHash}` },
    { select: 'id,event_id,source_name,expires_at,disabled_at' }
  )
  return rows[0] ?? null
}

// Case-insensitive match on the email so "Jane@Agency.com" and
// "jane@agency.com" dedupe to the same invite. `%`, `_` and `\` are escaped
// so an email can never widen into a wildcard pattern.
export async function findInviteByEmail(eventId, email) {
  const pattern = email.replace(/[\\%_]/g, (m) => `\\${m}`)
  const rows = await dbSelect(
    'p101_opencall_rep_invites',
    { event_id: `eq.${eventId}`, rep_email: `ilike.${pattern}` },
    { select: 'id,event_id,rep_name,rep_email,rep_agency,expires_at,revoked_at,redeemed_at,registered_via', order: 'created_at.desc', limit: 1 }
  )
  return rows[0] ?? null
}

export async function createRegisteredInvite(row) {
  // row: { event_id, rep_name, rep_email, rep_agency, rep_role, token_hash, expires_at, registered_via }
  const rows = await dbInsert('p101_opencall_rep_invites', row)
  return rows[0] ?? null
}

// Rotate the token on an existing invite (re-registration / resend). The old
// link stops working; the rep receives the new one at the same address.
export async function rotateInviteToken(inviteId, tokenHash, patch = {}) {
  await dbUpdate('p101_opencall_rep_invites', { id: `eq.${inviteId}` }, { token_hash: tokenHash, ...patch })
}

// ─── Rep notes (private per invite) ─────────────────────────────────────────

export async function getNotes(inviteId) {
  return dbSelect(
    'p101_opencall_rep_notes',
    { invite_id: `eq.${inviteId}` },
    { select: 'application_id,body,updated_at', order: 'updated_at.desc' }
  )
}

export async function upsertNote(inviteId, eventId, applicationId, body) {
  const { url, key } = getConfig()
  const h = headers(key)
  h['Prefer'] = 'resolution=merge-duplicates,return=representation'
  const res = await fetch(
    `${url}/rest/v1/p101_opencall_rep_notes?on_conflict=invite_id,application_id`,
    { method: 'POST', headers: h, body: JSON.stringify({ invite_id: inviteId, event_id: eventId, application_id: applicationId, body }) }
  )
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`upsertNote failed ${res.status}: ${text}`)
  }
  const rows = await res.json()
  return rows[0] ?? null
}

export async function deleteNote(inviteId, applicationId) {
  await dbDelete('p101_opencall_rep_notes', {
    invite_id: `eq.${inviteId}`,
    application_id: `eq.${applicationId}`,
  })
}
