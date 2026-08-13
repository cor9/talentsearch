// Pages101 adapter — fetches submitted Open Call applications from the
// Pages101/Supabase project and normalizes them to the TalentGallery
// submission shape.
//
// Server-only. The service-role key in SUPABASE_SERVICE_ROLE_KEY must never
// appear in client components, page props serialized to the browser, or logs.
// This module may only be imported in server components, route handlers, and
// other server-only modules.
//
// Eligibility: the p101_opencall_gallery_v view already filters
//   status = 'submitted'
// which excludes drafts and withdrawn applications. The submission completeness
// constraint guarantees that every submitted row has all required consents and
// fields. This adapter adds an event_id filter so only the authorized event's
// applications are returned.

import 'server-only'
import { dbSelect } from './supabase-p101.js'

// Columns returned by p101_opencall_gallery_v (guardian fields absent from view).
const GALLERY_SELECT = [
  'id', 'event_id',
  'actor_name', 'birth_month', 'birth_year',
  'gender', 'ethnicity',
  'city', 'state', 'country',
  'local_hire_cities',
  'union_status', 'coogan_status', 'work_permit', 'passport',
  'has_current_rep', 'representatives', 'seeking_representation', 'representation_notes',
  'casting_platforms', 'casting_profile_urls',
  'headshots',
  'resume_url', 'slate_url', 'reel_url', 'other_video_url',
  'supplemental_notes',
  'submitted_at',
].join(',')

// Approved representation-type vocabulary — mirrors REPRESENTATION_TYPE_OPTIONS
// in Pages101's src/lib/opencall.ts. Duplicated here since the two apps don't
// share a package; keep in sync by hand if the vocabulary changes.
const REPRESENTATION_TYPE_LABELS = {
  manager: 'Manager',
  regional_agent: 'Regional Agent',
  theatrical_agent: 'Theatrical Agent — Television & Film',
  commercial_agent: 'Commercial Agent',
  voiceover_agent: 'Voiceover Agent',
  theatre_agent: 'Theatre (Stage) Agent',
  print_agent: 'Print Agent',
  hosting_agent: 'Hosting Agent',
  across_the_board: 'Across-the-Board Agency Representation',
}

/**
 * Returns submitted applications for the given event in the TalentGallery
 * submission shape.
 *
 * eventId must come from the validated representative session — never from a
 * client-supplied parameter. The page has force-dynamic so all fetches in this
 * render are uncached (no-store behavior).
 *
 * @param {string} eventId  Validated event UUID from the rep session.
 * @returns {{ submissions: Array, error: string|null }}
 */
export async function getSubmissions(eventId) {
  if (!eventId) {
    return { submissions: [], error: 'Event scope is required.' }
  }

  let rows
  try {
    rows = await dbSelect(
      'p101_opencall_gallery_v',
      { event_id: `eq.${eventId}` },
      { select: GALLERY_SELECT, order: 'submitted_at.asc' }
    )
  } catch (err) {
    // Sanitize: do not expose SQL, table names, or credentials.
    console.error('[pages101] gallery query failed:', err.message)
    return {
      submissions: [],
      error: 'We could not load the talent gallery. Please refresh the page.',
    }
  }

  if (!Array.isArray(rows)) {
    return {
      submissions: [],
      error: 'Unexpected response from the database.',
    }
  }

  // Empty event is a legitimate state, not an error.
  if (rows.length === 0) {
    return { submissions: [], error: null }
  }

  try {
    // Defense in depth: hide any legacy applications that fall outside the
    // current 6–24 eligibility rule before serializing data to a rep browser.
    const submissions = rows.filter(isEligibleForOpenCall).map(normalizeApplication)
    return { submissions, error: null }
  } catch (err) {
    console.error('[pages101] normalization failed:', err.message)
    return {
      submissions: [],
      error: 'We could not process the gallery data. Please refresh the page.',
    }
  }
}

