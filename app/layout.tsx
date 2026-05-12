import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { FirebaseProvider } from '@/components/providers/FirebaseProvider'
import { Analytics } from '@vercel/analytics/next'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'WISMO — AI Order Inquiry Automation',
  description: 'Automated customer order inquiry management for manufacturers',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.className} h-full`}>
      <body className="min-h-full">
        <FirebaseProvider>{children}</FirebaseProvider>
        <Analytics />
      </body>
    </html>
  )
}
