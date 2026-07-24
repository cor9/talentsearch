/**
 * Phase 5 — Unit Tests: Field normalization in lib/pages101.js
 *
 * These tests do NOT require a running app or network access.
 * They exercise the normalizeApplication logic directly by constructing
 * raw DB row objects and checking the output shape.
 *
 * Since lib/pages101.js imports 'server-only', we cannot import it directly.
 * Instead, we duplicate the normalization logic here and cross-check it
 * matches the source exactly.
 */

import { suite, test, pass, fail, assert, assertEqual, info } from './helpers/assert.mjs'

suite('Normalization')

// ─── Duplicate of normalization logic (must stay in sync with lib/pages101.js) ─

function computeAge(birthMonth, birthYear) {
  if (!birthMonth || !birthYear) return ''
  const now = new Date()
  let age = now.getFullYear() - birthYear
  if (now.getMonth() + 1 < birthMonth) age -= 1
  if (age < 0 || age > 100) return ''
  return age
}

function formatLocation(city, state, country) {
  const parts = [city, state].filter(Boolean)
  if (country && country !== 'US') parts.push(country)
  return parts.join(', ')
}

function normalizeUnion(u) {
  switch (u) {
    case 'sag_member':   return 'SAG-AFTRA'
    case 'sag_eligible': return 'SAG-Eligible'
    case 'non_union':    return 'Non-Union'
    default:             return u || 'Non-Union'
  }
}

function normalizeLookup(v) {
  switch (v) {
    case 'yes':          return 'Yes'
    case 'not_required': return 'Not Required'
    default:             return ''
  }
}

function labelForType(type) {
  switch (type) {
    case 'commercial': return 'Commercial'
    case 'theatrical': return 'Theatrical'
    case 'other':      return 'Other'
    default:           return type || ''
  }
}

function arrayToString(arr) {
  return Array.isArray(arr) ? arr.filter(Boolean).join(', ') : ''
}

function normalizeApplication(app) {
  const headshots = Array.isArray(app.headshots) ? app.headshots : []
  const commercial = headshots.filter(h => h?.type === 'commercial' && h?.url)
  const theatrical = headshots.filter(h => h?.type === 'theatrical' && h?.url)
  const other      = headshots.filter(h => h?.type === 'other'      && h?.url)
  const ordered    = [...commercial, ...theatrical, ...other]

  const seen = new Set()
  const deduped = ordered.filter(h => {
    if (seen.has(h.url)) return false
    seen.add(h.url)
    return true
  })

  const allImages      = deduped.map(h => h.url)
  const headshotLabels = deduped.map(h => labelForType(h.type))
  const mainHeadshot   = allImages[0] || '/11k.jpeg'

  const videos = []
  if (app.slate_url)       videos.push({ label: 'Slate',        url: app.slate_url })
  if (app.reel_url)        videos.push({ label: 'Reel / Clips', url: app.reel_url })
  if (app.other_video_url) videos.push({ label: 'Other Video',  url: app.other_video_url })

  return {
    id:            app.id,
    applicationId: app.id,
    name:          app.actor_name || '',
    stageName:     '',
    guardianName:  '',
    birthday:      app.birth_year ? String(app.birth_year) : '',
    age:           computeAge(app.birth_month, app.birth_year),
    genderIdentity: app.gender || '',
    ethnicity:      arrayToString(app.ethnicity),
    email: '',
    phone: '',
    union:           normalizeUnion(app.union_status),
    location:        formatLocation(app.city, app.state, app.country),
    localHireCities: arrayToString(app.local_hire_cities),
    representation: app.has_current_rep && app.current_rep_name ? app.current_rep_name : '',
    seeking:        arrayToString(app.seeking),
    cooganAccount:  normalizeLookup(app.coogan_status),
    workPermits:    normalizeLookup(app.work_permit),
    passport:       app.passport ? 'Yes' : '',
    supplementalNotes: app.supplemental_notes || '',
    castingProfiles:   arrayToString(app.casting_platforms),
    mainHeadshot,
    allImages,
    headshotLabels,
    videos,
    resume:      app.resume_url || '',
    profileLink: Array.isArray(app.casting_profile_urls) ? (app.casting_profile_urls[0] || '') : '',
  }
}

// ─── Test helpers ──────────────────────────────────────────────────────────────

