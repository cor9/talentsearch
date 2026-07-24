'use client'

import { useState } from 'react'

export function TalentModal({
  talent,
  children,
  isFavorited = false,
  onToggleFavorite = null,
  introRequested = false,
  onRequestIntro = null,
  sessionRepName = '',
}) {
  const [open, setOpen] = useState(false)
  const [favoriting, setFavoriting] = useState(false)

  // Introduction flow: idle → form → sending → sent | error
  const [introStep, setIntroStep] = useState(introRequested ? 'sent' : 'idle')
  const [introForm, setIntroForm] = useState({
    requesterName: sessionRepName,
    requesterEmail: '',
    requesterRole: '',
    requesterMessage: '',
  })
  const [introError, setIntroError] = useState(null)

  async function handleToggleFavorite(e) {
    e.stopPropagation()
    if (!onToggleFavorite || favoriting) return
    setFavoriting(true)
    try {
      await onToggleFavorite(talent.applicationId)
    } finally {
      setFavoriting(false)
    }
  }

  async function handleIntroSubmit(e) {
    e.preventDefault()
    if (!onRequestIntro || introStep === 'sending') return
    setIntroStep('sending')
    setIntroError(null)

    const result = await onRequestIntro(talent.applicationId, {
      requesterName: introForm.requesterName.trim(),
      requesterEmail: introForm.requesterEmail.trim(),
      requesterRole: introForm.requesterRole.trim(),
      requesterMessage: introForm.requesterMessage.trim(),
    })

    if (result.ok) {
      setIntroStep('sent')
    } else {
      setIntroStep('form')
      const msgs = {
        requester_name_required: 'Please enter your name.',
        requester_email_invalid: 'Please enter a valid email address.',
        requester_role_too_long: 'Role must be under 120 characters.',
        requester_message_too_long: 'Message must be under 1000 characters.',
        email_delivery_failed: 'Email delivery failed. Please try again.',
        network_error: 'Network error. Please try again.',
      }
      setIntroError(msgs[result.error] ?? 'Something went wrong. Please try again.')
    }
  }

  return (
    <>
      <div className="talent-card-trigger" onClick={() => setOpen(true)}>
        {children}
      </div>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal-shell" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <div>
                <h3 className="modal-title">
                  {talent.name || 'Untitled'}{' '}
                  <span className="modal-union-pill">{talent.union}</span>
                </h3>
                <p className="modal-subtitle">
                  {talent.age && `${talent.age} years old`}
                  {talent.age && talent.location ? ' • ' : ''}
                  {talent.location}
                </p>
              </div>
              <button className="modal-close" type="button" onClick={() => setOpen(false)}>
                ✕
              </button>
            </header>

            <div className="modal-body">
              {talent.videos && talent.videos.length > 0 && (
                <section className="modal-section">
                  <h4 className="modal-section-title">Videos</h4>
                  <div className="modal-video-grid">
                    {talent.videos.map((video, idx) => (
                      <a
                        key={idx}
                        href={video.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="modal-video-link"
                      >
                        <span className="modal-video-icon">▶</span>
                        <span className="modal-video-label">{video.label}</span>
                      </a>
                    ))}
                  </div>
                </section>
              )}

              <section className="modal-section">
                <h4 className="modal-section-title">
                  Photos {talent.allImages && talent.allImages.length
                    ? `(${talent.allImages.length})`
                    : ''}
                </h4>
                {talent.allImages && talent.allImages.length > 0 ? (
                  <div className="modal-photo-grid">
                    {talent.allImages.map((img, idx) => (
                      <div key={idx} className="modal-photo">
                        <img src={img} alt={`${talent.name} photo ${idx + 1}`} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="modal-empty">No photos available for this submission.</p>
                )}
              </section>

              <footer className="modal-footer">
                {talent.resume && (
                  <a
                    href={talent.resume}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="modal-button modal-button-primary"
                  >
                    View Resume
                  </a>
                )}
                {talent.profileLink && (
                  <a
                    href={talent.profileLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="modal-button modal-button-secondary"
                  >
                    Casting Profile
                  </a>
                )}

                {onToggleFavorite && (
                  <button
                    type="button"
                    className={`modal-button modal-button-favorite ${isFavorited ? 'is-favorited' : ''}`}
                    onClick={handleToggleFavorite}
                    disabled={favoriting}
                    aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    {isFavorited ? '★ Favorited' : '☆ Favorite'}
                  </button>
                )}

                {onRequestIntro && (
                  <div className="modal-intro-wrap">
                    {introStep === 'idle' && (
                      <button
                        type="button"
                        className="modal-button modal-button-intro"
                        onClick={() => setIntroStep('form')}
                      >
                        Request Introduction
                      </button>
                    )}

                    {(introStep === 'form' || introStep === 'sending') && (
                      <form className="modal-intro-form" onSubmit={handleIntroSubmit}>
                        <p className="modal-intro-form-title">Request introduction to {talent.name}</p>
                        <p className="modal-intro-form-note">
                          Your contact details will be shared with the family so they can reach you.
                          Prefilled from the invite — edit if you are a different person.
                        </p>
                        <div className="modal-intro-fields">
                          <label className="modal-intro-label">
                            Your name *
                            <input
                              className="modal-intro-input"
                              required
                              value={introForm.requesterName}
                              onChange={(e) => setIntroForm(f => ({ ...f, requesterName: e.target.value }))}
                              placeholder="Jane Smith"
                              disabled={introStep === 'sending'}
                            />
                          </label>
                          <label className="modal-intro-label">
                            Your email *
                            <input
                              className="modal-intro-input"
                              required
                              type="email"
                              value={introForm.requesterEmail}
                              onChange={(e) => setIntroForm(f => ({ ...f, requesterEmail: e.target.value }))}
                              placeholder="jane@agency.com"
                              disabled={introStep === 'sending'}
                            />
                          </label>
                          <label className="modal-intro-label">
                            Role / title (optional)
                            <input
                              className="modal-intro-input"
                              value={introForm.requesterRole}
                              onChange={(e) => setIntroForm(f => ({ ...f, requesterRole: e.target.value }))}
                              placeholder="Talent Manager"
                              disabled={introStep === 'sending'}
                            />
                          </label>
                          <label className="modal-intro-label modal-intro-label--full">
                            Message for the family (optional)
                            <textarea
                              className="modal-intro-input modal-intro-textarea"
                              value={introForm.requesterMessage}
                              onChange={(e) => setIntroForm(f => ({ ...f, requesterMessage: e.target.value }))}
                              placeholder="A brief note about your interest or the opportunity you have in mind…"
                              rows={3}
                              disabled={introStep === 'sending'}
                            />
                          </label>
                        </div>
                        {introError && (
                          <p className="modal-intro-error">{introError}</p>
                        )}
                        <div className="modal-intro-form-actions">
                          <button
                            type="submit"
                            className="modal-button modal-button-intro"
                            disabled={introStep === 'sending'}
                          >
                            {introStep === 'sending' ? 'Sending…' : 'Send Request'}
                          </button>
                          <button
                            type="button"
                            className="modal-button modal-button-secondary"
                            onClick={() => { setIntroStep('idle'); setIntroError(null) }}
                            disabled={introStep === 'sending'}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}

                    {introStep === 'sent' && (
                      <p className="modal-intro-sent">
                        ✓ Introduction requested — the family has been notified.
                      </p>
                    )}
                  </div>
                )}
              </footer>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
