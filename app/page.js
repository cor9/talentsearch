import { getSubmissions } from '../lib/airtable';
import { TalentGallery } from '../components/TalentGallery';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const { submissions, error } = await getSubmissions();

  return (
    <main className="page">
      <header>
        <div className="hero-banner">
          <img src="/11k.jpeg" alt="Child Actor 101 10K Strong Open Call" />
        </div>
        <div className="page-header">
          <div className="hero-text">
            <div className="hero-brand-row">
              <img src="/101logo.png" alt="Child Actor 101 logo" className="hero-logo" />
              <span className="brand">Child Actor 101</span>
            </div>
            <p className="eyebrow">Attention Youth Talent Agents and Managers!</p>
            <h1 className="page-title">Child Actor 101 Online Talent Representation Open Call</h1>
            <p className="page-subtitle">
              Over 100 youth actors across the United States seeking representation — ready for theatrical, commercial,
              voiceover, and regional opportunities.
            </p>
          </div>
          <div className="hero-card">
            <div className="hero-card-top">
              <p className="hero-pill">10th Open Call</p>
              <p className="hero-highlight">100+ Youth Actors</p>
              <p className="hero-copy">
                Each submission includes multiple headshots, video links, and casting profiles so you can quickly
                connect with performers who match your current rosters and wish lists.
              </p>
            </div>
          </div>
        </div>
      </header>

      <section className="page-section">
        <div className="nav-links">
          <a
            href="https://childactor101.com"
            target="_blank"
            rel="noreferrer"
            className="nav-button"
          >
            <img src="/101logo.png" alt="Child Actor 101" className="nav-button-icon" />
            <span>Home – ChildActor101.com</span>
          </a>
          <a
            href="https://directory.childactor101.com"
            target="_blank"
            rel="noreferrer"
            className="nav-button nav-button-secondary"
          >
            <img src="/logo.png" alt="Industry Directory" className="nav-button-icon" />
            <span>Child Actor 101 Industry Directory</span>
          </a>
        </div>

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
              <img src="/corey.jpeg" alt="Corey Ralston" className="signature-photo" />
              <p className="signature-name">Corey Ralston</p>
              <p>Founder of Child Actor 101</p>
              <p>Director of Youth Talent for Bohemia Group</p>
            </div>
          </div>
        </div>

        <div className="section-header">
          <h2>Talent Gallery</h2>
          <p className="section-description">
            Click any card to view all photos, video links, resumes, and casting profiles provided by the actor.
          </p>
        </div>

        {error ? (
          <div className="alert alert-error">
            <span>{error}</span>
          </div>
        ) : submissions.length === 0 ? (
          <div className="alert">
            <span>No submissions are currently available. Please check back as new talent is added.</span>
          </div>
        ) : (
          <TalentGallery data={submissions} />
        )}
      </section>
    </main>
  );
}