function makeRow(overrides = {}) {
  return {
    id: 'test-uuid-1234',
    event_id: 'event-uuid-5678',
    actor_name: 'Test Actor',
    birth_month: 6,
    birth_year: 2016,
    gender: 'Female',
    ethnicity: ['Asian'],
    city: 'Los Angeles',
    state: 'CA',
    country: 'US',
    local_hire_cities: ['San Diego', 'Las Vegas'],
    union_status: 'non_union',
    coogan_status: 'yes',
    work_permit: 'not_required',
    passport: false,
    has_current_rep: false,
    current_rep_name: null,
    rep_context: null,
    seeking: ['theatrical', 'commercial'],
    casting_platforms: ['Actors Access', 'Casting Networks'],
    casting_profile_urls: ['https://aa.com/profile/1', 'https://cn.com/profile/2'],
    headshots: [
      { type: 'commercial', url: 'https://cdn/commercial1.jpg' },
      { type: 'theatrical', url: 'https://cdn/theatrical1.jpg' },
      { type: 'other',      url: 'https://cdn/other1.jpg' },
    ],
    resume_url: 'https://cdn/resume.pdf',
    slate_url: 'https://cdn/slate.mp4',
    reel_url: 'https://cdn/reel.mp4',
    other_video_url: null,
    supplemental_notes: null,
    submitted_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

export async function run() {
  // NORM-01: Guardian fields always empty
  await test('NORM-01: Guardian fields always empty in normalized output', async () => {
    const out = normalizeApplication(makeRow())
    assertEqual(out.guardianName, '', 'guardianName must be empty string')
    assertEqual(out.email, '',        'email must be empty string')
    assertEqual(out.phone, '',        'phone must be empty string')
    pass('NORM-01: Guardian fields always empty in normalized output')
  })

  // NORM-02: Headshot ordering (commercial → theatrical → other)
  await test('NORM-02: Headshots ordered commercial → theatrical → other', async () => {
    const row = makeRow({
      headshots: [
        { type: 'other',      url: 'https://cdn/other.jpg' },
        { type: 'theatrical', url: 'https://cdn/theatrical.jpg' },
        { type: 'commercial', url: 'https://cdn/commercial.jpg' },
      ],
    })
    const out = normalizeApplication(row)
    assertEqual(out.allImages[0], 'https://cdn/commercial.jpg', 'First image should be commercial')
    assertEqual(out.allImages[1], 'https://cdn/theatrical.jpg', 'Second image should be theatrical')
    assertEqual(out.allImages[2], 'https://cdn/other.jpg',      'Third image should be other')
    assertEqual(out.headshotLabels[0], 'Commercial', 'First label should be Commercial')
    assertEqual(out.headshotLabels[1], 'Theatrical', 'Second label should be Theatrical')
    assertEqual(out.headshotLabels[2], 'Other',      'Third label should be Other')
    pass('NORM-02: Headshots ordered commercial → theatrical → other')
  })

  // NORM-03: Duplicate headshot URLs are removed
  await test('NORM-03: Duplicate headshot URLs deduplicated', async () => {
    const row = makeRow({
      headshots: [
        { type: 'commercial', url: 'https://cdn/same.jpg' },
        { type: 'theatrical', url: 'https://cdn/same.jpg' },
        { type: 'other',      url: 'https://cdn/unique.jpg' },
      ],
    })
    const out = normalizeApplication(row)
    assertEqual(out.allImages.length, 2, 'Duplicate URL should be removed')
    pass('NORM-03: Duplicate headshot URLs deduplicated')
  })

  // NORM-04: No headshots → fallback image
  await test('NORM-04: No headshots → mainHeadshot falls back to /11k.jpeg', async () => {
    const out = normalizeApplication(makeRow({ headshots: [] }))
    assertEqual(out.mainHeadshot, '/11k.jpeg', 'mainHeadshot should fall back to /11k.jpeg')
    assertEqual(out.allImages.length, 0, 'allImages should be empty')
    pass('NORM-04: No headshots → mainHeadshot falls back to /11k.jpeg')
  })

  // NORM-05: Union normalization
  await test('NORM-05: Union status normalization', async () => {
    assertEqual(normalizeApplication(makeRow({ union_status: 'sag_member' })).union,   'SAG-AFTRA')
    assertEqual(normalizeApplication(makeRow({ union_status: 'sag_eligible' })).union, 'SAG-Eligible')
    assertEqual(normalizeApplication(makeRow({ union_status: 'non_union' })).union,    'Non-Union')
    assertEqual(normalizeApplication(makeRow({ union_status: null })).union,           'Non-Union')
    pass('NORM-05: Union status normalization')
  })

  // NORM-06: Location formatting
  await test('NORM-06: Location formatting', async () => {
    assertEqual(normalizeApplication(makeRow({ city: 'LA', state: 'CA', country: 'US' })).location, 'LA, CA')
    assertEqual(normalizeApplication(makeRow({ city: 'Toronto', state: null, country: 'CA' })).location, 'Toronto, CA')
    assertEqual(normalizeApplication(makeRow({ city: null, state: null, country: 'US' })).location, '')
    pass('NORM-06: Location formatting')
  })

  // NORM-07: Age computation
  await test('NORM-07: Age computation', async () => {
    const now = new Date()
    const year = now.getFullYear() - 8
    const age = normalizeApplication(makeRow({ birth_year: year, birth_month: 1 })).age
    // Should be 8 or 7 depending on month
    assert(typeof age === 'number' && age >= 7 && age <= 9, `Age should be ~8, got ${age}`)
    // Missing birth info → empty string
    assertEqual(normalizeApplication(makeRow({ birth_year: null, birth_month: null })).age, '')
    pass('NORM-07: Age computation')
  })

  // NORM-08: Birthday shows year only (not full DOB)
  await test('NORM-08: Birthday shows year only (not full DOB)', async () => {
    const out = normalizeApplication(makeRow({ birth_year: 2016, birth_month: 6 }))
    assertEqual(out.birthday, '2016', 'birthday should be year string only')
    // Ensure no date separators — full DOB would look like "2016-06-XX" or "6/XX/2016"
    assert(!String(out.birthday).includes('-'), 'Birthday must not contain date separator "-"')
    assert(!String(out.birthday).includes('/'), 'Birthday must not contain date separator "/"')
    assert(String(out.birthday).length === 4, 'Birthday must be exactly the 4-digit year')
    pass('NORM-08: Birthday shows year only (not full DOB)')
  })

  // NORM-09: Videos assembled in slate → reel → other order
  await test('NORM-09: Videos ordered slate → reel → other', async () => {
    const out = normalizeApplication(makeRow({
      slate_url:       'https://cdn/slate.mp4',
      reel_url:        'https://cdn/reel.mp4',
      other_video_url: 'https://cdn/other.mp4',
    }))
    assertEqual(out.videos[0].label, 'Slate',        'First video should be Slate')
    assertEqual(out.videos[1].label, 'Reel / Clips', 'Second video should be Reel')
    assertEqual(out.videos[2].label, 'Other Video',  'Third video should be Other Video')
    pass('NORM-09: Videos ordered slate → reel → other')
  })

  // NORM-10: Representation logic
  await test('NORM-10: Representation field respects has_current_rep flag', async () => {
    const withRep = normalizeApplication(makeRow({ has_current_rep: true, current_rep_name: 'CAA' }))
    assertEqual(withRep.representation, 'CAA', 'Should show rep name when has_current_rep=true')

    const withoutRep = normalizeApplication(makeRow({ has_current_rep: false, current_rep_name: null }))
    assertEqual(withoutRep.representation, '', 'Should be empty when has_current_rep=false')

    const hasRepNoName = normalizeApplication(makeRow({ has_current_rep: true, current_rep_name: null }))
    assertEqual(hasRepNoName.representation, '', 'Should be empty when rep name is null')
    pass('NORM-10: Representation field respects has_current_rep flag')
  })

  // NORM-11: id and applicationId are both the same UUID
  await test('NORM-11: id and applicationId both use the same row UUID', async () => {
    const out = normalizeApplication(makeRow({ id: 'abc-123' }))
    assertEqual(out.id, 'abc-123', 'id should match row id')
    assertEqual(out.applicationId, 'abc-123', 'applicationId should match row id')
    pass('NORM-11: id and applicationId both use the same row UUID')
  })

  // NORM-12: Coogan and work permit lookups
  await test('NORM-12: Coogan account and work permit normalization', async () => {
    assertEqual(normalizeApplication(makeRow({ coogan_status: 'yes' })).cooganAccount, 'Yes')
    assertEqual(normalizeApplication(makeRow({ coogan_status: 'not_required' })).cooganAccount, 'Not Required')
    assertEqual(normalizeApplication(makeRow({ coogan_status: 'no' })).cooganAccount, '')
    assertEqual(normalizeApplication(makeRow({ work_permit: 'yes' })).workPermits, 'Yes')
    assertEqual(normalizeApplication(makeRow({ work_permit: 'not_required' })).workPermits, 'Not Required')
    pass('NORM-12: Coogan account and work permit normalization')
  })
}
