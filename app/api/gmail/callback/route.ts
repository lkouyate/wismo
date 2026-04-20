import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { OAuth2Client } from 'google-auth-library'
import { google } from 'googleapis'
import { watchGmail } from '@/lib/gmail'
import { FieldValue } from 'firebase-admin/firestore'
import { encryptToken } from '@/lib/crypto'


export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
  const code = request.nextUrl.searchParams.get('code')
  const uid = request.nextUrl.searchParams.get('state')
  const oauthError = request.nextUrl.searchParams.get('error')

  if (oauthError) {
    return NextResponse.redirect(`${appUrl}/onboarding/step-4?error=${encodeURIComponent(oauthError)}`)
  }
  if (!code || !uid) {
    return NextResponse.redirect(`${appUrl}/onboarding/step-4?error=missing_params`)
  }

  try {
    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${appUrl}/api/gmail/callback`
    )

    const { tokens } = await oauth2Client.getToken(code)
    if (!tokens.access_token) throw new Error('No access token returned')
    if (!tokens.refresh_token) throw new Error('No refresh token returned. Please revoke WISMO access in your Google account and try again.')

    oauth2Client.setCredentials(tokens)

    // Get the Gmail address using Gmail profile (uses the mail scope we already have)
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
    const profile = await gmail.users.getProfile({ userId: 'me' })
    const email = profile.data.emailAddress ?? ''

    // Store tokens in Firestore (encrypted at rest)
    await adminDb.collection('manufacturers').doc(uid).set({
      gmailConnected: true,
      gmailEmail: email,
      gmailAccessToken: encryptToken(tokens.access_token),
      gmailRefreshToken: encryptToken(tokens.refresh_token),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })

    // Register Gmail watch
    const topicName = process.env.GMAIL_PUBSUB_TOPIC
    if (topicName) {
      try {
        const watchResult = await watchGmail(tokens.access_token, tokens.refresh_token, topicName)
        await adminDb.collection('manufacturers').doc(uid).update({
          gmailWatchExpiry: new Date(Number(watchResult.expiration)),
          gmailHistoryId: watchResult.historyId,
          updatedAt: FieldValue.serverTimestamp(),
        })
      } catch (watchErr) {
        console.error('Watch registration failed:', watchErr)
        // Non-fatal — still redirect as connected
      }
    }

    return NextResponse.redirect(`${appUrl}/onboarding/step-4?connected=true&email=${encodeURIComponent(email)}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.redirect(`${appUrl}/onboarding/step-4?error=${encodeURIComponent(msg)}`)
  }
}
