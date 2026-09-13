// Rep self-registration: GET /join?g=<registration-token>
// Validates the reusable registration link server-side and renders the form.
// This page never issues a gallery session. The personal invite created by
// /api/join is emailed to the rep and redeemed through /access like any other.

import './join.css'
import { validateRegistrationToken, REGISTRATION_DENIED } from '../../lib/registration'
import { OPEN_CALL } from '../../config/opencall'
import { JoinForm } from './JoinForm'

export const dynamic = 'force-dynamic'

export default async function JoinPage({ searchParams }) {
  const rawToken = searchParams?.g ?? ''
  const result = await validateRegistrationToken(rawToken)

  if (!result.ok) {
    const { heading, body } = REGISTRATION_DENIED[result.reason] ?? REGISTRATION_DENIED.error
    return (
      <div className="join-page">
        <div className="join-card" style={{ textAlign: 'center' }}>
          <div className="join-success-icon">🔒</div>
          <h1 className="join-heading">{heading}</h1>
          <p className="join-body">{body}</p>
          <p className="join-fine">
            Questions? Contact <a href="mailto:info@childactor101.com">info@childactor101.com</a>
          </p>
        </div>
      </div>
    )
  }

  const { link, event } = result
  const closeLabel = new Date(event.review_close).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles',
  })

  return (
    <div className="join-page">
      <div className="join-card">
        <p className="join-eyebrow">Child Actor 101 · {OPEN_CALL.edition} Open Call</p>
        <h1 className="join-heading">Register for Representative Access</h1>
        <p className="join-body">
          You&apos;re registering through <strong>{link.source_name}</strong>. Enter your details and we&apos;ll
          email you a personal link to the talent gallery. The gallery is open through <strong>{closeLabel}</strong>.
        </p>
        <JoinForm token={rawToken} sourceName={link.source_name} />
        <p className="join-fine">
          Access is for youth talent agents, managers and their staff. Your personal link should not be shared;
          colleagues can register here for their own. Families who submitted have consented to review by
          authorized industry representatives only.
        </p>
      </div>
    </div>
  )
}
