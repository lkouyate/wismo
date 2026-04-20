import { google, gmail_v1 } from 'googleapis'
import { gmailCircuit } from '@/lib/circuit-breaker'

// Reuse OAuth2 client instances per token pair (#19: avoid recreating per call)
const _clientCache = new Map<string, gmail_v1.Gmail>()

export function getGmailClient(accessToken: string, refreshToken?: string): gmail_v1.Gmail {
  const cacheKey = `${accessToken.slice(-12)}_${refreshToken?.slice(-8) ?? ''}`
  const cached = _clientCache.get(cacheKey)
  if (cached) return cached

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  })
  const client = google.gmail({ version: 'v1', auth: oauth2Client })

  // Keep cache bounded
  if (_clientCache.size > 50) {
    const firstKey = _clientCache.keys().next().value
    if (firstKey) _clientCache.delete(firstKey)
  }
  _clientCache.set(cacheKey, client)

  return client
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildHtmlBody(plainText: string): string {
  const paragraphs = plainText.split(/\n{2,}/).map(p => {
    const lines = p.split('\n').map(l => escapeHtml(l)).join('<br>')
    return `<p style="margin:0 0 16px;line-height:1.6;color:#374151;">${lines}</p>`
  }).join('\n')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:32px 24px;">
<div style="background:#ffffff;border-radius:8px;padding:32px;border:1px solid #e5e7eb;">
${paragraphs}
</div>
</div>
</body>
</html>`
}

export async function sendEmail(opts: {
  accessToken: string
  refreshToken?: string
  to: string
  subject: string
  body: string
  fromEmail: string
  inReplyTo?: string
  references?: string
}) {
  const gmail = getGmailClient(opts.accessToken, opts.refreshToken)
  const htmlBody = buildHtmlBody(opts.body)
  const boundary = `wismo_${Date.now()}_${Math.random().toString(36).slice(2)}`

  const messageParts = [
    `From: ${opts.fromEmail}`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    opts.inReplyTo ? `In-Reply-To: ${opts.inReplyTo}` : '',
    opts.references ? `References: ${opts.references}` : '',
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    opts.body,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    htmlBody,
    '',
    `--${boundary}--`,
  ]
    .filter(Boolean)
    .join('\r\n')

  const encoded = Buffer.from(messageParts)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const sendResult = await gmailCircuit.call(() =>
    gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encoded },
    })
  )
  if (!sendResult) throw new Error('Gmail circuit breaker open — service unavailable')
}

export async function watchGmail(accessToken: string, refreshToken: string, topicName: string) {
  const gmail = getGmailClient(accessToken, refreshToken)
  const result = await gmailCircuit.call(async () => {
    const res = await gmail.users.watch({
      userId: 'me',
      requestBody: {
        topicName,
        labelIds: ['INBOX'],
      },
    })
    return res.data as { historyId: string; expiration: string }
  })
  if (!result) throw new Error('Gmail circuit breaker open — service unavailable')
  return result
}

export async function getGmailMessages(
  accessToken: string,
  refreshToken: string,
  historyId: string
) {
  const gmail = getGmailClient(accessToken, refreshToken)
  const historyResult = await gmailCircuit.call(() =>
    gmail.users.history.list({
      userId: 'me',
      startHistoryId: historyId,
      historyTypes: ['messageAdded'],
    })
  )
  if (!historyResult) throw new Error('Gmail circuit breaker open — service unavailable')
  const history = historyResult

  const messages: Array<{
    id: string
    threadId: string
    from: string
    subject: string
    body: string
  }> = []

  for (const record of history.data.history ?? []) {
    for (const added of record.messagesAdded ?? []) {
      if (!added.message?.id) continue

      // Skip messages that don't have INBOX label (e.g. SENT, DRAFTS, SPAM)
      const msgLabels = added.message.labelIds ?? []
      if (!msgLabels.includes('INBOX') || msgLabels.includes('SPAM')) continue

      const msg = await gmail.users.messages.get({
        userId: 'me',
        id: added.message.id,
        format: 'full',
      })

      const headers = msg.data.payload?.headers ?? []
      const from = headers.find((h) => h.name === 'From')?.value ?? ''
      const subject = headers.find((h) => h.name === 'Subject')?.value ?? ''

      let body = ''
      const parts = msg.data.payload?.parts ?? []
      const textPart = parts.find((p) => p.mimeType === 'text/plain')
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, 'base64').toString('utf-8')
      } else if (msg.data.payload?.body?.data) {
        body = Buffer.from(msg.data.payload.body.data, 'base64').toString('utf-8')
      }

      messages.push({
        id: added.message.id,
        threadId: added.message.threadId ?? '',
        from,
        subject,
        body,
      })
    }
  }

  return messages
}
