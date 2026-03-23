'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { onAuthStateChanged, User } from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase-client'

interface AuthContextValue {
  user: User | null
  loading: boolean
  onboardingStep: number
  onboardingComplete: boolean
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  onboardingStep: 1,
  onboardingComplete: false,
})

export function FirebaseProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [onboardingStep, setOnboardingStep] = useState(1)
  const [onboardingComplete, setOnboardingComplete] = useState(false)

  useEffect(() => {
    if (!auth) {
      setLoading(false)
      return
    }
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)
      if (firebaseUser) {
        const ref = doc(db, 'manufacturers', firebaseUser.uid)
        const snap = await getDoc(ref)
        if (snap.exists()) {
          const data = snap.data()
          setOnboardingStep(data.onboardingStep ?? 1)
          setOnboardingComplete(data.onboardingComplete ?? false)
        } else {
          // Doc missing — create it (handles users who authenticated before doc was written)
          await setDoc(ref, {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            katanaConnected: false,
            upsConnected: true,
            gmailConnected: false,
            onboardingStep: 1,
            onboardingComplete: false,
            isLive: false,
            draftMode: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        }
      }
      setLoading(false)
    })
    return unsub
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, onboardingStep, onboardingComplete }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
