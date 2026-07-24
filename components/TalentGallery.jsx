'use client'

import { useMemo, useState, useCallback } from 'react'
import { TalentModal } from './TalentModal'

export function TalentGallery({ data, session, initialFavorites = [] }) {
  const [search, setSearch] = useState('')
  const [unionFilter, setUnionFilter] = useState('All')
  const [favoriteIds, setFavoriteIds] = useState(() => new Set(initialFavorites))
  const [introRequested, setIntroRequested] = useState(() => new Set())

  const filteredTalent = useMemo(() => {
    return (data || []).filter((person) => {
      const name = (person.name || '').toLowerCase()
      const union = person.union || ''
      const matchesSearch = name.includes(search.toLowerCase())
      const matchesUnion = unionFilter === 'All' || union.includes(unionFilter)
      return matchesSearch && matchesUnion
    })
  }, [data, search, unionFilter])

  const toggleFavorite = useCallback(async (applicationId) => {
    const wasFavorited = favoriteIds.has(applicationId)
    // Optimistic update
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
      // Roll back optimistic update on failure
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
        return { ok: true }
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
            Search by name
          </label>
          <input
            id="talent-search"
            className="field-input"
            placeholder="Start typing an actor's name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="gallery-filter">
          <label className="field-label" htmlFor="union-filter">
            Union status
          </label>
          <select
            id="union-filter"
            className="field-select"
            value={unionFilter}
            onChange={(e) => setUnionFilter(e.target.value)}
          >
            <option value="All">Any status</option>
            <option value="SAG">SAG-AFTRA</option>
            <option value="Non-Union">Non-Union</option>
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
