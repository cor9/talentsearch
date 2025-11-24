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

export default async function Page() {
  const { headers, rows, error } = await loadTalentData();

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Talent Submissions</h1>
          <p className="page-subtitle">
            Centralized access to submissions for <span className="brand">Child Actor 101</span>.
          </p>
        </div>
      </header>

      <section className="page-section">
        <div className="section-header">
          <h2>Submissions Grid</h2>
          <p className="section-description">
            This table is generated directly from the latest CSV export, so updates to the file are reflected on
            the next deployment.
          </p>
        </div>

        {error ? (
          <div className="alert alert-error">
            <span>{error}</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="alert">
            <span>No submissions found in the CSV file.</span>
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
                        <td key={header}>{row[header]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="table-footnote">
              Showing {rows.length.toLocaleString()} submissions and {headers.length} columns from the CSV file.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}


