import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { withRetry } from '@/lib/retry'
import { qboCircuit } from '@/lib/circuit-breaker'
import { encryptToken, decryptToken, isEncrypted } from '@/lib/crypto'

const QBO_BASE = 'https://quickbooks.api.intuit.com/v3'
const QBO_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
const QBO_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2'

export interface QBOTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export interface QBOInvoice {
  id: string
  docNumber: string
  txnDate: string
  shipDate?: string
  trackingNum?: string
  totalAmt: number
  balance: number
  status: 'invoiced' | 'partial' | 'not_invoiced'
  customerRef: { value: string; name: string }
}

export function buildQBOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.QBO_CLIENT_ID!,
    scope: process.env.QBO_SCOPE ?? 'com.intuit.quickbooks.accounting',
    redirect_uri: process.env.QBO_REDIRECT_URI!,
    response_type: 'code',
    state,
  })
  return `${QBO_AUTH_URL}?${params.toString()}`
}

function qboCredentials(): string {
  return Buffer.from(`${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`).toString('base64')
}

export async function exchangeQBOCode(code: string): Promise<QBOTokens> {
  const res = await fetch(QBO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${qboCredentials()}`,
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.QBO_REDIRECT_URI!,
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`QBO token exchange failed: ${await res.text()}`)
  const data = await res.json()
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in }
}

export async function refreshQBOToken(refreshToken: string): Promise<QBOTokens> {
  const res = await fetch(QBO_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${qboCredentials()}`,
      Accept: 'application/json',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`QBO token refresh failed: ${await res.text()}`)
  const data = await res.json()
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresIn: data.expires_in,
  }
}

/** Decrypt a token if encrypted, otherwise return as-is (migration-safe). */
function safeDecrypt(value: string): string {
  return isEncrypted(value) ? decryptToken(value) : value
}

// Checks expiry, refreshes if needed, writes new tokens back to Firestore.
export async function ensureFreshQBOToken(
  mfg: Record<string, unknown>,
  uid: string
): Promise<{ accessToken: string }> {
  const expiry = mfg.qboTokenExpiry as number | null
  const rawAccess = mfg.qboAccessToken as string
  const rawRefresh = mfg.qboRefreshToken as string

  const accessToken = safeDecrypt(rawAccess)
  const refreshToken = safeDecrypt(rawRefresh)

  // Still valid — use as-is
  if (expiry && Date.now() < expiry - 5 * 60 * 1000) {
    return { accessToken }
  }

  // Expired or expiring — refresh
  const tokens = await refreshQBOToken(refreshToken)
  await adminDb.collection('manufacturers').doc(uid).update({
    qboAccessToken: encryptToken(tokens.accessToken),
    qboRefreshToken: encryptToken(tokens.refreshToken),
    qboTokenExpiry: Date.now() + tokens.expiresIn * 1000,
    updatedAt: FieldValue.serverTimestamp(),
  })
  return { accessToken: tokens.accessToken }
}

export async function getQBOInvoiceByPO(
  realmId: string,
  accessToken: string,
  poNumber: string
): Promise<QBOInvoice | null> {
  const result = await qboCircuit.call(() =>
    withRetry(async () => {
      const q = encodeURIComponent(`SELECT * FROM Invoice WHERE DocNumber = '${poNumber}'`)
      const res = await fetch(`${QBO_BASE}/company/${realmId}/query?query=${q}&minorversion=65`, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) throw new Error(`QBO invoice query failed: ${await res.text()}`)
      const data = await res.json()
      const inv = data?.QueryResponse?.Invoice?.[0]
      if (!inv) return null

      const totalAmt = inv.TotalAmt ?? 0
      const balance = inv.Balance ?? 0
      let status: QBOInvoice['status'] = 'not_invoiced'
      if (totalAmt > 0 && balance === 0) status = 'invoiced'
      else if (totalAmt > 0 && balance < totalAmt) status = 'partial'
      else if (totalAmt > 0) status = 'invoiced'

      const trackingNum = inv.TrackingNum ??
        inv.CustomField?.find((f: Record<string, unknown>) =>
          String(f.Name).toLowerCase().includes('tracking')
        )?.StringValue ?? undefined

      return {
        id: inv.Id,
        docNumber: inv.DocNumber,
        txnDate: inv.TxnDate,
        shipDate: inv.ShipDate,
        trackingNum,
        totalAmt,
        balance,
        status,
        customerRef: inv.CustomerRef ?? { value: '', name: '' },
      } satisfies QBOInvoice
    })
  )

  return result // null if circuit is open
}

export async function testQBOConnection(
  realmId: string,
  accessToken: string
): Promise<{ companyName: string; invoiceCount: number }> {
  const [companyRes, countRes] = await Promise.all([
    fetch(`${QBO_BASE}/company/${realmId}/companyinfo/${realmId}?minorversion=65`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    }),
    fetch(`${QBO_BASE}/company/${realmId}/query?query=${encodeURIComponent('SELECT COUNT(*) FROM Invoice')}&minorversion=65`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    }),
  ])
  if (!companyRes.ok) throw new Error(`QBO company fetch failed: ${await companyRes.text()}`)
  const companyData = await companyRes.json()
  const countData = countRes.ok ? await countRes.json() : null
  return {
    companyName: companyData?.CompanyInfo?.CompanyName ?? 'Unknown',
    invoiceCount: countData?.QueryResponse?.totalCount ?? 0,
  }
}
