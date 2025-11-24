export const dynamic = 'force-dynamic';

async function loadTalentData() {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableIdOrName = process.env.AIRTABLE_TABLE_ID || process.env.AIRTABLE_TABLE_NAME;
  const viewName = process.env.AIRTABLE_VIEW || 'Grid view';

  if (!apiKey || !baseId || !tableIdOrName) {
    return {
      headers: [],
      rows: [],
      error:
        'Airtable environment variables are missing. Please set AIRTABLE_API_KEY, AIRTABLE_BASE_ID, and AIRTABLE_TABLE_ID or AIRTABLE_TABLE_NAME.'
    };
  }

  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(
    tableIdOrName
  )}?view=${encodeURIComponent(viewName)}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      cache: 'no-store'
    });

    if (!res.ok) {
      console.error('Airtable API error', res.status, res.statusText);
      return {
        headers: [],
        rows: [],
        error: `We could not load talent data from Airtable (status ${res.status}).`
      };
    }

    const data = await res.json();
    const records = Array.isArray(data.records) ? data.records : [];

    const headerSet = new Set();
    records.forEach((record) => {
      const fields = record.fields || {};
      Object.keys(fields).forEach((key) => headerSet.add(key));
    });

    const headers = Array.from(headerSet);
    const rows = records.map((record) => record.fields || {});

    return { headers, rows, error: null };
  } catch (error) {
    console.error('Failed to fetch Airtable data', error);
    return {
      headers: [],
      rows: [],
      error: 'We could not load talent data from Airtable.'
    };
  }
}

function formatCell(value) {
  if (value === null || value === undefined) return '';

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item && typeof item === 'object') {
          // Common Airtable attachment shape: { id, url, filename, ... }
          return item.url || item.filename || item.name || '';
        }
        return String(item);
      })
      .filter(Boolean)
      .join(', ');
  }

  if (typeof value === 'object') {
    if ('url' in value || 'filename' in value || 'name' in value) {
      // Handle single attachment-like object
      return value.url || value.filename || value.name || '';
    }
    return JSON.stringify(value);
  }

  return String(value);
}

export default async function Page() {
  const { headers, rows, error } = await loadTalentData();

  return (
    <main className="page">
      <header className="page-header">
        <div className="hero-text">
          <p className="eyebrow">Attention Youth Talent Agents and Managers!</p>
          <h1 className="page-title">Child Actor 101 Online Talent Representation Open Call</h1>
          <p className="page-subtitle">
            Over 100 youth actors across the United States seeking representation — ready for theatrical, commercial,
            voiceover, and regional opportunities.
          </p>
        </div>
        <div className="hero-card">
          <p className="hero-pill">10th Open Call</p>
          <p className="hero-highlight">100+ Youth Actors</p>
          <p className="hero-copy">
            Each submission includes multiple headshots, video links, and casting profiles so you can quickly connect
            with performers who match your current rosters and wish lists.
          </p>
        </div>
      </header>

      <section className="page-section">
        <div className="copy-grid">
          <div className="copy-block">
            <p>
              I am very happy to share the submissions from the Child Actor 101 Online Talent Representation Open Call.
              This is the 10th time we have been able to provide this to our parent resource community at absolutely no
              cost to them at all. And over the past six years we have seen some incredible success stories of talent
              that has been picked up from this opportunity we provide.
            </p>
            <p>
              There are well over 100+ submissions from actors across the United States that are looking for reps for
              the first time or are looking to expand their team by adding a Theatrical Agent, a Manager or a Regional
              Agency, etc. All of their contact information is available to you to reach out to those that peak your
              interest. There is no need to ask for permission to do so.
            </p>
            <p>
              The goal of this Open Call is to reach every possible Agent and Manager that is youth oriented and
              currently looking for talent, so feel free to share this link with your trusted colleagues.
            </p>
          </div>
          <div className="copy-block copy-block--accent">
            <h3 className="copy-heading">What you&apos;ll find in each entry</h3>
            <ul className="copy-list">
              <li>2–3 headshots or snapshots</li>
              <li>A video slate introduction link</li>
              <li>A video link to an acting performance or reel</li>
              <li>A link to an Actors Access or Casting Networks page</li>
            </ul>
            <p className="copy-note">
              You can filter and search within the gallery link. Please let me know if you have any trouble at all!
            </p>
            <div className="signature">
              <p className="signature-name">Corey Ralston</p>
              <p>Founder of Child Actor 101</p>
              <p>Director of Youth Talent for Bohemia Group</p>
            </div>
          </div>
        </div>

        <div className="section-header">
          <h2>Submissions Grid</h2>
          <p className="section-description">
            This gallery is powered by live data from Airtable. As new submissions are approved, they&apos;ll appear
            here for you and your team.
          </p>
        </div>

        {error ? (
          <div className="alert alert-error">
            <span>{error}</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="alert">
            <span>No submissions are currently available. Please check back as new talent is added.</span>
          </div>
        ) : (
          <div className="table-shell">
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    {headers.map((header) => (
                      <th key={header}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {headers.map((header) => (
                        <td key={header}>{formatCell(row[header])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="table-footnote">
              Showing {rows.length.toLocaleString()} submissions and {headers.length} columns sourced directly from
              Airtable.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}


