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
  const [mainPhotoIndex, setMainPhotoIndex] = useState(0)
  const [activeImage, setActiveImage] = useState(null)
  const [activeVideo, setActiveVideo] = useState(null)
  const [activeResume, setActiveResume] = useState(null)
  const [favoriting, setFavoriting] = useState(false)
  const [introStep, setIntroStep] = useState(introRequested ? 'sent' : 'idle')
  const [introForm, setIntroForm] = useState({
    requesterName: sessionRepName,
    requesterEmail: '',
    requesterRole: '',
    requesterMessage: '',
  })
  const [introError, setIntroError] = useState(null)

  const normalizeUrl = (url) => {
    if (!url) return ''
    const trimmed = url.trim()
    if (/^https?:\/\//i.test(trimmed)) return trimmed
    if (/^\/\//.test(trimmed)) return `https:${trimmed}`
    return `https://${trimmed}`
  }

  const linkifyText = (text) => {
    if (!text || typeof text !== 'string') return text
    const urlRegex = /((https?:\/\/|www\.)[^\s]+|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^\s]*)/g
    const parts = []
    let lastIndex = 0
    let match
    while ((match = urlRegex.exec(text)) !== null) {
      const [fullMatch] = match
      const start = match.index
      if (start > lastIndex) parts.push(text.slice(lastIndex, start))
      const href = normalizeUrl(fullMatch)
      parts.push(<a key={`link-${start}`} href={href} target="_blank" rel="noopener noreferrer">{fullMatch}</a>)
      lastIndex = start + fullMatch.length
    }
    if (lastIndex < text.length) parts.push(text.slice(lastIndex))
    return parts.length > 0 ? parts : text
  }

  const getEmbedUrl = (url) => {
    if (!url) return ''
    const normalized = normalizeUrl(url)
    if (normalized.includes('youtube.com') || normalized.includes('youtu.be')) {
      if (normalized.includes('/embed/')) return normalized
      let videoId = ''
      const vParamMatch = normalized.match(/[?&]v=([^&]+)/)
      if (vParamMatch?.[1]) videoId = vParamMatch[1]
      if (!videoId && normalized.includes('youtu.be/')) {
        const m = normalized.match(/youtu\.be\/([^?&]+)/)
        if (m?.[1]) videoId = m[1]
      }
      if (!videoId && normalized.includes('/shorts/')) {
        const m = normalized.match(/\/shorts\/([^?&/]+)/)
        if (m?.[1]) videoId = m[1]
      }
      if (!videoId && normalized.includes('/live/')) {
        const m = normalized.match(/\/live\/([^?&/]+)/)
        if (m?.[1]) videoId = m[1]
      }
      if (videoId) return `https://www.youtube.com/embed/${videoId}`
      const listMatch = normalized.match(/[?&]list=([^&]+)/)
      if (listMatch?.[1]) return `https://www.youtube.com/embed/videoseries?list=${listMatch[1]}`
      return ''
    }
    if (normalized.includes('vimeo.com')) {
      if (normalized.includes('/user')) return ''
      let urlPath
      try { urlPath = new URL(normalized).pathname } catch { urlPath = normalized.replace(/^https?:\/\/[^/]+/, '') }
      const pathParts = urlPath.replace(/^\/+|\/+$/g, '').split('/')
      let videoId = '', privateHash = ''
      for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i]
        if (['video', 'channels', 'groups', 'album', 'showcase'].includes(part)) continue
        if (/^\d+$/.test(part)) {
          videoId = part
          if (pathParts[i + 1] && /^[a-zA-Z0-9]+$/.test(pathParts[i + 1]) && !/^\d+$/.test(pathParts[i + 1])) {
            privateHash = pathParts[i + 1]
          }
          break
        }
      }
      if (videoId) return privateHash ? `https://player.vimeo.com/video/${videoId}?h=${privateHash}` : `https://player.vimeo.com/video/${videoId}`
    }
    if (normalized.includes('dropbox.com') || normalized.includes('drive.google.com') ||
        normalized.includes('onedrive.live.com') || normalized.includes('1drv.ms') ||
        normalized.includes('sync.com')) return ''
    const knownVideoPatterns = ['youtube.com', 'youtu.be', 'vimeo.com', 'player.vimeo.com', 'dailymotion.com', 'wistia.com', 'loom.com', 'streamable.com']
    if (!knownVideoPatterns.some(p => normalized.includes(p))) return ''
    return normalized
  }

  async function handleToggleFavorite(e) {
    e.stopPropagation()
    if (!onToggleFavorite || favoriting) return
    setFavoriting(true)
    try { await onToggleFavorite(talent.applicationId) } finally { setFavoriting(false) }
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
      setIntroStep(result.simulated ? 'simulated' : 'sent')
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
                  {talent.name || "Untitled"}{" "}
                  <span className="modal-union-pill">{talent.union}</span>
                </h3>
                <p className="modal-subtitle">
                  {talent.age && `${talent.age} years old`}
                  {talent.age && talent.location ? " • " : ""}
                  {talent.location}
                </p>
              </div>
              <button
                className="modal-close"
                type="button"
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </header>

            <div className="modal-body">
              <section className="modal-section modal-photo-hero-section">
                {talent.allImages && talent.allImages.length > 0 ? (
                  <div className="modal-photo-hero">
                    <div
                      className="modal-photo-primary"
                      onClick={() => setActiveImage(talent.allImages[mainPhotoIndex] ?? talent.allImages[0])}
                    >
                      <img
                        src={talent.allImages[mainPhotoIndex] ?? talent.allImages[0]}
                        alt={`${talent.name || "Performer"} photo ${mainPhotoIndex + 1}`}
                      />
                      {talent.headshotLabels?.[mainPhotoIndex] && (
                        <span className="modal-photo-hero-label">
                          {talent.headshotLabels[mainPhotoIndex]}
                        </span>
                      )}
                    </div>
                    {talent.allImages.length > 1 && (
                      <div className="modal-photo-thumbs">
                        {talent.allImages.map((img, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className={`modal-photo-thumb${idx === mainPhotoIndex ? " active" : ""}`}
                            onClick={() => setMainPhotoIndex(idx)}
                            aria-label={`Show photo ${idx + 1} of ${talent.allImages.length}`}
                            aria-current={idx === mainPhotoIndex}
                          >
                            <img src={img} alt="" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="modal-photo-hero modal-photo-hero-empty">
                    <p className="modal-empty">No photos available for this submission.</p>
                  </div>
                )}
              </section>

              <section className="modal-section">
                <h4 className="modal-section-title">Profile details</h4>
                <div className="modal-details-grid">
                  <div className="modal-details-column">
                    {talent.stageName && (
                      <p className="modal-detail">
                        <span className="modal-detail-label">
                          Stage / Birth Name
                        </span>
                        <span>{talent.stageName}</span>
                      </p>
                    )}
                    {talent.guardianName && (
                      <p className="modal-detail">
                        <span className="modal-detail-label">Guardian</span>
                        <span>{talent.guardianName}</span>
                      </p>
                    )}
                    {talent.birthday && (
                      <p className="modal-detail">
                        <span className="modal-detail-label">Birthday</span>
                        <span>{talent.birthday}</span>
                      </p>
                    )}
                    {talent.genderIdentity && (
                      <p className="modal-detail">
                        <span className="modal-detail-label">
                          Gender Identity
                        </span>
                        <span>{talent.genderIdentity}</span>
                      </p>
                    )}
                    {talent.ethnicity && (
                      <p className="modal-detail">
                        <span className="modal-detail-label">
                          Actual + Perceived Ethnicity
                        </span>
                        <span>{talent.ethnicity}</span>
                      </p>
                    )}
                  </div>
                  <div className="modal-details-column">
                    {talent.email && (
                      <p className="modal-detail">
                        <span className="modal-detail-label">Email</span>
                        <span>{talent.email}</span>
                      </p>
                    )}
                    {talent.phone && (
                      <p className="modal-detail">
                        <span className="modal-detail-label">Phone</span>
                        <span>{talent.phone}</span>
                      </p>
                    )}
                    {talent.localHireCities && (
                      <p className="modal-detail">
                        <span className="modal-detail-label">
                          Local Hire Cities
                        </span>
                        <span>{talent.localHireCities}</span>
                      </p>
                    )}
                    {talent.union && (
                      <p className="modal-detail">
                        <span className="modal-detail-label">Union Status</span>
                        <span>{talent.union}</span>
                      </p>
                    )}
                    {talent.currentRepresentation && (
                      <p className="modal-detail">
                        <span className="modal-detail-label">
                          Current Representation
                        </span>
                        <span>{talent.currentRepresentation}</span>
                      </p>
                    )}
                    {talent.seekingRepresentation && (
                      <p className="modal-detail">
                        <span className="modal-detail-label">
                          Representation Sought
                        </span>
                        <span>{talent.seekingRepresentation}</span>
                      </p>
                    )}
                    {talent.representationNotes && (
                      <p className="modal-detail">
                        <span className="modal-detail-label">
                          Representation Notes
                        </span>
                        <span>{talent.representationNotes}</span>
                      </p>
                    )}
                  </div>
                </div>
                {(talent.cooganAccount ||
                  talent.workPermits ||
                  talent.passport ||
                  talent.supplementalNotes) && (
                  <div className="modal-details-extra">
                    {talent.cooganAccount && (
                      <p className="modal-detail">
                        <span className="modal-detail-label">
                          Coogan Account
                        </span>
                        <span>Coogan Account</span>
                      </p>
                    )}
                    {talent.workPermits && (
                      <p className="modal-detail">
                        <span className="modal-detail-label">Work Permits</span>
                        <span>{talent.workPermits}</span>
                      </p>
                    )}
                    {talent.passport && (
                      <p className="modal-detail">
                        <span className="modal-detail-label">Passport</span>
                        <span>Has current passport</span>
                      </p>
                    )}
                    {talent.supplementalNotes && (
                      <p className="modal-detail">
                        <span className="modal-detail-label">
                          Supplemental Notes
                        </span>
                        <span>{linkifyText(talent.supplementalNotes)}</span>
                      </p>
                    )}
                  </div>
                )}
              </section>

              {talent.videos && talent.videos.length > 0 && (
                <section className="modal-section">
                  <h4 className="modal-section-title">Videos</h4>
                  <div className="modal-video-grid">
                    {talent.videos.map((video, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setActiveVideo(video)}
                        className="modal-video-link"
                      >
                        <span className="modal-video-icon">▶</span>
                        <span className="modal-video-label">{video.label}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              <footer className="modal-footer">
                {talent.resume && (
                  <button
                    type="button"
                    onClick={() => setActiveResume(talent.resume)}
                    className="modal-button modal-button-primary"
                  >
                    View Resume
                  </button>
                )}
                {talent.profileLink && (
                  <a
                    href={normalizeUrl(talent.profileLink)}
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
                    {introStep === 'simulated' && (
                      <p className="modal-intro-sent">
                        ✓ Test introduction recorded. No external email was sent.
                      </p>
                    )}
                  </div>
                )}
              </footer>
            </div>

            {activeImage && (
              <div
                className="photo-lightbox-backdrop"
                onClick={() => setActiveImage(null)}
              >
                {talent.allImages && talent.allImages.length > 1 && (
                  <>
                    <button
                      className="lightbox-nav lightbox-nav-prev"
                      onClick={(e) => {
                        e.stopPropagation();
                        const currentIndex =
                          talent.allImages.indexOf(activeImage);
                        const prevIndex =
                          currentIndex === 0
                            ? talent.allImages.length - 1
                            : currentIndex - 1;
                        setActiveImage(talent.allImages[prevIndex]);
                      }}
                    >
                      ‹
                    </button>
                    <button
                      className="lightbox-nav lightbox-nav-next"
                      onClick={(e) => {
                        e.stopPropagation();
                        const currentIndex =
                          talent.allImages.indexOf(activeImage);
                        const nextIndex =
                          currentIndex === talent.allImages.length - 1
                            ? 0
                            : currentIndex + 1;
                        setActiveImage(talent.allImages[nextIndex]);
                      }}
                    >
                      ›
                    </button>
                  </>
                )}
                <div
                  className="photo-lightbox-shell"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className="lightbox-close"
                    onClick={() => setActiveImage(null)}
                  >
                    ✕
                  </button>
                  <img src={activeImage} alt={talent.name || "Headshot"} />
                </div>
              </div>
            )}

            {activeVideo && (
              <div
                className="photo-lightbox-backdrop"
                onClick={() => setActiveVideo(null)}
              >
                <div
                  className="photo-lightbox-shell video-lightbox-shell"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className="lightbox-close"
                    onClick={() => setActiveVideo(null)}
                  >
                    ✕
                  </button>
                  <div className="video-container">
                    {getEmbedUrl(activeVideo.url) ? (
                      <iframe
                        src={getEmbedUrl(activeVideo.url)}
                        title={activeVideo.label}
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      ></iframe>
                    ) : (
                      <div className="modal-video-fallback">
                        <p>
                          We couldn&apos;t embed this video here, but you can
                          open it directly:
                        </p>
                        <a
                          href={normalizeUrl(activeVideo.url)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open video in new tab
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeResume && (
              <div
                className="photo-lightbox-backdrop"
                onClick={() => setActiveResume(null)}
              >
                <div
                  className="photo-lightbox-shell resume-lightbox-shell"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className="lightbox-close"
                    onClick={() => setActiveResume(null)}
                  >
                    ✕
                  </button>
                  <iframe
                    src={activeResume}
                    title="Resume"
                    className="resume-frame"
                  ></iframe>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
