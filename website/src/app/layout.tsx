import type { Metadata, Viewport } from 'next';
import './globals.css';
// import '@/styles/desktop-compat.css';
import { fontClasses } from './fonts';
import { StructuredData } from '@/components/seo/StructuredData';
import type { WebSite } from 'schema-dts';
import { ClientProviders } from '@/components/providers/ClientProviders';
import { ConditionalBackground } from '@/components/system/ConditionalBackground';
import { Footer } from '@/components/landing/Footer';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { cdnUrl } from '@/lib/cdn';

export const metadata: Metadata = {
  metadataBase: new URL('https://vibemanager.app'),
  title: {
    template: '%s | Vibe Manager',
    default: 'Vibe code cleanup specialist',
  },
  description: "The AI coding assistant that acts as a middle-manager for your LLMs, curating the perfect context so they can't get lost. Built by a developer, for developers, from the trenches.",
  keywords: ['AI coding assistant', 'context curation', 'vibe coding', 'multi-model AI', 'codebase analysis', 'implementation plans', 'developer tools', 'local AI', 'private AI coding', 'Claude Code', 'Gemini', 'large codebase', 'developer productivity'],
  authors: [{ name: 'Vibe Manager Team' }],
  creator: 'Vibe Manager',
  publisher: 'Vibe Manager',
  category: 'Developer Tools',
  classification: 'AI Development Assistant',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: 'https://vibemanager.app/',
  },
  openGraph: {
    title: 'Vibe code cleanup specialist',
    description: 'Tired of babysitting your AI agent? Vibe Manager is the competent middle manager that curates perfect context from your codebase and the web, so your agents can build correctly the first time.',
    url: 'https://vibemanager.app/',
    siteName: 'Vibe Manager',
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'Vibe Manager - AI-Powered Context Curation for Large Codebases',
      type: 'image/png',
    }],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vibe code cleanup specialist',
    description: 'Tired of babysitting your AI agent? Vibe Manager is the competent middle manager that curates perfect context from your codebase and the web, so your agents can build correctly the first time.',
    images: [{
      url: cdnUrl('/images/og-image.png'),
      alt: 'Vibe Manager - AI-Powered Context Curation for Large Codebases',
      width: 1200,
      height: 630,
    }],
    creator: '@vibemanagerapp',
    site: '@vibemanagerapp',
  },
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION_CODE || '',
  },
  applicationName: 'Vibe Manager',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Vibe Manager',
  },
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-48x48.png', sizes: '48x48', type: 'image/png' },
      { url: '/favicon-64x64.png', sizes: '64x64', type: 'image/png' },
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-touch-icon.png',
    other: [
      {
        rel: 'android-chrome-192x192',
        url: '/android-chrome-192x192.png',
      },
      {
        rel: 'android-chrome-512x512',
        url: '/android-chrome-512x512.png',
      },
    ],
  },
  manifest: '/site.webmanifest',
  other: {
    'apple-mobile-web-app-title': 'Vibe Manager',
    'application-name': 'Vibe Manager',
    'msapplication-TileColor': 'oklch(0.18 0.02 206)',
    'msapplication-tooltip': 'Vibe Manager - AI-Powered Context Curation',
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'oklch(0.98 0.01 195)' },
    { media: '(prefers-color-scheme: dark)', color: 'oklch(0.18 0.02 206)' },
  ],
};

const websiteJsonLd: WebSite = {
  '@type': 'WebSite',
  name: 'Vibe Manager',
  url: 'https://vibemanager.app',
  description: "The AI coding assistant that acts as a middle-manager for your LLMs, curating the perfect context so they can't get lost. Built by a developer, for developers, from the trenches.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html suppressHydrationWarning className={fontClasses.variables} lang="en">
      <head>
        {/* Preconnect to critical third-party origins - from Lighthouse report */}
        {/* Additional preconnects for analytics if enabled */}
        {process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && (
          <>
            <link rel="dns-prefetch" href="https://www.google-analytics.com" />
            <link rel="preconnect" href="https://www.google-analytics.com" crossOrigin="anonymous" />
          </>
        )}
        {/* Plausible Analytics */}
        <script defer data-domain="vibemanager.app" src="https://plausible.io/js/script.js"></script>
        <script dangerouslySetInnerHTML={{
          __html: `window.plausible = window.plausible || function() { (window.plausible.q = window.plausible.q || []).push(arguments) }`
        }} />
      </head>
      <body className={`${fontClasses.sans} bg-transparent overflow-x-hidden`}>
        <ConditionalBackground />
        <ClientProviders>
          {children}
          <Footer />
        </ClientProviders>
        <SpeedInsights />
        <StructuredData data={websiteJsonLd} />
      </body>
    </html>
  );
}