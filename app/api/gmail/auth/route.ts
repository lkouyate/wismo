import { NextRequest, NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebase-admin'
import { OAuth2Client } from 'google-auth-library'

export async function GET(request: NextRequest) {
  try {
    const idToken = request.nextUrl.searchParams.get('idToken')
    if (!idToken) return NextResponse.json({ error: 'Missing idToken' }, { status: 400 })

    const decoded = await adminAuth.verifyIdToken(idToken)
    const uid = decoded.uid

    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.NEXT_PUBLIC_APP_URL}/api/gmail/callback`
    )

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://mail.google.com/'],
      state: uid,
    })

    return NextResponse.redirect(url)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Auth error'
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/onboarding/step-4?error=${encodeURIComponent(msg)}`
    )
  }
}
