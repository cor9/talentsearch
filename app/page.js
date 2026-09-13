import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
// ─── Data source: Pages101 / Supabase ────────────────────────────────────────
// Active adapter. Event-scoped query runs server-side with the service role.
// To roll back to Airtable:
//   1. Replace the two imports below with:
//        import { getSubmissions } from '../lib/airtable'
//   2. Change the getSubmissions call to:
//        await getSubmissions()   (no argument)
//   3. Ensure AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_ID are set.
import { getSubmissions } from '../lib/pages101'
// ─────────────────────────────────────────────────────────────────────────────
import { verifySession, COOKIE_NAME } from '../lib/session'
import { findInviteById, findEventById, getFavorites } from '../lib/supabase-p101'
import { TalentGallery } from '../components/TalentGallery'
import Image from 'next/image'
import { OPEN_CALL } from '../config/opencall'

export const dynamic = 'force-dynamic'

export default async function Page() {
  // ─── Session verification ─────────────────────────────────────────────────
  // Middleware already checked cookie signature; here we do the full DB check.
  const cookieStore = cookies()
  const sessionValue = cookieStore.get(COOKIE_NAME)?.value
  const secret = process.env.TALENTSEARCH_SESSION_SECRET

  const session = verifySession(sessionValue, secret)
  if (!session) {
    redirect('/denied')
  }

  // Full revocation + expiry check against Supabase
  let invite
  try {
    invite = await findInviteById(session.iid)
  } catch {
    redirect('/denied')
  }

  if (!invite || invite.revoked_at) {
    redirect('/denied?r=revoked')
  }
  if (new Date(invite.expires_at) <= new Date()) {
    redirect('/denied?r=expired')
  }
  // Verify invite belongs to the session's event (defense in depth)
  if (invite.event_id !== session.eid) {
    redirect('/denied')
  }

  // Event review window check
  let event
  try {
    event = await findEventById(session.eid)
  } catch {
    redirect('/denied')
  }

  if (!event) {
    redirect('/denied')
  }
  if (new Date(event.review_close) <= new Date()) {
    redirect('/denied?r=closed')
  }
  if (!['reviewing', 'open', 'closed'].includes(event.status)) {
    redirect('/denied?r=unavailable')
  }

  // ─── Fetch favorites ──────────────────────────────────────────────────────
  let initialFavorites = []
  try {
    const rows = await getFavorites(session.iid)
    initialFavorites = rows.map(r => r.application_id)
  } catch {
    // Non-fatal — favorites just won't be pre-populated
  }

  const sessionInfo = {
    repName: session.rn,
    repAgency: session.ra ?? null,
    exp: session.exp,
  }

  // ─── Fetch gallery data (Pages101/Supabase, event-scoped) ─────────────────
  // eventId is derived from the validated session — never from a client parameter.
  // The page has force-dynamic so all fetches in this render are uncached.
  const { submissions, error } = await getSubmissions(session.eid)
  const isTestGallery = event?.is_test === true
  const reviewCloseLabel = formatReviewClose(event.review_close)

  return (
    <main className="page">
      {isTestGallery && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 9999,
          background: '#dc2626', color: '#fff',
          textAlign: 'center', padding: '10px 16px',
          fontWeight: 700, fontSize: 13, letterSpacing: '0.1em',
        }}>
          TEST GALLERY — FICTIONAL SEED DATA — DO NOT SHARE OR FORWARD THIS LINK
        </div>
      )}
      <header>
        <div className="hero-banner">
          <Image
            src="/11k.jpeg"
            alt={`Child Actor 101 ${OPEN_CALL.edition} Open Call`}
            width={800}
            height={600}
            priority
            style={{ width: '100%', height: 'auto' }}
          />
        </div>
        <div className="page-header">
          <div className="hero-text">
            <div className="hero-brand-row">
              <Image
                src="/101logo.png"
                alt="Child Actor 101 logo"
                className="hero-logo"
                width={32}
                height={32}
              />
              <span className="brand">Child Actor 101</span>
            </div>
            <p className="eyebrow">Attention Youth Talent Agents and Managers!</p>
            <h1 className="page-title">{OPEN_CALL.eventTitle}</h1>
            <p className="page-subtitle">
              Over {OPEN_CALL.headshotCount} youth actors across the United States seeking representation — ready for theatrical, commercial,
              voiceover, and regional opportunities.
            </p>
          </div>
          <div className="hero-card">
            <div className="hero-card-top">
              <p className="hero-pill">{OPEN_CALL.edition} Open Call</p>
              <p className="hero-highlight">{OPEN_CALL.headshotCount} Youth Actors</p>
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
              This is the {OPEN_CALL.edition} time we have been able to provide this to our parent resource community at absolutely no
              cost to them at all. And over the past six years we have seen some incredible success stories of talent
              that has been picked up from this opportunity we provide.
            </p>
            <p>
              There are well over {OPEN_CALL.headshotCount} submissions from actors across the United States that are looking for reps for
              the first time or are looking to expand their team by adding a Theatrical Agent, a Manager or a Regional
              Agency, etc. To connect with families, use the <strong>Request Introduction</strong> button on each profile — we will
              notify the family so they can reach out to you directly.
            </p>
            <p>
              The goal of this Open Call is to reach every possible Agent and Manager that is youth oriented and
              currently looking for talent. Your link is for your office, so share it freely with the agents, managers
              and assistants on your team. If a colleague at another company wants in, send them my way and I will
              get them their own link.
            </p>
            <p>
              The gallery is open through <strong>{reviewCloseLabel}</strong>. Questions? There is a short{' '}
              <a href="#rep-faq">FAQ at the bottom of this page</a>.
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
              <Image
                src="/corey.jpeg"
                alt="Corey Ralston"
                className="signature-photo"
                width={60}
                height={60}
              />
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
            <span>No submissions are currently available for this event. Please check back as talent is added.</span>
          </div>
        ) : (
          <TalentGallery
            data={submissions}
            session={sessionInfo}
            initialFavorites={initialFavorites}
          />
        )}
        <div className="rep-faq" id="rep-faq">
          <h2>Questions Reps Ask Me Every Year</h2>
          <div className="rep-faq-grid">
            <div className="rep-faq-item">
              <h3>How do I get back in later?</h3>
              <p>
                Click the same button in your invitation email. Every click starts a fresh 8-hour session, so keep
                the email handy. If you bookmark this page instead, you will land on an &quot;Access Required&quot;
                screen (the page cannot tell who you are without the link).
              </p>
            </div>
            <div className="rep-faq-item">
              <h3>Can I share this with my office?</h3>
              <p>
                Yes. Your link covers your whole company: agents, managers, assistants, interns who are secretly
                running the place. Please do not forward it outside your office. If someone at another agency
                wants access, email <a href="mailto:info@childactor101.com">info@childactor101.com</a> and I will
                send them their own link. It keeps the families&apos; materials accounted for.
              </p>
            </div>
            <div className="rep-faq-item">
              <h3>How do I contact a family?</h3>
              <p>
                Open a profile and click <strong>Request Introduction</strong>. Enter your name, email, role and an
                optional note. We email the family with your details, and if they are interested they reply straight
                to you. You get a confirmation email when the request goes out. Family contact information is never
                shown in the gallery, and one request per performer is plenty.
              </p>
            </div>
            <div className="rep-faq-item">
              <h3>What does the star do?</h3>
              <p>
                Favorites. Star the performers you want to come back to and they stay starred every time you return
                on your link. Favorites are saved to the link itself, so if your office shares one link, you share one
                list. Other offices cannot see it.
              </p>
            </div>
            <div className="rep-faq-item">
              <h3>How long is the gallery open?</h3>
              <p>
                Through <strong>{reviewCloseLabel}</strong>. After that the link stops working. Take your time, but
                do not sit on the ones you love. Other offices are looking at the same kids.
              </p>
            </div>
            <div className="rep-faq-item">
              <h3>Some of these kids already have reps?</h3>
              <p>
                Some do. Families tell us whether they currently have representation and what they are looking to
                add (a manager looking for a theatrical agent, a regional actor looking for LA commercial, etc.).
                That is shown on each profile. Use the <strong>Seeking</strong> filter to narrow to your lane.
              </p>
            </div>
            <div className="rep-faq-item">
              <h3>How old are they, really?</h3>
              <p>
                Age is calculated from the birth month and year the family provided. We show the birth year only.
                Every submission was made by a parent or guardian who consented to authorized industry
                representatives viewing their child&apos;s materials.
              </p>
            </div>
            <div className="rep-faq-item">
              <h3>A video will not play or a link is dead.</h3>
              <p>
                Families provide their own links, and every year a few are set to private or typed wrong. Email{' '}
                <a href="mailto:info@childactor101.com">info@childactor101.com</a> with the performer&apos;s name and
                we will chase the family down for you.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

function formatReviewClose(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles',
  })
}
