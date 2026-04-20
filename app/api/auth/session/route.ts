import { NextRequest, NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebase-admin'

const COOKIE_NAME = 'wismo_session'
const EXPIRES_IN_MS = 14 * 24 * 60 * 60 * 1000 // 14 days

export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json()
    const sessionCookie = await adminAuth.createSessionCookie(idToken, {
      expiresIn: EXPIRES_IN_MS,
    })
    const response = NextResponse.json({ ok: true })
    response.cookies.set(COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: EXPIRES_IN_MS / 1000,
      path: '/',
    })
    return response
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set('wismo_session', '', { maxAge: 0, path: '/' })
  return response
}
