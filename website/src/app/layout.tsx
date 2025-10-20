import type { Metadata, Viewport } from 'next';
import './globals.css';
import '@/styles/vibe-panels.css';
// import '@/styles/desktop-compat.css';
import { fontClasses } from './fonts';
import { StructuredData } from '@/components/seo/StructuredData';
import type { WebSite, Organization } from 'schema-dts';
import { ClientProviders } from '@/components/providers/ClientProviders';
// import { ConditionalBackground } from '@/components/system/ConditionalBackground';
import { Footer } from '@/components/landing/Footer';
import { CSSFix } from '@/components/system/CSSFix';
import { cdnUrl } from '@/lib/cdn';
import { XPixel } from '@/components/analytics/XPixel';
import { CookieConsent } from '@/components/analytics/CookieConsent';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.plantocode.com'),
  title: {
    template: '%s | PlanToCode',
    default: 'PlanToCode - plan and ship code changes',
  },
  description: 'PlanToCode helps you plan and ship code changes - find the right files, generate and merge AI plans, then run them in a persistent terminal.',
  keywords: ['plan to code', 'ai planning workspace', 'implementation planning tool', 'find files before coding', 'merge ai plans', 'persistent terminal sessions', 'claude code install', 'install claude code', 'claudecode', 'claude code planning', 'claude code agents', 'claude code mcp', 'claude code cli', 'claude code vs cursor', 'claude code github', 'claude code vscode', 'claude code windows', 'claude code router', 'claude code subagents', 'claude code sdk', 'claude code hooks', 'claude code docs', 'AI coding assistant', 'multi-model planning', 'implementation plan', 'file discovery'],
  authors: [{ name: 'PlanToCode Team' }],
  creator: 'PlanToCode',
  publisher: 'PlanToCode',
  category: 'Developer Tools',
  classification: 'AI Development Assistant',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: 'https://www.plantocode.com/',
  },
  openGraph: {
    title: 'PlanToCode - plan and ship code changes',
    description: 'Find impacted files, generate and merge AI plans, run in a persistent terminal.',
    url: 'https://www.plantocode.com/',
    siteName: 'PlanToCode',
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI planning tool with integrated terminal',
      type: 'image/png',
    }],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PlanToCode - plan and ship code changes',
    description: 'Find impacted files, generate and merge AI plans, run in a persistent terminal.',
    images: [{
      url: cdnUrl('/images/og-image.png'),
      alt: 'PlanToCode - AI planning tool with integrated terminal',
      width: 1200,
      height: 630,
    }],
    creator: '@plantocode',
    site: '@plantocode',
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
  applicationName: 'PlanToCode',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'PlanToCode',
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
    'apple-mobile-web-app-title': 'PlanToCode',
    'application-name': 'PlanToCode',
    'msapplication-TileColor': 'oklch(0.18 0.02 206)',
    'msapplication-tooltip': 'PlanToCode - plan and ship code changes',
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
  name: 'PlanToCode',
  alternateName: 'PlanToCode',
  url: 'https://www.plantocode.com',
  description: 'PlanToCode helps you plan and ship code changes - find the right files, generate and merge AI plans, then run them in a persistent terminal.',
  potentialAction: {
    '@type': 'SearchAction',
    target: 'https://www.plantocode.com/search?q={search_term_string}',
    // @ts-ignore - query-input is a valid schema.org property but not in the TypeScript types
    'query-input': 'required name=search_term_string'
  }
};

const organizationJsonLd: Organization = {
  '@type': 'Organization',
  name: 'PlanToCode',
  url: 'https://www.plantocode.com',
  logo: {
    '@type': 'ImageObject',
    url: 'https://www.plantocode.com/images/icon.webp',
    width: '512',
    height: '512'
  },
  sameAs: [
    'https://x.com/plantocode',
    'https://github.com/plantocode'
  ],
  description: 'PlanToCode helps you plan and ship code changes - find the right files, generate and merge AI plans, then run them in a persistent terminal.'
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
        <link rel="preconnect" href="https://va.vercel-scripts.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://cdn.jsdelivr.net" />
        {/* Preconnect to CloudFront CDN for faster image loading */}
        <link rel="preconnect" href="https://d2tyb0wucqqf48.cloudfront.net" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://d2tyb0wucqqf48.cloudfront.net" />
        {/* Privacy-friendly analytics by Plausible */}
        <script async src="https://plausible.io/js/pa-OwEhgpe8qgYykGAXbW94Z.js"></script>
        <script dangerouslySetInnerHTML={{
          __html: `window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()`
        }} />
      </head>
      <body className={`${fontClasses.sans} bg-transparent overflow-x-hidden`}>
        {/* <ConditionalBackground /> */}
        <CSSFix />
        <ClientProviders>
          {children}
          <Footer />
          {/* Cookie Consent Banner - GDPR Compliant */}
          <CookieConsent />
          {/* X Pixel - Loads ONLY after consent */}
          {process.env.NEXT_PUBLIC_X_PIXEL_ID && (
            <XPixel pixelId={process.env.NEXT_PUBLIC_X_PIXEL_ID} />
          )}
        </ClientProviders>
        <StructuredData data={websiteJsonLd} />
        <StructuredData data={organizationJsonLd} />
      </body>
    </html>
  );
}