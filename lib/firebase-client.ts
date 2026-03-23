import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim(),
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim(),
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim(),
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim(),
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?.trim(),
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID?.trim(),
}

// Only initialize Firebase on the client side
const app =
  typeof window !== 'undefined'
    ? getApps().length
      ? getApp()
      : initializeApp(firebaseConfig)
    : null

export const auth = app ? getAuth(app) : null!
export const db = app ? getFirestore(app) : null!

// Basic login — no sensitive scopes
export const googleProvider = new GoogleAuthProvider()

// Gmail connect — includes sensitive scopes for inbox access
export const gmailProvider = new GoogleAuthProvider()
gmailProvider.addScope('https://www.googleapis.com/auth/gmail.readonly')
gmailProvider.addScope('https://www.googleapis.com/auth/gmail.send')
gmailProvider.setCustomParameters({ access_type: 'offline', prompt: 'consent' })

export default app
