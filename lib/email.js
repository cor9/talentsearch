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
// Uses requester identity (name, role, message) — NOT the invite recipient's name.
// Reply-To is the requester's email so the family can respond directly.
// Guardian email address is never returned to the client.

export function buildGuardianIntroHtml({ actorName, requesterName, requesterRole, requesterMessage, repAgency, eventName }) {
  const officeLabel = repAgency ? esc(repAgency) : 'an authorized representative'
  const roleLabel = requesterRole ? `, ${esc(requesterRole)}` : ''
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;color:#1a1a2e;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:#1a1a2e;padding:24px 32px;">
      <p style="margin:0;color:#e5e7eb;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">Child Actor 101</p>
      <h1 style="margin:6px 0 0;color:#fff;font-size:18px;font-weight:700;">Introduction Request — ${esc(eventName)}</h1>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
        An authorized industry professional reviewing through <strong>${officeLabel}</strong>
        has requested an introduction to <strong>${esc(actorName)}</strong>.
      </p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
        <p style="margin:0 0 4px;font-size:13px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;">Requesting party</p>
        <p style="margin:0;font-size:15px;font-weight:700;">${esc(requesterName)}${roleLabel}</p>
        ${repAgency ? `<p style="margin:2px 0 0;font-size:13px;color:#64748b;">${esc(repAgency)}</p>` : ''}
        ${requesterMessage ? `<p style="margin:10px 0 0;font-size:13px;color:#374151;font-style:italic;">"${esc(requesterMessage)}"</p>` : ''}
      </div>
      <p style="margin:0 0 14px;font-size:14px;color:#374151;line-height:1.6;">
        This person was authorized by Child Actor 101 to review submissions for
        <strong>${esc(eventName)}</strong>. Your contact information has not been shared
        with them through the gallery.
      </p>
      <p style="margin:0 0 14px;font-size:14px;color:#374151;line-height:1.6;">
        <strong>You are under no obligation to respond.</strong> This is not an audition
        invitation, casting offer, or guarantee of representation.
      </p>
      <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;">
        If you are interested in connecting, reply to this email and your message will go
        directly to the requesting party.
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
      <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">
        Questions or concerns? Contact Child Actor 101 at
        <a href="mailto:info@childactor101.com" style="color:#4f46e5;">info@childactor101.com</a>.
        <br>Child Actor 101 · childactor101.com
      </p>
    </div>
  </div>
</body></html>`
}

// ─── Requester confirmation email ─────────────────────────────────────────────
// Sent to the person who submitted the request (their email, not invite email).

export function buildRepIntroConfirmHtml({ requesterName, actorName, eventName }) {
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;color:#1a1a2e;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:#1a1a2e;padding:24px 32px;">
      <p style="margin:0;color:#e5e7eb;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">Child Actor 101</p>
      <h1 style="margin:6px 0 0;color:#fff;font-size:18px;font-weight:700;">Introduction Request Received</h1>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 16px;font-size:15px;">Hi ${esc(requesterName)},</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
        Your request for an introduction to <strong>${esc(actorName)}</strong>
        (${esc(eventName)}) has been received.
      </p>
      <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
        We have notified the family. If they are interested in connecting, they may reply
        directly to you. Their contact information remains private unless they choose to respond.
      </p>
      <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6;">
        Please do not submit duplicate introduction requests for the same performer.
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
