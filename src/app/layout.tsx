import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono, Instrument_Sans } from 'next/font/google'
import './globals.css'
import { ServiceWorker } from '@/components/service-worker'

const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-instrument-sans',
  display: 'swap',
})

// Figures only. Tabular by default so columns scan like a bank statement.
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Project2AK',
  description: 'Personal finance, built around how fast you can log a transaction.',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, title: 'Project2AK', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FBFAF7' },
    { media: '(prefers-color-scheme: dark)', color: '#0D131F' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-PH" className={`${instrumentSans.variable} ${plexMono.variable}`}>
      <body className="bg-paper text-ink antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  )
}
