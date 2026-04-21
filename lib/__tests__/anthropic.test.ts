import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => {
  class RateLimitError extends Error {
    constructor() {
      super('rate_limit_exceeded')
      this.name = 'RateLimitError'
    }
  }
  return {
    default: class Anthropic {
      messages = { create: mockCreate }
      static RateLimitError = RateLimitError
    },
  }
})

import { extractPONumber, generateWISMOResponse } from '@/lib/anthropic'

describe('extractPONumber', () => {
  beforeEach(() => {
    mockCreate.mockReset()
  })

  it('returns extracted PO number', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'PO-12345' }],
    })

    const result = await extractPONumber('Please check on PO-12345 order status.')
    expect(result).toBe('PO-12345')
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 64,
      })
    )
  })

  it('returns null when no PO found', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'null' }],
    })
    expect(await extractPONumber('Where is my order?')).toBeNull()
  })

  it('returns null for empty text response', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '' }],
    })
    expect(await extractPONumber('Just checking in.')).toBeNull()
  })

  it('trims whitespace from PO number', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '  PO-99999  ' }],
    })
    expect(await extractPONumber('Order PO-99999')).toBe('PO-99999')
  })
})

describe('generateWISMOResponse', () => {
  beforeEach(() => {
    mockCreate.mockReset()
  })

  const baseOpts = {
    customerEmail: 'buyer@acme.com',
    customerCompany: 'Acme Inc',
    customerMessage: 'Where is my order PO-100?',
    orderData: null,
    trackingData: null,
  }

  it('returns needs_attention when no data sources found', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'We are looking into your order.' }],
    })

    const result = await generateWISMOResponse(baseOpts)
    expect(result.confidence).toBe('needs_attention')
    expect(result.dataSources).toEqual([])
    expect(result.response).toBe('We are looking into your order.')
  })

  it('returns medium confidence with order data only', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Your order is being processed.' }],
    })

    const result = await generateWISMOResponse({
      ...baseOpts,
      orderData: { order_no: 'PO-100', status: 'in_progress' },
    })
    expect(result.confidence).toBe('medium')
    expect(result.dataSources).toContain('katana')
  })

  it('returns high confidence with order + tracking data', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Your order has shipped!' }],
    })

    const result = await generateWISMOResponse({
      ...baseOpts,
      orderData: { order_no: 'PO-100', status: 'shipped' },
      trackingData: {
        trackingNumber: '1Z999AA10123456784',
        status: 'In Transit',
        events: [],
      },
    })
    expect(result.confidence).toBe('high')
    expect(result.dataSources).toContain('katana')
    expect(result.dataSources).toContain('ups')
  })

  it('includes quickbooks in dataSources when QBO data provided', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Invoice attached.' }],
    })

    const result = await generateWISMOResponse({
      ...baseOpts,
      orderData: { order_no: 'PO-100' },
      qboData: {
        id: 'inv-1',
        docNumber: 'INV-001',
        txnDate: '2026-04-01',
        totalAmt: 500,
        balance: 0,
        status: 'invoiced',
        customerRef: { value: '1', name: 'Acme' },
      },
    })
    expect(result.dataSources).toContain('quickbooks')
  })

  it('uses Sonnet model for response generation', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Response.' }],
    })

    await generateWISMOResponse(baseOpts)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-opus-4-6',
        max_tokens: 512,
      })
    )
  })

  it('returns graceful fallback on rate limit error', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    mockCreate.mockRejectedValueOnce(
      new (Anthropic as unknown as { RateLimitError: new () => Error }).RateLimitError()
    )

    const result = await generateWISMOResponse(baseOpts)
    expect(result.confidence).toBe('needs_attention')
    expect(result.response).toMatch(/received your inquiry/i)
  })

  it('throws on non-rate-limit errors', async () => {
    mockCreate.mockRejectedValueOnce(new Error('API key invalid'))
    await expect(generateWISMOResponse(baseOpts)).rejects.toThrow('API key invalid')
  })

  it('respects responseStyle option', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Quick update.' }],
    })

    await generateWISMOResponse({ ...baseOpts, responseStyle: 'concise' })

    const systemPrompt = mockCreate.mock.calls[0][0].system as string
    expect(systemPrompt).toMatch(/brief|bullet/i)
  })
})
