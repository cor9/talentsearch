"use client";

import { useState } from "react";

export function TalentModal({ talent, children }) {
  const [open, setOpen] = useState(false);
  const [activeImage, setActiveImage] = useState(null);
  const [activeVideo, setActiveVideo] = useState(null);
  const [activeResume, setActiveResume] = useState(null);

  const normalizeUrl = (url) => {
    if (!url) return "";
    const trimmed = url.trim();

    // Already has protocol
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    // Protocol-relative
    if (/^\/\//.test(trimmed)) return `https:${trimmed}`;

    // Bare domains or paths -> assume https
    return `https://${trimmed}`;
  };

  const linkifyText = (text) => {
    if (!text || typeof text !== "string") return text;

    const urlRegex =
      /((https?:\/\/|www\.)[^\s]+|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^\s]*)/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = urlRegex.exec(text)) !== null) {
      const [fullMatch] = match;
      const start = match.index;

      if (start > lastIndex) {
        parts.push(text.slice(lastIndex, start));
      }

      const href = normalizeUrl(fullMatch);
      parts.push(
        <a
          key={`link-${start}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {fullMatch}
        </a>
      );

      lastIndex = start + fullMatch.length;
    }

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };

  const getEmbedUrl = (url) => {
    if (!url) return "";
    const normalized = normalizeUrl(url);

    // Handle YouTube
    if (normalized.includes("youtube.com") || normalized.includes("youtu.be")) {
      // Already an embed URL
      if (normalized.includes("/embed/")) return normalized;

      let videoId = "";

      // Standard watch URLs with v=
      const vParamMatch = normalized.match(/[?&]v=([^&]+)/);
      if (vParamMatch && vParamMatch[1]) {
        videoId = vParamMatch[1];
      }

      // Short youtu.be links
      if (!videoId && normalized.includes("youtu.be/")) {
        const match = normalized.match(/youtu\.be\/([^?&]+)/);
        if (match && match[1]) {
          videoId = match[1];
        }
      }

      // Shorts URLs
      if (!videoId && normalized.includes("/shorts/")) {
        const match = normalized.match(/\/shorts\/([^?&/]+)/);
        if (match && match[1]) {
          videoId = match[1];
        }
      }

      // Live URLs
      if (!videoId && normalized.includes("/live/")) {
        const match = normalized.match(/\/live\/([^?&/]+)/);
        if (match && match[1]) {
          videoId = match[1];
        }
      }

      if (videoId) {
        return `https://www.youtube.com/embed/${videoId}`;
      }

      // Playlist-only URLs (no v=), e.g. playlist view
      const listMatch = normalized.match(/[?&]list=([^&]+)/);
      if (listMatch && listMatch[1]) {
        const listId = listMatch[1];
        return `https://www.youtube.com/embed/videoseries?list=${listId}`;
      }

      // If it's a YouTube URL we can't safely embed (channel, studio, etc.),
      // return empty string so we can fall back to an "open in new tab" link.
      return "";
    }

    // Handle Vimeo
    if (normalized.includes("vimeo.com")) {
      const videoId = normalized.split("/").pop();
      if (videoId && !isNaN(videoId))
        return `https://player.vimeo.com/video/${videoId}`;
    }

    // Handle Dropbox share links
    // Dropbox requires authentication that doesn't work in iframes
    // Return empty to trigger "open in new tab" fallback
    if (normalized.includes("dropbox.com")) {
      return "";
    }

    // Handle Google Drive share links
    // Drive shared videos often block iframe embedding or require sign-in
    // Return empty to trigger "open in new tab" fallback
    if (normalized.includes("drive.google.com")) {
      return "";
    }

    // Return original if no specific handler or already embeddable
    return normalized;
  };

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
                    {talent.representation && (
                      <p className="modal-detail">
                        <span className="modal-detail-label">
                          Current Representation
                        </span>
                        <span>{talent.representation}</span>
                      </p>
                    )}
                    {talent.seeking && (
                      <p className="modal-detail">
                        <span className="modal-detail-label">
                          Seeking Representation
                        </span>
                        <span>{talent.seeking}</span>
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

              <section className="modal-section">
                <h4 className="modal-section-title">
                  Photos{" "}
                  {talent.allImages && talent.allImages.length
                    ? `(${talent.allImages.length})`
                    : ""}
                </h4>
                {talent.allImages && talent.allImages.length > 0 ? (
                  <div className="modal-photo-grid">
                    {talent.allImages.map((img, idx) => (
                      <div
                        key={idx}
                        className="modal-photo"
                        onClick={() => setActiveImage(img)}
                      >
                        <img
                          src={img}
                          alt={`${talent.name} photo ${idx + 1}`}
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="modal-empty">
                    No photos available for this submission.
                  </p>
                )}
              </section>

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
  );
}
