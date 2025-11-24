'use client';

import { useState } from 'react';

export function TalentModal({ talent, children }) {
  const [open, setOpen] = useState(false);

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
              </footer>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


