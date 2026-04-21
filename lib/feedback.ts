import { adminDb } from '@/lib/firebase-admin'

interface FeedbackSummary {
  topIssues: string[]
  editExamples: { original: string; edited: string }[]
  acceptRate: number
}

/**
 * Loads recent negative feedback for a manufacturer and generates
 * a prompt addendum that steers the AI away from repeated mistakes.
 */
export async function getFeedbackContext(uid: string): Promise<string> {
  try {
    const since = new Date(Date.now() - 30 * 86400000)
    const snap = await adminDb
      .collection('manufacturers')
      .doc(uid)
      .collection('feedback')
      .where('createdAt', '>=', since)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get()

    if (snap.empty) return ''

    const entries = snap.docs.map(d => d.data())
    const total = entries.length
    const edited = entries.filter(e => e.wasEdited).length
    const acceptRate = total > 0 ? Math.round(((total - edited) / total) * 100) : 100

    // Count reasons
    const reasonCounts: Record<string, number> = {}
    for (const e of entries) {
      for (const r of (e.reasons ?? [])) {
        reasonCounts[r] = (reasonCounts[r] ?? 0) + 1
      }
    }

    const topIssues = Object.entries(reasonCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([reason]) => reason)

    // Collect up to 3 recent edit examples
    const editExamples = entries
      .filter(e => e.wasEdited && e.originalResponse && e.editedResponse)
      .slice(0, 3)
      .map(e => ({
        original: (e.originalResponse as string).slice(0, 200),
        edited: (e.editedResponse as string).slice(0, 200),
      }))

    const summary: FeedbackSummary = { topIssues, editExamples, acceptRate }
    return buildFeedbackPrompt(summary)
  } catch {
    return ''
  }
}

function buildFeedbackPrompt(summary: FeedbackSummary): string {
  const lines: string[] = []

  if (summary.acceptRate < 80 && summary.topIssues.length > 0) {
    const issueMap: Record<string, string> = {
      tone: 'The manufacturer has been correcting your tone — adjust to better match their preference',
      accuracy: 'Double-check factual claims — recent responses had accuracy issues flagged',
      missing_info: 'Include more detail — recent responses were flagged for missing information',
      too_long: 'Be more concise — recent responses were considered too lengthy',
      too_short: 'Provide more detail — recent responses were considered too brief',
      other: 'Pay extra attention to quality — the manufacturer has been editing responses',
    }

    lines.push('\nIMPORTANT — Feedback from this manufacturer:')
    for (const issue of summary.topIssues) {
      lines.push(`- ${issueMap[issue] ?? issue}`)
    }
  }

  if (summary.editExamples.length > 0) {
    lines.push('\nRecent corrections by this manufacturer (learn from these):')
    for (const ex of summary.editExamples) {
      lines.push(`- AI wrote: "${ex.original}..."`)
      lines.push(`  Corrected to: "${ex.edited}..."`)
    }
  }

  return lines.join('\n')
}
