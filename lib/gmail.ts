import { google } from 'googleapis'

export function getGmailClient(accessToken: string, refreshToken?: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  })
  return google.gmail({ version: 'v1', auth: oauth2Client })
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

  const messageParts = [
    `From: ${opts.fromEmail}`,
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    opts.inReplyTo ? `In-Reply-To: ${opts.inReplyTo}` : '',
    opts.references ? `References: ${opts.references}` : '',
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    opts.body,
  ]
    .filter(Boolean)
    .join('\r\n')

  const encoded = Buffer.from(messageParts)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded },
  })
}

export async function watchGmail(accessToken: string, refreshToken: string, topicName: string) {
  const gmail = getGmailClient(accessToken, refreshToken)
  const res = await gmail.users.watch({
    userId: 'me',
    requestBody: {
      topicName,
      labelIds: ['INBOX'],
    },
  })
  return res.data as { historyId: string; expiration: string }
}

export async function getGmailMessages(
  accessToken: string,
  refreshToken: string,
  historyId: string
) {
  const gmail = getGmailClient(accessToken, refreshToken)
  const history = await gmail.users.history.list({
    userId: 'me',
    startHistoryId: historyId,
    historyTypes: ['messageAdded'],
  })

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
