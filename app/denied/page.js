import './denied.css'

export const dynamic = 'force-dynamic'

const MESSAGES = {
  revoked: {
    heading: 'Access Revoked',
    body: 'This invitation has been revoked. If you believe this is an error, please contact the person who sent you the invitation.',
  },
  expired: {
    heading: 'Invitation Expired',
    body: 'Your access period has ended. Please contact Child Actor 101 if you need to request a new invitation.',
  },
  closed: {
    heading: 'Review Period Closed',
    body: 'The review window for this Open Call has closed. No further access is available.',
  },
  unknown: {
    heading: 'Invalid Invitation',
    body: 'This invitation link is not recognized. Please check that you are using the original link from the invitation email.',
  },
  unavailable: {
    heading: 'Gallery Unavailable',
    body: 'The Open Call gallery is not currently accepting representative access. Please check back when the review period opens.',
  },
  default: {
    heading: 'Access Required',
    body: 'Representative access is required to view this gallery. Please use the secure invitation link from your invitation email.',
  },
}

export default function DeniedPage({ searchParams }) {
  const reason = searchParams?.r ?? 'default'
  const { heading, body } = MESSAGES[reason] ?? MESSAGES.default

  return (
    <div className="denied-page">
      <div className="denied-card">
        <div className="denied-icon">🔒</div>
        <h1 className="denied-heading">{heading}</h1>
        <p className="denied-body">{body}</p>
        <a
          className="creator-access"
          href="https://pages.childactor101.com/login?next=%2Fdashboard%2Fadmin%2Fopencall%2Fsubmissions"
        >
          <span>Creator of this Open Call?</span>
          <strong>Open your owner gallery</strong>
        </a>
        <p className="creator-access-help">
          Sign in with your Pages101 owner email. Representative invitations are only for outside agents and managers.
        </p>
        <hr className="denied-divider" />
        <p className="denied-contact">
          Questions? Contact{' '}
          <a href="mailto:info@childactor101.com">info@childactor101.com</a>
        </p>
      </div>
    </div>
  )
}
