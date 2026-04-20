import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase-admin'
import { exchangeQBOCode } from '@/lib/quickbooks'
import { FieldValue } from 'firebase-admin/firestore'
import { encryptToken } from '@/lib/crypto'

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
  const code = request.nextUrl.searchParams.get('code')
  const uid = request.nextUrl.searchParams.get('state')
  const realmId = request.nextUrl.searchParams.get('realmId')
  const oauthError = request.nextUrl.searchParams.get('error')

  if (oauthError) {
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?qbo_error=${encodeURIComponent(oauthError)}`)
  }
  if (!code || !uid || !realmId) {
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?qbo_error=missing_params`)
  }

  try {
    const tokens = await exchangeQBOCode(code)
    await adminDb.collection('manufacturers').doc(uid).set({
      qboConnected: true,
      qboRealmId: realmId,
      qboAccessToken: encryptToken(tokens.accessToken),
      qboRefreshToken: encryptToken(tokens.refreshToken),
      qboTokenExpiry: Date.now() + tokens.expiresIn * 1000,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?qbo_connected=true`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.redirect(`${appUrl}/dashboard/integrations?qbo_error=${encodeURIComponent(msg)}`)
  }
}
