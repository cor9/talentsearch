const API_KEY = process.env.AIRTABLE_API_KEY;
const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE_ID_OR_NAME = process.env.AIRTABLE_TABLE_ID || process.env.AIRTABLE_TABLE_NAME || 'Submissions';
const VIEW_NAME = process.env.AIRTABLE_VIEW || 'Grid view';

function getAllAttachments(field) {
  if (Array.isArray(field)) {
    return field
      .map((f) => (f && typeof f === 'object' && f.url ? f.url : null))
      .filter(Boolean);
  }
  return [];
}

function getString(field) {
  return field ? String(field) : '';
}

export async function getSubmissions() {
  if (!API_KEY || !BASE_ID || !TABLE_ID_OR_NAME) {
    return {
      submissions: [],
      error:
        'Airtable environment variables are missing. Please set AIRTABLE_API_KEY, AIRTABLE_BASE_ID, and AIRTABLE_TABLE_ID or AIRTABLE_TABLE_NAME.'
    };
  }

  const params = new URLSearchParams();
  params.set('view', VIEW_NAME);
  // Only show rows the sheet has marked as selected
  params.set('filterByFormula', '{Selects} = 1');

  const url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(
    TABLE_ID_OR_NAME
  )}?${params.toString()}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${API_KEY}`
      },
      cache: 'no-store'
    });

    if (!res.ok) {
      console.error('Airtable API error', res.status, res.statusText);
      return {
        submissions: [],
        error: `We could not load talent data from Airtable (status ${res.status}).`
      };
    }

    const data = await res.json();
    const records = Array.isArray(data.records) ? data.records : [];

    const submissions = records.map((record) => {
      const fields = record.fields || {};

      const images = [
        ...getAllAttachments(fields['Headshot Commercial']),
        ...getAllAttachments(fields['Headshot Theatrical']),
        ...getAllAttachments(fields['Other Headshot'])
      ];

      const videos = [];
      if (fields['Video Link (SLATE)']) {
        videos.push({
          label: 'Slate',
          url: getString(fields['Video Link (SLATE)'])
        });
      }
      if (fields['Video Link (Reel, Clips, Self Tape)']) {
        videos.push({
          label: 'Reel / Clips',
          url: getString(fields['Video Link (Reel, Clips, Self Tape)'])
        });
      }
      if (fields['Other Video Link']) {
        videos.push({
          label: 'Other Video',
          url: getString(fields['Other Video Link'])
        });
      }

      const resumeAttachments = getAllAttachments(fields['Resume']);

      return {
        id: record.id,
        name: getString(fields['Actor’s Name']),
        age: fields['Age'] ?? '',
        union: getString(fields['Union Status']) || 'Non-Union',
        location: getString(fields['City, State (Province), Country']),
        mainHeadshot: images[0] || '/11k.jpeg',
        allImages: images,
        videos,
        resume: resumeAttachments[0] || '',
        profileLink: getString(
          fields['Casting Profile Link (Actors Access or Casting Networks only)']
        )
      };
    });

    return { submissions, error: null };
  } catch (error) {
    console.error('Failed to fetch Airtable submissions', error);
    return {
      submissions: [],
      error: 'We could not load talent data from Airtable.'
    };
  }
}


