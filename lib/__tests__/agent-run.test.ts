import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks (must be declared before vi.mock factories) ──
const {
  mockVerifyIdToken,
  mockDocGet,
  mockCollectionAdd,
  mockExtractPO,
  mockGenerateResponse,
  mockCheckBilling,
} = vi.hoisted(() => ({
  mockVerifyIdToken: vi.fn(),
  mockDocGet: vi.fn(),
  mockCollectionAdd: vi.fn(),
  mockExtractPO: vi.fn(),
  mockGenerateResponse: vi.fn(),
  mockCheckBilling: vi.fn(),
}))

vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: { verifyIdToken: mockVerifyIdToken },
  adminDb: {
    collection: () => ({
      doc: () => ({
        get: mockDocGet,
        collection: () => ({ add: mockCollectionAdd }),
      }),
    }),
  },
}))

vi.mock('@/lib/anthropic', () => ({
  extractPONumber: (...args: unknown[]) => mockExtractPO(...args),
  generateWISMOResponse: (...args: unknown[]) => mockGenerateResponse(...args),
}))

vi.mock('@/lib/katana', () => ({
  katanaRequest: vi.fn().mockResolvedValue({ data: [] }),
  getKatanaOrder: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/carriers', () => ({
  trackShipment: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/quickbooks', () => ({
  ensureFreshQBOToken: vi.fn().mockResolvedValue({ accessToken: 'tok' }),
  getQBOInvoiceByPO: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/billing', () => ({
  checkBillingAllowed: (...args: unknown[]) => mockCheckBilling(...args),
  checkAndIncrementUsage: vi.fn().mockResolvedValue({ allowed: true }),
}))

vi.mock('@/lib/log-error', () => ({ logError: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/track-usage', () => ({ trackUsage: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/request-id', () => ({ generateRequestId: () => 'test-req-123' }))
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => new Date(), increment: (n: number) => n },
}))

import { POST } from '@/app/api/agent/run/route'

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost:3000/api/agent/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest
}

describe('POST /api/agent/run', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-1' })
    mockDocGet.mockResolvedValue({
      data: () => ({
        katanaApiKey: 'kat-key',
        draftMode: true,
        agentSettings: { escalationTriggers: ['urgent', 'complaint'], responseStyle: 'professional' },
      }),
    })
    mockExtractPO.mockResolvedValue('PO-100')
    mockGenerateResponse.mockResolvedValue({
      response: 'Your order is on the way.',
      confidence: 'high',
      dataSources: ['katana'],
    })
    mockCollectionAdd.mockResolvedValue({ id: 'conv-1' })
    mockCheckBilling.mockReturnValue({ allowed: true })
  })

  it('returns 401 when no idToken provided', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 404 when manufacturer not found', async () => {
    mockDocGet.mockResolvedValueOnce({ data: () => null })
    const res = await POST(makeRequest({ idToken: 'tok' }))
    expect(res.status).toBe(404)
  })

  it('returns successful response with agent output', async () => {
    const res = await POST(makeRequest({
      idToken: 'tok',
      customerEmail: 'buyer@test.com',
      customerCompany: 'TestCo',
      customerMessage: 'Where is PO-100?',
    }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.response).toBe('Your order is on the way.')
    expect(json.confidence).toBe('high')
    expect(json.poNumber).toBe('PO-100')
    expect(json.requestId).toBe('test-req-123')
  })

  it('saves conversation as draft when draftMode is true', async () => {
    await POST(makeRequest({
      idToken: 'tok',
      customerMessage: 'Where is my order?',
    }))
    expect(mockCollectionAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'draft',
        isDraft: true,
      })
    )
  })

  it('creates escalation when trigger phrase detected', async () => {
    await POST(makeRequest({
      idToken: 'tok',
      customerMessage: 'This is urgent, where is my order?',
    }))

    // First add = conversation, second add = escalation
    expect(mockCollectionAdd).toHaveBeenCalledTimes(2)
    expect(mockCollectionAdd).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'open',
        reason: expect.stringContaining('urgent'),
      })
    )
  })

  it('skips billing check in test mode', async () => {
    await POST(makeRequest({ idToken: 'tok', mode: 'test' }))
    expect(mockCheckBilling).not.toHaveBeenCalled()
  })

  it('returns 402 when billing blocks the request', async () => {
    mockCheckBilling.mockReturnValueOnce({
      allowed: false,
      reason: 'Monthly query limit reached (500).',
    })

    const res = await POST(makeRequest({
      idToken: 'tok',
      customerMessage: 'Check my order',
    }))
    expect(res.status).toBe(402)
    const json = await res.json()
    expect(json.code).toBe('billing_limit')
  })

  it('handles extractPONumber returning null gracefully', async () => {
    mockExtractPO.mockResolvedValueOnce(null)
    const res = await POST(makeRequest({
      idToken: 'tok',
      customerMessage: 'Just checking in, no PO.',
    }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.poNumber).toBeNull()
  })
})
