'use client'

import { useMemo, useState, useCallback, useEffect } from 'react'
import { TalentModal } from './TalentModal'

export function TalentGallery({ data, session, initialFavorites = [], initialNotes = {}, initialIntros = {}, identity: initialIdentity = null, identityDefaults = null }) {
  const [search, setSearch] = useState('')
  const [ageFilter, setAgeFilter] = useState('All')
  const [genderFilter, setGenderFilter] = useState('All')
  const [seekingFilter, setSeekingFilter] = useState('All')
  const [locationFilter, setLocationFilter] = useState('')
  const [view, setView] = useState('all') // all | saved | intros
  const [favoriteIds, setFavoriteIds] = useState(() => new Set(initialFavorites))
  const [notes, setNotes] = useState(() => ({ ...initialNotes }))
  // applicationId → requested_at ISO. Loaded server-side so it survives reloads.
  const [intros, setIntros] = useState(() => ({ ...initialIntros }))
  // applicationId → { guardianName, guardianEmail, guardianPhone }. Filled on
  // request, on View Contact, or when the Introductions view loads.
  const [contacts, setContacts] = useState({})
  const [introsLoaded, setIntrosLoaded] = useState(false)
  const [introsLoading, setIntrosLoading] = useState(false)
  // Confirmed requester identity (server-signed cookie). Null until the first
  // request confirms it; then Request Introduction is one click.
  const [identity, setIdentity] = useState(initialIdentity)
  const [identityDraft, setIdentityDraft] = useState(identityDefaults)

  const filteredTalent = useMemo(() => {
    const searchLower = search.toLowerCase();

    return (data || []).filter((person) => {
      const ageNum = typeof person.age === 'number' ? person.age : parseInt(person.age || '', 10)
      const genderRaw = (person.genderIdentity || '').toLowerCase().trim()
      const seekingSlugs = Array.isArray(person.seekingRepresentationSlugs) ? person.seekingRepresentationSlugs : []

      let normalizedGender = 'other'
      if (genderRaw.startsWith('non') || genderRaw.includes('other')) {
        normalizedGender = 'nonbinary'
      } else if (genderRaw.startsWith('f') || genderRaw.includes('female')) {
        normalizedGender = 'female'
      } else if (genderRaw.startsWith('m') || genderRaw.includes('male')) {
        normalizedGender = 'male'
      }

      const haystack = [
        person.name,
        person.stageName,
        person.birthday,
        person.age && String(person.age),
        person.genderIdentity,
        person.ethnicity,
        person.location,
        person.localHireCities,
        person.currentRepresentation,
        person.seekingRepresentation,
        person.representationNotes,
        person.castingProfiles,
        person.profileLink,
        person.supplementalNotes
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      const matchesSearch = haystack.includes(searchLower)

      const matchesAge =
        ageFilter === 'All' || Number.isNaN(ageNum)
          ? true
          : (ageFilter === 'Under10' && ageNum < 10) ||
            (ageFilter === '10-13' && ageNum >= 10 && ageNum <= 13) ||
            (ageFilter === '14-17' && ageNum >= 14 && ageNum <= 17) ||
            (ageFilter === '18Plus' && ageNum >= 18)

      const matchesGender =
        genderFilter === 'All'
          ? true
          : (genderFilter === 'Female' && normalizedGender === 'female') ||
            (genderFilter === 'Male' && normalizedGender === 'male') ||
            (genderFilter === 'NonBinary' && normalizedGender === 'nonbinary')

      const matchesSeeking =
        seekingFilter === 'All'
          ? true
          : seekingSlugs.includes(seekingFilter)

      const locationHaystack = [person.location, person.localHireCities]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      const matchesLocation = !locationFilter.trim() || locationHaystack.includes(locationFilter.trim().toLowerCase())
      const matchesView =
        view === 'all' ? true
        : view === 'saved' ? Boolean(person.applicationId && favoriteIds.has(person.applicationId))
        : Boolean(person.applicationId && intros[person.applicationId])

      return matchesSearch && matchesAge && matchesGender && matchesSeeking && matchesLocation && matchesView
    })
  }, [data, search, ageFilter, genderFilter, seekingFilter, locationFilter, view, favoriteIds, intros])

  const toggleFavorite = useCallback(async (applicationId) => {
    const wasFavorited = favoriteIds.has(applicationId)
    setFavoriteIds(prev => {
      const next = new Set(prev)
      if (wasFavorited) next.delete(applicationId)
      else next.add(applicationId)
      return next
    })
    try {
      const res = await fetch(`/api/rep/favorites/${applicationId}`, {
        method: wasFavorited ? 'DELETE' : 'POST',
      })
      if (!res.ok) throw new Error('request failed')
    } catch {
      setFavoriteIds(prev => {
        const next = new Set(prev)
        if (wasFavorited) next.add(applicationId)
        else next.delete(applicationId)
        return next
      })
    }
  }, [favoriteIds])

  // Save (or clear, when body is empty) the private note for one application.
  const saveNote = useCallback(async (applicationId, body) => {
    const trimmed = (body ?? '').trim()
    try {
      const res = await fetch(`/api/rep/notes/${applicationId}`, {
        method: trimmed ? 'PUT' : 'DELETE',
        headers: trimmed ? { 'Content-Type': 'application/json' } : undefined,
        body: trimmed ? JSON.stringify({ body: trimmed }) : undefined,
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        return { ok: false, error: json.error ?? 'request_failed' }
      }
      setNotes(prev => {
        const next = { ...prev }
        if (trimmed) next[applicationId] = trimmed
        else delete next[applicationId]
        return next
      })
      return { ok: true }
    } catch {
      return { ok: false, error: 'network_error' }
    }
  }, [])

  const requestIntro = useCallback(async (applicationId, payload) => {
    try {
      const res = await fetch(`/api/rep/intro/${applicationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload ?? {}),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return { ok: false, error: json.error ?? 'request_failed' }
      setIntros(prev => ({ ...prev, [applicationId]: json.requestedAt ?? new Date().toISOString() }))
      if (json.contact) setContacts(prev => ({ ...prev, [applicationId]: json.contact }))
      if (payload?.requesterName) {
        const confirmed = { name: payload.requesterName, agency: payload.requesterAgency ?? '', role: payload.requesterRole ?? '', email: payload.requesterEmail }
        setIdentity(confirmed)
        setIdentityDraft(confirmed)
      }
      return { ok: true, ...json }
    } catch {
      return { ok: false, error: 'network_error' }
    }
  }, [])

  const viewContact = useCallback(async (applicationId) => {
    try {
      const res = await fetch(`/api/rep/intro/${applicationId}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return { ok: false, error: json.error ?? 'request_failed' }
      if (json.contact) setContacts(prev => ({ ...prev, [applicationId]: json.contact }))
      return { ok: true, contact: json.contact }
    } catch {
      return { ok: false, error: 'network_error' }
    }
  }, [])

  // Introductions view: pull every requested contact in one call (each is
  // logged server-side as a reveal). Re-pulled when the request count changes.
  const introCount = Object.keys(intros).length
  useEffect(() => {
    if (view !== 'intros' || introsLoading) return
    const missing = Object.keys(intros).some(id => !contacts[id])
    if (introsLoaded && !missing) return
    setIntrosLoading(true)
    fetch('/api/rep/intros')
      .then(r => r.ok ? r.json() : { intros: [] })
      .then(json => {
        const next = {}
        const when = {}
        for (const i of json.intros ?? []) { next[i.applicationId] = i.contact; when[i.applicationId] = i.requestedAt }
        setContacts(prev => ({ ...prev, ...next }))
        setIntros(prev => ({ ...prev, ...when }))
        setIntrosLoaded(true)
      })
      .catch(() => {})
      .finally(() => setIntrosLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, introCount])

  const clearIdentity = useCallback(() => setIdentity(null), [])

  return (
    <div className="gallery">
      {session && (
        <RepSessionBanner repName={session.repName} repAgency={session.repAgency} exp={session.exp}
          savedCount={favoriteIds.size} introCount={introCount} />
      )}

      <div className="gallery-views" role="tablist" aria-label="Talent views">
        {[
          ['all', 'All Talent', (data || []).length],
          ['saved', 'Saved', favoriteIds.size],
          ['intros', 'Introductions', introCount],
        ].map(([key, label, count]) => (
          <button key={key} type="button" role="tab" aria-selected={view === key}
            className={`gallery-view-tab${view === key ? ' is-active' : ''}`}
            onClick={() => setView(key)}>
            {label} <span className="gallery-view-count">{count}</span>
          </button>
        ))}
      </div>

      <div className="gallery-controls">
        <div className="gallery-search">
          <label className="field-label" htmlFor="talent-search">
            Search talent
          </label>
          <input
            id="talent-search"
            className="field-input"
            placeholder="Search by name, city, rep, or notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="gallery-filter">
          <label className="field-label" htmlFor="age-filter">
            Age
          </label>
          <select
            id="age-filter"
            className="field-select"
            value={ageFilter}
            onChange={(e) => setAgeFilter(e.target.value)}
          >
            <option value="All">Any</option>
            <option value="Under10">Under 10</option>
            <option value="10-13">10–13</option>
            <option value="14-17">14–17</option>
            <option value="18Plus">18+</option>
          </select>
        </div>
        <div className="gallery-filter">
          <label className="field-label" htmlFor="gender-filter">
            Gender
          </label>
          <select
            id="gender-filter"
            className="field-select"
            value={genderFilter}
            onChange={(e) => setGenderFilter(e.target.value)}
          >
            <option value="All">Any</option>
            <option value="Female">Girl / Female</option>
            <option value="Male">Boy / Male</option>
            <option value="NonBinary">Non-binary</option>
          </select>
        </div>
        <div className="gallery-filter">
          <label className="field-label" htmlFor="seeking-filter">
            Seeking rep
          </label>
          <select
            id="seeking-filter"
            className="field-select"
            value={seekingFilter}
            onChange={(e) => setSeekingFilter(e.target.value)}
          >
            <option value="All">Any</option>
            <option value="manager">Manager</option>
            <option value="regional_agent">Regional Agent</option>
            <option value="theatrical_agent">Theatrical (TV/Film) Agent</option>
            <option value="commercial_agent">Commercial Agent</option>
            <option value="voiceover_agent">Voiceover Agent</option>
            <option value="theatre_agent">Theatre (Stage) Agent</option>
            <option value="print_agent">Print Agent</option>
            <option value="hosting_agent">Hosting Agent</option>
            <option value="across_the_board">Across the Board</option>
          </select>
        </div>
        <div className="gallery-filter">
          <label className="field-label" htmlFor="location-filter">
            Location / local hire
          </label>
          <input
            id="location-filter"
            className="field-input"
            placeholder="City or state"
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
          />
        </div>
      </div>

      {view === 'intros' && (
        <div className="intro-workspace">
          {introCount === 0 ? (
            <p className="intro-workspace-empty">
              No introductions yet. Open a profile and hit <strong>Request Introduction</strong> — the family is
              notified and their contact appears here.
            </p>
          ) : (
            <>
              <p className="intro-workspace-hint">
                {introsLoading ? 'Loading contacts…' : 'Everyone you have requested, newest first. Contacts stay here whenever you come back.'}
              </p>
              <ul className="intro-list">
                {(data || [])
                  .filter(t => t.applicationId && intros[t.applicationId])
                  .sort((a, b) => new Date(intros[b.applicationId]) - new Date(intros[a.applicationId]))
                  .map(t => {
                    const c = contacts[t.applicationId]
                    const when = new Date(intros[t.applicationId]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    return (
                      <li key={t.applicationId} className="intro-row">
                        <img className="intro-row-photo" src={t.mainHeadshot} alt="" />
                        <div className="intro-row-main">
                          <p className="intro-row-name">{t.name}{t.age ? <span className="intro-row-age"> · {t.age}</span> : null}</p>
                          <p className="intro-row-meta">Introduction requested {when}{c ? ' · Parent contact available' : ''}</p>
                          {c && (
                            <p className="intro-row-contact">
                              {c.guardianName && <span>{c.guardianName}</span>}
                              {c.guardianEmail && <a href={`mailto:${c.guardianEmail}`}>{c.guardianEmail}</a>}
                              {c.guardianPhone && <a href={`tel:${c.guardianPhone.replace(/[^+\d]/g, '')}`}>{c.guardianPhone}</a>}
                            </p>
                          )}
                          {notes[t.applicationId] && <p className="intro-row-note">✎ {notes[t.applicationId]}</p>}
                        </div>
                        <div className="intro-row-actions">
                          {c?.guardianEmail && (
                            <a className="modal-button modal-button-intro" href={`mailto:${encodeURIComponent(c.guardianEmail)}?subject=${encodeURIComponent(`Child Actor 101 Open Call — ${t.name}`)}`}>Email Parent</a>
                          )}
                          {c && (
                            <button type="button" className="modal-button modal-button-secondary"
                              onClick={() => navigator.clipboard?.writeText([c.guardianName, c.guardianEmail, c.guardianPhone].filter(Boolean).join('\n')).catch(() => {})}>
                              Copy Contact
                            </button>
                          )}
                        </div>
                      </li>
                    )
                  })}
              </ul>
              <p className="intro-workspace-hint">Profiles below — click any to view the full submission.</p>
            </>
          )}
        </div>
      )}

      <div className="talent-grid">
        {filteredTalent.map((talent) => (
          <TalentModal
            key={talent.id}
            talent={talent}
            isFavorited={talent.applicationId ? favoriteIds.has(talent.applicationId) : false}
            onToggleFavorite={talent.applicationId ? toggleFavorite : null}
            note={talent.applicationId ? (notes[talent.applicationId] ?? '') : ''}
            onSaveNote={talent.applicationId ? saveNote : null}
            introRequested={talent.applicationId ? Boolean(intros[talent.applicationId]) : false}
            introRequestedAt={talent.applicationId ? (intros[talent.applicationId] ?? null) : null}
            onRequestIntro={talent.applicationId ? requestIntro : null}
            onViewContact={talent.applicationId ? viewContact : null}
            contact={talent.applicationId ? (contacts[talent.applicationId] ?? null) : null}
            identity={identity}
            identityDefaults={identityDraft}
            onClearIdentity={clearIdentity}
          >
            <article className="talent-card">
              <div className="talent-card-image">
                <img src={talent.mainHeadshot} alt={talent.name} />
                {talent.videos && talent.videos.length > 0 && (
                  <div className="talent-card-badge">
                    {talent.videos.length} Video{talent.videos.length > 1 ? 's' : ''}
                  </div>
                )}
                {talent.applicationId && favoriteIds.has(talent.applicationId) && (
                  <div className="talent-card-favorite-badge" title="In your favorites">★</div>
                )}
                {talent.applicationId && notes[talent.applicationId] && (
                  <div className="talent-card-note-badge" title="You have notes on this profile">✎</div>
                )}
                {talent.applicationId && intros[talent.applicationId] && (
                  <div className="talent-card-intro-badge" title="Introduction requested">✓ Intro</div>
                )}
              </div>
              <div className="talent-card-body">
                <div className="talent-card-header">
                  <h3 className="talent-name">{talent.name}</h3>
                  {talent.age && <span className="talent-age">{talent.age} y/o</span>}
                </div>
                {talent.location && (
                  <p className="talent-location">{talent.location}</p>
                )}
                <p className="talent-union">{talent.union}</p>
              </div>
              <div className="talent-card-footer">
                <button type="button" className={`talent-card-cta${talent.applicationId && intros[talent.applicationId] ? ' talent-card-cta--contact' : ''}`}>
                  {talent.applicationId && intros[talent.applicationId] ? 'View Contact' : 'View full profile'}
                </button>
              </div>
            </article>
          </TalentModal>
        ))}

        {filteredTalent.length === 0 && (
          <div className="gallery-empty">
            <p>No matching submissions. Try adjusting your search or filters.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function RepSessionBanner({ repName, repAgency, exp, savedCount = 0, introCount = 0 }) {
  const label = repAgency || repName
  const expiryLabel = formatExpiry(exp)
  return (
    <div className="rep-session-banner">
      <span className="rep-session-name">
        Access through <strong>{label}</strong>
      </span>
      <span className="rep-session-progress" title="Your progress this Open Call">
        Saved <strong>{savedCount}</strong> · Introductions <strong>{introCount}</strong>
      </span>
      <span className="rep-session-expiry">Session expires {expiryLabel}</span>
    </div>
  )
}

function formatExpiry(exp) {
  if (!exp) return 'soon'
  const d = new Date(exp * 1000)
  const now = new Date()
  const diffMs = d - now
  if (diffMs <= 0) return 'now'

  const diffH = diffMs / (1000 * 60 * 60)
  if (diffH < 1) {
    const diffM = Math.ceil(diffMs / (1000 * 60))
    return `in ${diffM} minute${diffM !== 1 ? 's' : ''}`
  }
  if (diffH < 24) {
    const h = Math.ceil(diffH)
    return `in ${h} hour${h !== 1 ? 's' : ''}`
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
