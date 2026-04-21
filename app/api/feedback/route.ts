import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'

export async function POST(request: NextRequest) {
  try {
    const { idToken, conversationId, rating, reasons, originalResponse, editedResponse } = await request.json()
    if (!idToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const decoded = await adminAuth.verifyIdToken(idToken)
    const uid = decoded.uid

    const wasEdited = editedResponse !== undefined && editedResponse !== originalResponse

    await adminDb
      .collection('manufacturers')
      .doc(uid)
      .collection('feedback')
      .add({
        conversationId,
        rating,                                       // 'positive' | 'negative'
        reasons: reasons ?? [],                       // e.g. ['tone', 'accuracy', 'missing_info']
        originalResponse: originalResponse ?? '',
        editedResponse: editedResponse ?? '',
        editDistance: wasEdited ? Math.abs((editedResponse?.length ?? 0) - (originalResponse?.length ?? 0)) : 0,
        wasEdited,
        createdAt: FieldValue.serverTimestamp(),
      })

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** GET /api/feedback?period=30d — aggregate feedback stats for the manufacturer */
export async function GET(request: NextRequest) {
  try {
    const idToken = request.headers.get('authorization')?.replace('Bearer ', '')
    if (!idToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const decoded = await adminAuth.verifyIdToken(idToken)
    const uid = decoded.uid

    const period = request.nextUrl.searchParams.get('period') ?? '30d'
    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30
    const since = new Date(Date.now() - days * 86400000)

    const snap = await adminDb
      .collection('manufacturers')
      .doc(uid)
      .collection('feedback')
      .where('createdAt', '>=', since)
      .orderBy('createdAt', 'desc')
      .get()

    const entries = snap.docs.map(d => d.data())
    const total = entries.length
    const positive = entries.filter(e => e.rating === 'positive').length
    const negative = entries.filter(e => e.rating === 'negative').length
    const edited = entries.filter(e => e.wasEdited).length
    const unrated = entries.filter(e => !e.rating).length

    // Aggregate reason counts
    const reasonCounts: Record<string, number> = {}
    for (const e of entries) {
      for (const r of (e.reasons ?? [])) {
        reasonCounts[r] = (reasonCounts[r] ?? 0) + 1
      }
    }

    // Top 5 recent negative examples (for AI prompt injection)
    const recentNegative = entries
      .filter(e => e.rating === 'negative' && e.wasEdited)
      .slice(0, 5)
      .map(e => ({
        original: (e.originalResponse as string).slice(0, 300),
        edited: (e.editedResponse as string).slice(0, 300),
        reasons: e.reasons,
      }))

    return NextResponse.json({
      total,
      positive,
      negative,
      edited,
      unrated,
      acceptRate: total > 0 ? Math.round(((total - edited) / total) * 100) : 100,
      reasonCounts,
      recentNegative,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
