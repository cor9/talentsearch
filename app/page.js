import fs from 'fs';
import path from 'path';

// Simple CSV line splitter that respects quoted values.
function splitCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result.map((cell) => cell.trim());
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });
    return row;
  });

  return { headers, rows };
}

async function loadTalentData() {
  const filePath = path.join(process.cwd(), 'Talent Submissions-Grid view.csv');

  try {
    const fileContent = await fs.promises.readFile(filePath, 'utf8');
    const { headers, rows } = parseCsv(fileContent);
    return { headers, rows, error: null };
  } catch (error) {
    console.error('Failed to read talent CSV', error);
    return {
      headers: [],
      rows: [],
      error: 'We could not load the talent data. Please check that the CSV file exists in the project root.'
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


