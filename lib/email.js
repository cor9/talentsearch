// SES email helper for talentsearch.
// Uses the same AWS region and from-address as pages101-web.

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'

let ses = null

function getSes() {
  if (!ses) {
    ses = new SESClient({
      region: process.env.SES_REGION || process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    })
  }
  return ses
}

function getFromAddress() {
  return process.env.SES_FROM_ADDRESS?.trim() || 'Child Actor 101 <noreply@childactor101.com>'
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function sendEmail({ to, subject, html, replyTo }) {
  await getSes().send(
    new SendEmailCommand({
      Source: getFromAddress(),
      Destination: { ToAddresses: [to] },
      ReplyToAddresses: replyTo ? [replyTo] : undefined,
      Message: {
        Subject: { Data: subject },
        Body: { Html: { Data: html } },
      },
    })
  )
}

// ─── Guardian introduction email ──────────────────────────────────────────────
// Leads with the good news. The rep's name, agency, role and email are in the
// body (not just Reply-To) so the family can reach them even if the header is
// lost in a forward. Expectation language sits quietly in the footer.

export function buildGuardianIntroHtml({ actorName, guardianName, requesterName, requesterAgency, requesterRole, requesterEmail, requesterMessage, eventName }) {
  const who = [esc(requesterName), requesterAgency ? `of ${esc(requesterAgency)}` : ''].filter(Boolean).join(' ')
  const roleLine = requesterRole ? ` (${esc(requesterRole)})` : ''
  const firstName = actorName ? esc(String(actorName).split(' ')[0]) : 'your child'
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;color:#1a1a2e;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:#1a1a2e;padding:24px 32px;">
      <p style="margin:0;color:#e5e7eb;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">Child Actor 101 · ${esc(eventName)}</p>
      <h1 style="margin:6px 0 0;color:#fff;font-size:20px;font-weight:700;">Good news from the Open Call</h1>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 16px;font-size:15px;">Hi ${esc(guardianName || 'there')},</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
        <strong>${who}</strong>${roleLine} reviewed <strong>${esc(actorName)}</strong>'s Open Call submission and
        would like to connect with you about potential representation.
      </p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
        <p style="margin:0 0 6px;font-size:12px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Who reached out</p>
        <p style="margin:0;font-size:15px;font-weight:700;">${esc(requesterName)}</p>
        ${requesterAgency ? `<p style="margin:2px 0 0;font-size:14px;color:#374151;">${esc(requesterAgency)}${requesterRole ? ` · ${esc(requesterRole)}` : ''}</p>` : (requesterRole ? `<p style="margin:2px 0 0;font-size:14px;color:#374151;">${esc(requesterRole)}</p>` : '')}
        <p style="margin:6px 0 0;font-size:14px;"><a href="mailto:${esc(requesterEmail)}" style="color:#4f46e5;">${esc(requesterEmail)}</a></p>
        ${requesterMessage ? `<p style="margin:12px 0 0;font-size:14px;color:#374151;font-style:italic;line-height:1.5;">"${esc(requesterMessage)}"</p>` : ''}
      </div>
      <p style="margin:0 0 14px;font-size:15px;color:#1a1a2e;line-height:1.6;">
        ${esc(requesterName.split(' ')[0])} has now received the contact information you provided with your Open Call
        submission and may reach out to you directly. You can also reply to this email, or write to
        <a href="mailto:${esc(requesterEmail)}" style="color:#4f46e5;">${esc(requesterEmail)}</a>, whenever you are ready.
      </p>
      <p style="margin:0 0 20px;font-size:15px;color:#1a1a2e;line-height:1.6;">
        <strong>Please try to respond within the next few days</strong>, even if it is simply to arrange a better time
        to talk. Reps move quickly this time of year, and a short reply keeps ${firstName} on their radar.
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
      <p style="margin:0 0 8px;font-size:12px;color:#9ca3af;line-height:1.5;">
        ${esc(requesterName)} is an authorized participant in the Child Actor 101 Open Call. Your contact information
        was shared with them because you consented to participating representatives contacting you when you submitted.
        An introduction is a conversation, not an audition invitation, offer, or guarantee of representation. You decide
        what happens next.
      </p>
      <p style="margin:0;font-size:12px;color:#9ca3af;">
        Questions or concerns? Contact Child Actor 101 at
        <a href="mailto:info@childactor101.com" style="color:#4f46e5;">info@childactor101.com</a>.
        <br>Child Actor 101 · childactor101.com
      </p>
    </div>
  </div>
</body></html>`
}

// ─── Requester confirmation email ─────────────────────────────────────────────
// A record for the rep's inbox: who they asked about and how to reach the family.

export function buildRepIntroConfirmHtml({ requesterName, actorName, guardianName, guardianEmail, guardianPhone, eventName }) {
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;color:#1a1a2e;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:#1a1a2e;padding:24px 32px;">
      <p style="margin:0;color:#e5e7eb;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">Child Actor 101 · ${esc(eventName)}</p>
      <h1 style="margin:6px 0 0;color:#fff;font-size:18px;font-weight:700;">Introduction requested: ${esc(actorName)}</h1>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 16px;font-size:15px;">Hi ${esc(requesterName)},</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
        ${esc(actorName)}'s family has been notified that you would like to connect. Here is the contact
        information they provided with their submission.
      </p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
        <p style="margin:0 0 6px;font-size:12px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Parent / guardian</p>
        <p style="margin:0;font-size:15px;font-weight:700;">${esc(guardianName || '')}</p>
        <p style="margin:4px 0 0;font-size:14px;"><a href="mailto:${esc(guardianEmail)}" style="color:#4f46e5;">${esc(guardianEmail)}</a></p>
        ${guardianPhone ? `<p style="margin:4px 0 0;font-size:14px;color:#374151;">${esc(guardianPhone)}</p>` : ''}
      </div>
      <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
        We recommend reaching out directly within the next few days. This contact is also available any time under
        <strong>Introductions</strong> in the gallery.
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
      <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">
        This family consented to being contacted by participating representatives. Please use their information only
        for this introduction. Questions? <a href="mailto:info@childactor101.com" style="color:#4f46e5;">info@childactor101.com</a>
        <br>Child Actor 101 · childactor101.com
      </p>
    </div>
  </div>
</body></html>`
}

// ─── Rep access invitation (self-registration path) ───────────────────────────
// Mirrors the invite email pages101-web sends for direct invites so a rep who
// registered via a group link gets the same message as one Corey invited.

export function buildRepInviteHtml({ repName, eventName, inviteUrl, expiresAt, reviewClose, sourceName }) {
  const fmt = (iso) => new Date(iso).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles',
  })
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;color:#1a1a2e;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:#1a1a2e;padding:24px 32px;">
      <p style="margin:0;color:#e5e7eb;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">Child Actor 101</p>
      <h1 style="margin:6px 0 0;color:#fff;font-size:20px;font-weight:700;">Open Call — Your Personal Access Link</h1>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 16px;font-size:15px;">Hi ${esc(repName)},</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
        Thanks for registering${sourceName ? ` through <strong>${esc(sourceName)}</strong>` : ''}. Here is your personal link to review
        talent submissions for the <strong>${esc(eventName)}</strong>. The review window closes on
        <strong>${fmt(reviewClose)}</strong>.
      </p>
      <p style="text-align:center;margin:28px 0;">
        <a href="${esc(inviteUrl)}" style="display:inline-block;background:#1a1a2e;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;">
          Access the Talent Gallery →
        </a>
      </p>
      <p style="margin:0 0 12px;font-size:13px;color:#6b7280;line-height:1.5;">
        This link is yours. It expires on <strong>${fmt(expiresAt)}</strong>, and you can click it any time before then
        to get back in. If a colleague wants access, send them the registration link you used so they get their own.
      </p>
      <p style="margin:0 0 12px;font-size:13px;color:#6b7280;line-height:1.5;">
        You are reviewing materials submitted by performing families who have specifically consented
        to their submissions being seen by authorized industry representatives. Please treat all
        submissions with professional discretion.
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
      <p style="margin:0;font-size:12px;color:#9ca3af;">
        Questions? Contact us at
        <a href="mailto:info@childactor101.com" style="color:#4f46e5;">info@childactor101.com</a>.
        <br>Child Actor 101 · childactor101.com
      </p>
    </div>
  </div>
</body></html>`
}
