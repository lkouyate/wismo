/**
 * Send critical error alerts via Slack webhook.
 *
 * Set SLACK_ALERT_WEBHOOK_URL in .env.local to enable.
 * Falls back to console.error if not configured.
 */

interface AlertPayload {
  severity: 'critical' | 'warning' | 'info'
  title: string
  message: string
  route?: string
  uid?: string | null
  details?: Record<string, unknown>
}

export async function sendAlert(payload: AlertPayload): Promise<void> {
  const webhookUrl = process.env.SLACK_ALERT_WEBHOOK_URL
  if (!webhookUrl) {
    console.error(`[ALERT:${payload.severity}] ${payload.title}: ${payload.message}`)
    return
  }

  const emoji = payload.severity === 'critical' ? ':rotating_light:' :
                payload.severity === 'warning' ? ':warning:' : ':information_source:'

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `${emoji} ${payload.title}` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: payload.message },
    },
  ]

  const fields: string[] = []
  if (payload.route) fields.push(`*Route:* \`${payload.route}\``)
  if (payload.uid) fields.push(`*User:* \`${payload.uid}\``)
  if (payload.severity) fields.push(`*Severity:* ${payload.severity}`)

  if (fields.length) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: fields.join('\n') },
    })
  }

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
      signal: AbortSignal.timeout(5_000),
    })
  } catch {
    console.error(`[ALERT:${payload.severity}] Failed to send Slack alert: ${payload.title}`)
  }
}
