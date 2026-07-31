'use client'

import { useMemo, useState, useCallback } from 'react'
import { TalentModal } from './TalentModal'

export function TalentGallery({ data, session, initialFavorites = [] }) {
  const [search, setSearch] = useState('')
  const [ageFilter, setAgeFilter] = useState('All')
  const [genderFilter, setGenderFilter] = useState('All')
  const [seekingFilter, setSeekingFilter] = useState('All')
  const [favoriteIds, setFavoriteIds] = useState(() => new Set(initialFavorites))
  const [introRequested, setIntroRequested] = useState(() => new Set())

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

      return matchesSearch && matchesAge && matchesGender && matchesSeeking
    })
  }, [data, search, ageFilter, genderFilter, seekingFilter])

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

  const requestIntro = useCallback(async (applicationId, requesterData) => {
    if (introRequested.has(applicationId)) return { ok: true, existing: true }
    try {
      const res = await fetch(`/api/rep/intro/${applicationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requesterData),
      })
      const json = await res.json()
      if (res.ok) {
        setIntroRequested(prev => new Set([...prev, applicationId]))
        return { ok: true, simulated: json.simulated ?? false }
      }
      return { ok: false, error: json.error }
    } catch {
      return { ok: false, error: 'network_error' }
    }
  }, [introRequested])

  return (
    <div className="gallery">
      {session && (
        <RepSessionBanner repName={session.repName} repAgency={session.repAgency} exp={session.exp} />
      )}

      <div className="gallery-controls">
        <div className="gallery-search">
          <label className="field-label" htmlFor="talent-search">
            Search talent
          </label>
          <input
            id="talent-search"
            className="field-input"
            placeholder="Search by name, city, rep, email, notes..."
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
      </div>

      <div className="talent-grid">
        {filteredTalent.map((talent) => (
          <TalentModal
            key={talent.id}
            talent={talent}
            isFavorited={talent.applicationId ? favoriteIds.has(talent.applicationId) : false}
            onToggleFavorite={talent.applicationId ? toggleFavorite : null}
            introRequested={talent.applicationId ? introRequested.has(talent.applicationId) : false}
            onRequestIntro={talent.applicationId ? requestIntro : null}
            sessionRepName={session?.repName ?? ''}
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
                <button type="button" className="talent-card-cta">
                  View full profile
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

function RepSessionBanner({ repName, repAgency, exp }) {
  const label = repAgency || repName
  const expiryLabel = formatExpiry(exp)
  return (
    <div className="rep-session-banner">
      <span className="rep-session-name">
        Access through <strong>{label}</strong>
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
