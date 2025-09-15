import type { Metadata, Viewport } from 'next';
import './globals.css';
import '@/styles/vibe-panels.css';
// import '@/styles/desktop-compat.css';
import { fontClasses } from './fonts';
import { StructuredData } from '@/components/seo/StructuredData';
import type { WebSite, Organization } from 'schema-dts';
import { ClientProviders } from '@/components/providers/ClientProviders';
// import { ConditionalBackground } from '@/components/system/ConditionalBackground';
import { ConditionalFooter } from '@/components/system/ConditionalFooter';
import { CSSFix } from '@/components/system/CSSFix';
import { cdnUrl } from '@/lib/cdn';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.vibemanager.app'),
  title: {
    template: '%s | Vibe Manager',
    default: 'Vibe Manager - Multi-Model AI Planning Tool for Coding',
  },
  description: 'Vibe Manager enhances AI coding with multi-model planning. Works with Claude Code, Cursor, OpenAI Codex. Generate better implementation plans from GPT-5, Claude 4, Gemini 2.5. Free Mac app.',
  keywords: ['vibe manager', 'vibe code cleanup specialist', 'claude code install', 'install claude code', 'claudecode', 'claude code planning', 'claude code agents', 'claude code mcp', 'claude code cli', 'claude code vs cursor', 'claude code github', 'claude code vscode', 'claude code windows', 'claude code router', 'claude code subagents', 'claude code sdk', 'claude code hooks', 'claude code docs', 'AI coding assistant', 'multi-model planning', 'implementation plan', 'file discovery'],
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
    canonical: 'https://www.vibemanager.app/',
  },
  openGraph: {
    title: 'Vibe Manager - Multi-Model AI Planning Tool for Coding',
    description: 'Vibe Manager enhances AI coding with multi-model planning. Works with Claude Code, Cursor, OpenAI Codex. Generate better implementation plans from GPT-5, Claude 4, Gemini 2.5.',
    url: 'https://www.vibemanager.app/',
    siteName: 'Vibe Manager',
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'Vibe Manager - Multi-Model Planning for Claude Code',
      type: 'image/png',
    }],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vibe Manager - Multi-Model AI Planning Tool',
    description: 'Multi-model planning for Claude Code, Cursor & OpenAI Codex. Generate better plans from GPT-5, Claude 4, Gemini 2.5. Free Mac app.',
    images: [{
      url: cdnUrl('/images/og-image.png'),
      alt: 'Vibe Manager - Multi-Model Planning for Claude Code',
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
  alternateName: 'VibeManager',
  url: 'https://www.vibemanager.app',
  description: 'Multi-model AI planning tool for coding. Works with Claude Code, Cursor, and OpenAI Codex. Generate better implementation plans from multiple AI models.',
  potentialAction: {
    '@type': 'SearchAction',
    target: 'https://www.vibemanager.app/search?q={search_term_string}',
    // @ts-ignore - query-input is a valid schema.org property but not in the TypeScript types
    'query-input': 'required name=search_term_string'
  }
};

const organizationJsonLd: Organization = {
  '@type': 'Organization',
  name: 'Vibe Manager',
  url: 'https://www.vibemanager.app',
  logo: {
    '@type': 'ImageObject',
    url: 'https://www.vibemanager.app/images/icon.webp',
    width: '512',
    height: '512'
  },
  sameAs: [
    'https://twitter.com/vibemanagerapp',
    'https://github.com/vibemanager'
  ],
  description: 'Vibe Manager - Multi-model AI planning tool. Enhances Claude Code, Cursor, and OpenAI Codex with intelligent context curation and plan generation from multiple AI models.'
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
        {/* No analytics - 100% cookie-free and GDPR compliant */}
      </head>
      <body className={`${fontClasses.sans} bg-transparent overflow-x-hidden`}>
        {/* <ConditionalBackground /> */}
        <CSSFix />
        <ClientProviders>
          {children}
          <ConditionalFooter />
        </ClientProviders>
        <StructuredData data={websiteJsonLd} />
        <StructuredData data={organizationJsonLd} />
      </body>
    </html>
  );
}