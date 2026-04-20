import Anthropic from '@anthropic-ai/sdk'
import { UPSTrackingResult, QBOInvoice } from '@/types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function isRateLimit(err: unknown): boolean {
  return (
    err instanceof Anthropic.RateLimitError ||
    (err instanceof Error && err.message.includes('429'))
  )
}

export async function extractPONumber(emailBody: string): Promise<string | null> {
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 64,
    messages: [
      {
        role: 'user',
        content: `Extract the purchase order (PO) number from this email. Return ONLY the PO number, nothing else. If no PO number is found, return "null".\n\nEmail:\n${emailBody}`,
      },
    ],
  })
  const text = msg.content[0].type === 'text' ? msg.content[0].text.trim() : null
  return text === 'null' || !text ? null : text
}

interface GenerateResponseOptions {
  customerEmail: string
  customerCompany: string
  customerMessage: string
  orderData: Record<string, unknown> | null
  trackingData: UPSTrackingResult | null
  qboData?: QBOInvoice | null
  responseStyle?: 'professional' | 'friendly' | 'concise'
  customSignature?: string
}

export async function generateWISMOResponse(opts: GenerateResponseOptions): Promise<{
  response: string
  confidence: 'high' | 'medium' | 'needs_attention'
  dataSources: string[]
}> {
  const dataSources: string[] = []
  let contextBlock = ''

  if (opts.orderData) {
    dataSources.push('katana')
    contextBlock += `\nORDER DATA FROM KATANA:\n${JSON.stringify(opts.orderData, null, 2)}\n`
  }

  if (opts.trackingData) {
    dataSources.push('ups')
    contextBlock += `\nUPS TRACKING DATA:\n${JSON.stringify(opts.trackingData, null, 2)}\n`
  }

  if (opts.qboData) {
    dataSources.push('quickbooks')
    contextBlock += `\nQUICKBOOKS INVOICE DATA:\n${JSON.stringify(opts.qboData, null, 2)}\n`
  }

  const styleInstructions = {
    professional: 'Use a professional, formal tone.',
    friendly: 'Use a warm, friendly tone.',
    concise: 'Be brief and to the point. Use bullet points if helpful.',
  }[opts.responseStyle ?? 'professional']

  const systemPrompt = `You are a customer service AI for a manufacturing company. Your job is to respond to "Where Is My Order?" (WISMO) inquiries.

${styleInstructions}

Rules:
- Only share information you have in the context below
- If tracking shows delivered, confirm delivery and offer to investigate if not received
- If no tracking info, give order status and note shipping timeline
- End with offer to help further
- ${opts.customSignature ? `Sign off as: ${opts.customSignature}` : 'Sign off as "Customer Support Team"'}

AVAILABLE CONTEXT:${contextBlock || '\n(No order or tracking data found for this inquiry)'}
`

  let msg
  try {
    msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Customer email from ${opts.customerCompany} (${opts.customerEmail}):\n\n${opts.customerMessage}`,
        },
      ],
    })
  } catch (err) {
    if (isRateLimit(err)) {
      // Return a graceful degraded response so the caller can save as draft
      // instead of propagating the error and causing Pub/Sub infinite retries
      return {
        response: "Thank you for reaching out. We've received your inquiry and will follow up shortly.",
        confidence: 'needs_attention',
        dataSources,
      }
    }
    throw err
  }

  const response = msg.content[0].type === 'text' ? msg.content[0].text : ''

  let confidence: 'high' | 'medium' | 'needs_attention' = 'needs_attention'
  if (opts.orderData && opts.trackingData) confidence = 'high'
  else if (opts.orderData || opts.trackingData) confidence = 'medium'

  return { response, confidence, dataSources }
}
