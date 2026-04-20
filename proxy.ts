import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'

const COOKIE_NAME = 'wismo_session'
const CANONICAL_HOST = 'app.trywismo.co'

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Redirect all traffic from the .vercel.app URL to the canonical domain
  if (request.nextUrl.hostname !== CANONICAL_HOST && !request.nextUrl.hostname.includes('localhost')) {
    const canonical = new URL(request.url)
    canonical.hostname = CANONICAL_HOST
    canonical.port = ''
    return NextResponse.redirect(canonical.toString(), { status: 301 })
  }

  // Rate limit API routes (60 req/min per IP, 10 req/min on auth)
  if (pathname.startsWith('/api/')) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
    const isAuthRoute = pathname.startsWith('/api/auth/')
    const { allowed, retryAfterMs } = checkRateLimit(
      `api:${ip}`,
      { maxRequests: isAuthRoute ? 10 : 60, windowMs: 60_000 }
    )
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil((retryAfterMs ?? 60_000) / 1000)) },
        }
      )
    }
    return NextResponse.next()
  }

  // Public paths — no session check needed
  if (
    pathname === '/' ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next()
  }

  // Require session cookie for dashboard + onboarding routes
  const session = request.cookies.get(COOKIE_NAME)
  if (!session?.value) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Only run middleware on routes that need it (dashboard, onboarding, API)
    '/dashboard/:path*',
    '/onboarding/:path*',
    '/api/:path*',
    '/',
  ],
}
