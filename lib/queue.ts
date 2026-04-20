/**
 * Job queue backed by Upstash Redis (or Firestore fallback).
 *
 * Jobs are stored as JSON in a Redis list. Workers pull from the list,
 * process, and acknowledge. Failed jobs go to a dead letter queue after
 * maxRetries attempts.
 */

import { redis } from '@/lib/redis'
import { adminDb } from '@/lib/firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { generateRequestId } from '@/lib/request-id'

export interface EmailJob {
  id: string
  manufacturerId: string
  messageId: string
  threadId: string
  from: string
  subject: string
  body: string
  historyId: string
  enqueuedAt: number
  attempts: number
}

const QUEUE_KEY = 'wismo:email-jobs'
const DLQ_KEY = 'wismo:email-jobs:dlq'
const MAX_RETRIES = 3

/** Enqueue one or more email jobs. Returns the number of jobs enqueued. */
export async function enqueueEmailJobs(jobs: Omit<EmailJob, 'id' | 'enqueuedAt' | 'attempts'>[]): Promise<number> {
  if (jobs.length === 0) return 0

  const fullJobs: EmailJob[] = jobs.map(j => ({
    ...j,
    id: generateRequestId(),
    enqueuedAt: Date.now(),
    attempts: 0,
  }))

  if (redis) {
    const pipeline = redis.pipeline()
    for (const job of fullJobs) {
      pipeline.rpush(QUEUE_KEY, JSON.stringify(job))
    }
    await pipeline.exec()
  } else {
    // Firestore fallback — store jobs in a pending collection
    const batch = adminDb.batch()
    for (const job of fullJobs) {
      const ref = adminDb.collection('jobQueue').doc(job.id)
      batch.set(ref, { ...job, status: 'pending' })
    }
    await batch.commit()
  }

  return fullJobs.length
}

/** Pull the next job from the queue. Returns null if empty. */
export async function dequeueEmailJob(): Promise<EmailJob | null> {
  if (redis) {
    const raw = await redis.lpop<string>(QUEUE_KEY)
    if (!raw) return null
    return typeof raw === 'string' ? JSON.parse(raw) : raw as unknown as EmailJob
  }

  // Firestore fallback
  const snap = await adminDb
    .collection('jobQueue')
    .where('status', '==', 'pending')
    .orderBy('enqueuedAt')
    .limit(1)
    .get()

  if (snap.empty) return null
  const doc = snap.docs[0]
  await doc.ref.update({ status: 'processing' })
  return doc.data() as EmailJob
}

/** Acknowledge a job as completed (remove from queue). */
export async function ackJob(jobId: string): Promise<void> {
  if (!redis) {
    await adminDb.collection('jobQueue').doc(jobId).update({
      status: 'completed',
      completedAt: FieldValue.serverTimestamp(),
    })
  }
  // Redis: job was already removed by lpop — nothing to do
}

/** Move a failed job to the dead letter queue or re-enqueue for retry. */
export async function nackJob(job: EmailJob, error: string): Promise<void> {
  job.attempts++

  if (job.attempts >= MAX_RETRIES) {
    // Dead letter queue
    if (redis) {
      await redis.rpush(DLQ_KEY, JSON.stringify({ ...job, error, failedAt: Date.now() }))
    } else {
      await adminDb.collection('jobQueue').doc(job.id).update({
        status: 'dead',
        error,
        failedAt: FieldValue.serverTimestamp(),
      })
    }
    return
  }

  // Re-enqueue for retry
  if (redis) {
    await redis.rpush(QUEUE_KEY, JSON.stringify(job))
  } else {
    await adminDb.collection('jobQueue').doc(job.id).update({
      status: 'pending',
      attempts: job.attempts,
      lastError: error,
    })
  }
}

/** Get queue depth (for monitoring). */
export async function getQueueDepth(): Promise<{ pending: number; dlq: number }> {
  if (redis) {
    const [pending, dlq] = await Promise.all([
      redis.llen(QUEUE_KEY),
      redis.llen(DLQ_KEY),
    ])
    return { pending, dlq }
  }

  const [pendingSnap, dlqSnap] = await Promise.all([
    adminDb.collection('jobQueue').where('status', '==', 'pending').count().get(),
    adminDb.collection('jobQueue').where('status', '==', 'dead').count().get(),
  ])
  return {
    pending: pendingSnap.data().count,
    dlq: dlqSnap.data().count,
  }
}

/** Trigger the worker endpoint (fire-and-forget). */
export function triggerWorker(): void {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const secret = process.env.CRON_SECRET
  if (!appUrl || !secret) return

  fetch(`${appUrl}/api/workers/process-email`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(5_000),
  }).catch(() => {
    // Fire-and-forget — worker can also be triggered by cron
  })
}
