// Representative session middleware.
// Uses Web Crypto API (Edge-compatible) to verify the HMAC-SHA256 session cookie.
// Does NOT perform a Supabase database round-trip — revocation is enforced in
// each protected server component and route handler.

import { NextResponse } from 'next/server'

const COOKIE_NAME = '__rep'

// Paths that bypass session check
const PUBLIC_PATHS = new Set(['/access', '/denied', '/join', '/api/join', '/favicon.ico'])

export async function middleware(request) {
  const { pathname } = request.nextUrl

  // Let static assets, Next.js internals, and public pages through
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/rep/') ||  // API routes do their own full check
    PUBLIC_PATHS.has(pathname) ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.jpeg') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.webp') ||
    pathname.endsWith('.ico')
  ) {
    return NextResponse.next()
  }

  // Note: /api/rep/* routes bypass middleware here but perform full session
  // verification including Supabase revocation check in each route handler.

  const sessionValue = request.cookies.get(COOKIE_NAME)?.value
  if (!sessionValue) {
    return NextResponse.redirect(new URL('/denied', request.url))
  }

  const secret = process.env.TALENTSEARCH_SESSION_SECRET
  const payload = await verifyHmac(sessionValue, secret)

  if (!payload) {
    const res = NextResponse.redirect(new URL('/denied', request.url))
    res.cookies.delete(COOKIE_NAME)
    return res
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
}

// ─── Web Crypto HMAC verification ────────────────────────────────────────────

async function verifyHmac(cookieValue, secret) {
  if (!secret || !cookieValue) return null

  const parts = cookieValue.split('.')
  if (parts.length !== 2) return null

  const [payloadB64, sigB64] = parts

  try {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    )

    const sigBytes = base64urlToBytes(sigB64)
    const dataBytes = new TextEncoder().encode(payloadB64)

    const valid = await crypto.subtle.verify('HMAC', keyMaterial, sigBytes, dataBytes)
    if (!valid) return null

    const payload = JSON.parse(new TextDecoder().decode(base64urlToBytes(payloadB64)))

    // Expiry check
    if (!payload.exp || Date.now() / 1000 > payload.exp) return null
    if (!payload.iid || !payload.eid) return null

    return payload
  } catch {
    return null
  }
}

function base64urlToBytes(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - str.length % 4) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