function isEligibleForOpenCall(app) {
  const age = computeAge(app?.birth_month, app?.birth_year)
  return typeof age === 'number' && age >= 6 && age <= 24
}

// ─── Field normalization ──────────────────────────────────────────────────────

function normalizeApplication(app) {
  // Headshots: labeled jsonb → ordered URL array + parallel label array.
  // Order: commercial → theatrical → other. Duplicates removed by URL.
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

  // Videos in display order: slate, reel, other.
  const videos = []
  if (app.slate_url)       videos.push({ label: 'Slate',        url: app.slate_url })
  if (app.reel_url)        videos.push({ label: 'Reel / Clips', url: app.reel_url })
  if (app.other_video_url) videos.push({ label: 'Other Video',  url: app.other_video_url })

  return {
    // id is the React list key. applicationId is the real Supabase UUID that
    // drives favorites, intro requests, and access logging.
    id:            app.id,
    applicationId: app.id,

    name:      app.actor_name || '',
    stageName: '',         // not collected in Pages101 — field kept for shape compat
    guardianName: '',      // guardian PII excluded; use intro request workflow

    birthday: app.birth_year ? String(app.birth_year) : '',
    age:      computeAge(app.birth_month, app.birth_year),

    genderIdentity: app.gender || '',
    ethnicity:      arrayToString(app.ethnicity),

    // Guardian contact excluded. Representatives use the intro request workflow.
    email: '',
    phone: '',

    union:           normalizeUnion(app.union_status),
    location:        formatLocation(app.city, app.state, app.country),
    localHireCities: arrayToString(app.local_hire_cities),

    currentRepresentation: formatRepresentatives(app.has_current_rep, app.representatives),
    seekingRepresentation: formatRepresentationTypes(app.seeking_representation),
    seekingRepresentationSlugs: Array.isArray(app.seeking_representation) ? app.seeking_representation : [],
    representationNotes: app.representation_notes || '',

    cooganAccount: normalizeLookup(app.coogan_status),
    workPermits:   normalizeLookup(app.work_permit),
    passport:      app.passport ? 'Yes' : '',

    supplementalNotes: app.supplemental_notes || '',
    castingProfiles:   arrayToString(app.casting_platforms),

    mainHeadshot,
    allImages,
    headshotLabels,    // parallel to allImages — readable label per image

    videos,
    resume:      app.resume_url || '',
    profileLink: Array.isArray(app.casting_profile_urls)
      ? (app.casting_profile_urls[0] || '')
      : '',
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function normalizeUnion(unionStatus) {
  switch (unionStatus) {
    case 'sag_member':   return 'SAG-AFTRA'
    case 'sag_eligible': return 'SAG-Eligible'
    case 'non_union':    return 'Non-Union'
    default:             return unionStatus || 'Non-Union'
  }
}

function normalizeLookup(value) {
  switch (value) {
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

function representationTypeLabel(type) {
  return REPRESENTATION_TYPE_LABELS[type] || type || ''
}

// Human-readable "Current Representation" line, e.g.
// "Northgate Talent Agency — Theatrical Agent — Television & Film; Willowmere Management — Manager".
// Empty string when unrepresented, matching the prior representation field's
// "hide the row entirely" behavior in TalentModal.
function formatRepresentatives(hasCurrentRep, representatives) {
  if (!hasCurrentRep || !Array.isArray(representatives) || representatives.length === 0) return ''
  return representatives
    .filter((r) => r?.name)
    .map((r) => {
      const label = representationTypeLabel(r.type)
      const market = r.market ? ` (${r.market})` : ''
      return label ? `${r.name} — ${label}${market}` : `${r.name}${market}`
    })
    .join('; ')
}

function formatRepresentationTypes(slugs) {
  if (!Array.isArray(slugs)) return ''
  return slugs.map(representationTypeLabel).filter(Boolean).join(', ')
}
