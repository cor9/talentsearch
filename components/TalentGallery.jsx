'use client';

import { useMemo, useState } from 'react';
import { TalentModal } from './TalentModal';

export function TalentGallery({ data }) {
  const [search, setSearch] = useState('');
  const [unionFilter, setUnionFilter] = useState('All');
  const [ageFilter, setAgeFilter] = useState('All');
  const [genderFilter, setGenderFilter] = useState('All');
  const [seekingFilter, setSeekingFilter] = useState('All');

  const filteredTalent = useMemo(() => {
    const searchLower = search.toLowerCase();

    return (data || []).filter((person) => {
      const union = person.union || '';
      const ageNum = typeof person.age === 'number' ? person.age : parseInt(person.age || '', 10);
      const genderRaw = (person.genderIdentity || '').toLowerCase().trim();
      const seeking = (person.seeking || '').toLowerCase();

      // Normalize gender to strict buckets based on Gender Identity field:
      // expected values: "Male", "Female", "Non-binary/Other"
      let normalizedGender = 'other';
      if (genderRaw.startsWith('non') || genderRaw.includes('other')) {
        normalizedGender = 'nonbinary';
      } else if (genderRaw.startsWith('f') || genderRaw.includes('female')) {
        normalizedGender = 'female';
      } else if (genderRaw.startsWith('m') || genderRaw.includes('male')) {
        normalizedGender = 'male';
      }

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

      const matchesAge =
        ageFilter === 'All' || Number.isNaN(ageNum)
          ? true
          : (ageFilter === 'Under10' && ageNum < 10) ||
            (ageFilter === '10-13' && ageNum >= 10 && ageNum <= 13) ||
            (ageFilter === '14-17' && ageNum >= 14 && ageNum <= 17) ||
            (ageFilter === '18Plus' && ageNum >= 18);

      const matchesGender =
        genderFilter === 'All'
          ? true
          : (genderFilter === 'Female' && normalizedGender === 'female') ||
            (genderFilter === 'Male' && normalizedGender === 'male') ||
            (genderFilter === 'NonBinary' && normalizedGender === 'nonbinary');

      const matchesSeeking =
        seekingFilter === 'All'
          ? true
          : seeking.includes(seekingFilter.toLowerCase());

      return matchesSearch && matchesUnion && matchesAge && matchesGender && matchesSeeking;
    });
  }, [data, search, unionFilter, ageFilter, genderFilter, seekingFilter]);

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
            <option value="theatrical">Theatrical</option>
            <option value="manager">Manager</option>
            <option value="commercial">Commercial</option>
            <option value="voice">Voiceover</option>
            <option value="regional">Regional</option>
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


