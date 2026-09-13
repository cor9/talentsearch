'use client'

import { useState } from 'react'

const ROLES = [
  'Talent Agent',
  'Talent Manager',
  'Agency / Management Staff',
  'Assistant',
  'Other industry professional',
]

export function JoinForm({ token, sourceName }) {
  const [form, setForm] = useState({ name: '', email: '', agency: '', role: ROLES[0], website: '' })
  const [state, setState] = useState('idle') // idle | submitting | done
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function onSubmit(e) {
    e.preventDefault()
    if (state === 'submitting') return
    setState('submitting')
    setError(null)
    try {
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ g: token, ...form }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? 'Something went wrong. Please try again.')
        setState('idle')
        return
      }
      setResult(json)
      setState('done')
    } catch {
      setError('Network error. Please try again.')
      setState('idle')
    }
  }

  if (state === 'done') {
    return (
      <div style={{ textAlign: 'center' }}>
        <div className="join-success-icon">📬</div>
        <h2 className="join-heading" style={{ fontSize: 19 }}>
          {result?.existing ? 'Your access link was re-sent' : 'Check your email'}
        </h2>
        <p className="join-body">
          We sent a personal access link to <strong>{form.email.trim()}</strong>. Click the button in that email to
          open the gallery. It can take a minute to arrive, and it occasionally lands in spam or promotions.
        </p>
        <p className="join-fine">
          Didn&apos;t get it? Check spam, then email <a href="mailto:info@childactor101.com">info@childactor101.com</a>.
        </p>
      </div>
    )
  }

  return (
    <form className="join-form" onSubmit={onSubmit} noValidate>
      <label className="join-field">
        Full name
        <input required value={form.name} onChange={set('name')} autoComplete="name" maxLength={120} />
      </label>
      <label className="join-field">
        Work email
        <input required type="email" value={form.email} onChange={set('email')} autoComplete="email" maxLength={254} />
      </label>
      <label className="join-field">
        Agency / company
        <input required value={form.agency} onChange={set('agency')} autoComplete="organization" maxLength={200} />
      </label>
      <label className="join-field">
        Role
        <select value={form.role} onChange={set('role')}>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </label>
      {/* Honeypot: real users never see or fill this. */}
      <label className="join-hp" aria-hidden="true">
        Website
        <input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} />
      </label>
      {error && <p className="join-error">{error}</p>}
      <button type="submit" className="join-submit" disabled={state === 'submitting'}>
        {state === 'submitting' ? 'Sending your link…' : 'Email me my access link'}
      </button>
    </form>
  )
}
