import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ─────────────────────────────────────────────
const {
  mockDocGet,
  mockDocSet,
  mockCollectionGet,
  mockGetGmailMessages,
  mockEnqueueEmailJobs,
  mockTriggerWorker,
  mockCheckBilling,
} = vi.hoisted(() => ({
  mockDocGet: vi.fn(),
  mockDocSet: vi.fn(),
  mockCollectionGet: vi.fn(),
  mockGetGmailMessages: vi.fn(),
  mockEnqueueEmailJobs: vi.fn(),
  mockTriggerWorker: vi.fn(),
  mockCheckBilling: vi.fn(),
}))

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: () => ({
      where: () => ({
        where: () => ({
          where: () => ({
            select: () => ({
              limit: () => ({ get: mockCollectionGet }),
            }),
          }),
        }),
      }),
      doc: (id: string) => ({
        get: () => {
          // Full mfg doc for billing check
          return Promise.resolve({
            data: () => ({ plan: 'core', subscriptionStatus: 'active', queriesThisMonth: 0 }),
          })
        },
        collection: () => ({
          doc: () => ({
            get: mockDocGet,
            set: mockDocSet,
          }),
        }),
      }),
    }),
    doc: () => ({
      set: () => Promise.resolve(), // systemStatus/webhookLast — returns a resolved promise
    }),
  },
}))

vi.mock('@/lib/gmail', () => ({
  getGmailMessages: (...args: unknown[]) => mockGetGmailMessages(...args),
}))

vi.mock('@/lib/queue', () => ({
  enqueueEmailJobs: (...args: unknown[]) => mockEnqueueEmailJobs(...args),
  triggerWorker: () => mockTriggerWorker(),
}))

vi.mock('@/lib/billing', () => ({
  checkBillingAllowed: (...args: unknown[]) => mockCheckBilling(...args),
}))

vi.mock('@/lib/log-error', () => ({
  logError: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/request-id', () => ({
  generateRequestId: () => 'wh-req-456',
}))

vi.mock('@/lib/crypto', () => ({
  decryptToken: (v: string) => v,
  isEncrypted: () => false,
}))

vi.mock('google-auth-library', () => ({
  OAuth2Client: class { verifyIdToken = vi.fn() },
}))

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => new Date(),
    increment: (n: number) => n,
  },
}))

import { POST } from '@/app/api/gmail/webhook/route'

function encodePubSubBody(emailAddress: string, historyId: string) {
  const data = Buffer.from(JSON.stringify({ emailAddress, historyId })).toString('base64')
  return { message: { data } }
}

function makeRequest(body: unknown, authHeader?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (authHeader) headers['authorization'] = authHeader

  return new Request('http://localhost:3000/api/gmail/webhook', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest
}

describe('POST /api/gmail/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-secret'

    mockCheckBilling.mockReturnValue({ allowed: true })

    // Default: manufacturer found
    mockCollectionGet.mockResolvedValue({
      empty: false,
      docs: [{
        id: 'mfg-1',
        data: () => ({
          gmailAccessToken: 'access-tok',
          gmailRefreshToken: 'refresh-tok',
          gmailEmail: 'mfg@test.com',
        }),
      }],
    })

    // Default: message not yet processed
    mockDocGet.mockResolvedValue({ exists: false })
    mockDocSet.mockResolvedValue(undefined)

    mockGetGmailMessages.mockResolvedValue([
      { id: 'msg-1', threadId: 'th-1', from: 'buyer@acme.com', subject: 'Order status?', body: 'Where is PO-100?' },
    ])

    mockEnqueueEmailJobs.mockResolvedValue(1)
  })

  it('returns 401 without valid auth', async () => {
    delete process.env.CRON_SECRET
    const res = await POST(makeRequest(encodePubSubBody('mfg@test.com', '123')))
    expect(res.status).toBe(401)
  })

  it('accepts CRON_SECRET auth and processes message', async () => {
    const res = await POST(makeRequest(
      encodePubSubBody('mfg@test.com', '12345'),
      'Bearer test-secret'
    ))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.enqueued).toBe(1)
  })

  it('returns ok with no action when no message data', async () => {
    const res = await POST(makeRequest(
      { message: {} },
      'Bearer test-secret'
    ))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
  })

  it('returns ok when manufacturer not found (no-op)', async () => {
    mockCollectionGet.mockResolvedValueOnce({ empty: true, docs: [] })
    const res = await POST(makeRequest(
      encodePubSubBody('unknown@test.com', '123'),
      'Bearer test-secret'
    ))
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
  })

  it('skips already-processed messages (idempotency)', async () => {
    mockDocGet.mockResolvedValue({ exists: true })

    const res = await POST(makeRequest(
      encodePubSubBody('mfg@test.com', '123'),
      'Bearer test-secret'
    ))
    expect(res.status).toBe(200)
    expect(mockEnqueueEmailJobs).toHaveBeenCalledWith([])
  })

  it('triggers worker after enqueueing jobs', async () => {
    await POST(makeRequest(
      encodePubSubBody('mfg@test.com', '123'),
      'Bearer test-secret'
    ))
    expect(mockTriggerWorker).toHaveBeenCalled()
  })

  it('caps messages at MAX_MESSAGES_PER_WEBHOOK (3)', async () => {
    mockGetGmailMessages.mockResolvedValueOnce([
      { id: 'msg-1', threadId: 'th-1', from: 'a@a.com', subject: 'S1', body: 'B1' },
      { id: 'msg-2', threadId: 'th-2', from: 'b@b.com', subject: 'S2', body: 'B2' },
      { id: 'msg-3', threadId: 'th-3', from: 'c@c.com', subject: 'S3', body: 'B3' },
      { id: 'msg-4', threadId: 'th-4', from: 'd@d.com', subject: 'S4', body: 'B4' },
      { id: 'msg-5', threadId: 'th-5', from: 'e@e.com', subject: 'S5', body: 'B5' },
    ])

    await POST(makeRequest(
      encodePubSubBody('mfg@test.com', '123'),
      'Bearer test-secret'
    ))

    const enqueuedJobs = mockEnqueueEmailJobs.mock.calls[0]?.[0] ?? []
    expect(enqueuedJobs.length).toBeLessThanOrEqual(3)
  })
})
