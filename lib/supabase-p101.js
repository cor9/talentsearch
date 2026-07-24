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

  const res = await fetch(u, { headers: headers(key) })
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
  if (upsert) {
    h['Prefer'] = `resolution=ignore-duplicates,return=representation`
    if (onConflict) h['on-conflict'] = onConflict
  }
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: upsert ? 'POST' : 'POST',
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
  const rows = await dbSelect('p101_opencall_rep_invites', {
    'token_hash': `eq.${tokenHash}`,
    'select': 'id,event_id,rep_name,rep_email,rep_agency,expires_at,revoked_at,redeemed_at',
  })
  return rows[0] ?? null
}

export async function findInviteById(inviteId) {
  const rows = await dbSelect('p101_opencall_rep_invites', {
    'id': `eq.${inviteId}`,
    'select': 'id,event_id,rep_name,rep_email,rep_agency,expires_at,revoked_at',
  })
  return rows[0] ?? null
}

export async function findEventById(eventId) {
  const rows = await dbSelect('p101_opencall_events', {
    'id': `eq.${eventId}`,
    'select': 'id,name,status,review_close',
  })
  return rows[0] ?? null
}

export async function findApplicationForRep(applicationId, eventId) {
  const rows = await dbSelect('p101_opencall_applications', {
    'id': `eq.${applicationId}`,
    'event_id': `eq.${eventId}`,
    'status': 'eq.submitted',
    'select': 'id,event_id,status,actor_name,guardian_name,guardian_email',
  })
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
  return dbSelect('p101_opencall_rep_favorites', {
    'invite_id': `eq.${inviteId}`,
    'select': 'application_id,created_at',
    'order': 'created_at.desc',
  })
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
  const rows = await dbSelect('p101_opencall_intro_requests', {
    'invite_id': `eq.${inviteId}`,
    'application_id': `eq.${applicationId}`,
    'select': 'id,status,requester_name,requester_email,requested_at,guardian_email_sent_at,rep_email_sent_at',
  })
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
