'use client';

import { useMemo, useState } from 'react';
import { TalentModal } from './TalentModal';

export function TalentGallery({ data }) {
  const [search, setSearch] = useState('');
  const [unionFilter, setUnionFilter] = useState('All');

  const filteredTalent = useMemo(() => {
    const searchLower = search.toLowerCase();

    return (data || []).filter((person) => {
      const union = person.union || '';

      const haystack = [
        person.name,
        person.stageName,
        person.guardianName,
        person.birthday,
        person.age && String(person.age),
        person.genderIdentity,
        person.ethnicity,
        person.email,
        person.phone,
        person.location,
        person.localHireCities,
        person.representation,
        person.seeking,
        person.castingProfiles,
        person.profileLink,
        person.supplementalNotes
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      const matchesSearch = haystack.includes(searchLower);
      const matchesUnion = unionFilter === 'All' || union.includes(unionFilter);
      return matchesSearch && matchesUnion;
    });
  }, [data, search, unionFilter]);

  return (
    <div className="gallery">
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
          <TalentModal key={talent.id} talent={talent}>
            <article className="talent-card">
              <div className="talent-card-image">
                <img src={talent.mainHeadshot} alt={talent.name} />
                {talent.videos && talent.videos.length > 0 && (
                  <div className="talent-card-badge">
                    {talent.videos.length} Video{talent.videos.length > 1 ? 's' : ''}
                  </div>
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
  );
}


