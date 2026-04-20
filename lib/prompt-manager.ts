/**
 * Versioned prompt templates with A/B testing support.
 *
 * Prompts are stored in Firestore under `prompts/{promptId}/versions/{versionId}`.
 * Each manufacturer can have an active A/B test that splits traffic between two versions.
 */

import { adminDb } from '@/lib/firebase-admin'

export interface PromptVersion {
  id: string
  promptId: string
  version: number
  systemPrompt: string
  createdAt: Date
  description?: string
}

export interface ABTest {
  id: string
  promptId: string
  versionA: string // version ID
  versionB: string // version ID
  trafficSplitB: number // 0-100, percentage going to version B
  status: 'active' | 'paused' | 'completed'
  metrics: {
    versionA: { impressions: number; acceptedAsIs: number }
    versionB: { impressions: number; acceptedAsIs: number }
  }
  createdAt: Date
}

/**
 * Get the active prompt version for a manufacturer.
 * If an A/B test is active, randomly selects based on traffic split.
 * Returns the system prompt string and which version was selected.
 */
export async function resolvePrompt(
  manufacturerId: string,
  promptId: string
): Promise<{ systemPrompt: string; versionId: string; isTestVariant: boolean }> {
  // Check for active A/B test
  const testSnap = await adminDb
    .collection('manufacturers')
    .doc(manufacturerId)
    .collection('ab_tests')
    .where('promptId', '==', promptId)
    .where('status', '==', 'active')
    .limit(1)
    .get()

  if (!testSnap.empty) {
    const test = testSnap.docs[0].data() as ABTest
    const useB = Math.random() * 100 < test.trafficSplitB
    const versionId = useB ? test.versionB : test.versionA

    const versionDoc = await adminDb
      .collection('prompts')
      .doc(promptId)
      .collection('versions')
      .doc(versionId)
      .get()

    if (versionDoc.exists) {
      return {
        systemPrompt: versionDoc.data()!.systemPrompt,
        versionId,
        isTestVariant: useB,
      }
    }
  }

  // No active test — use latest version
  const latestSnap = await adminDb
    .collection('prompts')
    .doc(promptId)
    .collection('versions')
    .orderBy('version', 'desc')
    .limit(1)
    .get()

  if (latestSnap.empty) {
    throw new Error(`No prompt versions found for ${promptId}`)
  }

  const latest = latestSnap.docs[0]
  return {
    systemPrompt: latest.data().systemPrompt,
    versionId: latest.id,
    isTestVariant: false,
  }
}

/**
 * Record an impression for A/B test tracking.
 */
export async function recordImpression(
  manufacturerId: string,
  promptId: string,
  versionId: string,
  accepted: boolean
): Promise<void> {
  const testSnap = await adminDb
    .collection('manufacturers')
    .doc(manufacturerId)
    .collection('ab_tests')
    .where('promptId', '==', promptId)
    .where('status', '==', 'active')
    .limit(1)
    .get()

  if (testSnap.empty) return

  const testDoc = testSnap.docs[0]
  const test = testDoc.data() as ABTest
  const variant = versionId === test.versionB ? 'versionB' : 'versionA'

  const update: Record<string, unknown> = {
    [`metrics.${variant}.impressions`]: (test.metrics[variant]?.impressions ?? 0) + 1,
  }
  if (accepted) {
    update[`metrics.${variant}.acceptedAsIs`] = (test.metrics[variant]?.acceptedAsIs ?? 0) + 1
  }

  await testDoc.ref.update(update)
}

/**
 * Create a new prompt version.
 */
export async function createPromptVersion(
  promptId: string,
  systemPrompt: string,
  description?: string
): Promise<string> {
  const versionsRef = adminDb.collection('prompts').doc(promptId).collection('versions')

  // Get next version number
  const latest = await versionsRef.orderBy('version', 'desc').limit(1).get()
  const nextVersion = latest.empty ? 1 : (latest.docs[0].data().version as number) + 1

  const doc = await versionsRef.add({
    promptId,
    version: nextVersion,
    systemPrompt,
    description: description ?? `Version ${nextVersion}`,
    createdAt: new Date(),
  })

  return doc.id
}
