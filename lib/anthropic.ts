import Anthropic from '@anthropic-ai/sdk'
import { UPSTrackingResult } from '@/types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function extractPONumber(emailBody: string): Promise<string | null> {
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
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

  const msg = await client.messages.create({
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

  const response = msg.content[0].type === 'text' ? msg.content[0].text : ''

  let confidence: 'high' | 'medium' | 'needs_attention' = 'needs_attention'
  if (opts.orderData && opts.trackingData) confidence = 'high'
  else if (opts.orderData || opts.trackingData) confidence = 'medium'

  return { response, confidence, dataSources }
}
