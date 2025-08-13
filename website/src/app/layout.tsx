import type { Metadata, Viewport } from 'next';
import './globals.css';
import { fontClasses } from './fonts';
import { StructuredData } from '@/components/seo/StructuredData';
import type { WebSite } from 'schema-dts';
import { ClientProviders } from '@/components/providers/ClientProviders';
import { GoogleAnalytics } from '@next/third-parties/google';
import { ConditionalBackground } from '@/components/system/ConditionalBackground';
import { Footer } from '@/components/landing/Footer';
import { SpeedInsights } from '@vercel/speed-insights/next';

export const metadata: Metadata = {
  metadataBase: new URL('https://vibemanager.app'),
  title: {
    template: '%s | Vibe Manager',
    default: 'Vibe Manager | Context for Lost AI Agents',
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
    title: 'Vibe Manager | Context for Lost AI Agents',
    description: 'Tired of babysitting your AI agent? Vibe Manager is the competent middle manager that curates perfect context from your codebase and the web, so your agents can build correctly the first time.',
    url: 'https://vibemanager.app/',
    siteName: 'Vibe Manager',
    images: [{
      url: 'https://d2tyb0wucqqf48.cloudfront.net/og-image.png',
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
    title: 'Vibe Manager | Context for Lost AI Agents',
    description: 'Tired of babysitting your AI agent? Vibe Manager is the competent middle manager that curates perfect context from your codebase and the web, so your agents can build correctly the first time.',
    images: [{
      url: 'https://d2tyb0wucqqf48.cloudfront.net/og-image.png',
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
  other: {
    'apple-mobile-web-app-title': 'Vibe Manager',
    'application-name': 'Vibe Manager',
    'msapplication-TileColor': 'oklch(0.18 0.02 206)',
    'msapplication-tooltip': 'Vibe Manager - AI-Powered Context Curation',
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
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
      <head />
      <body className={`${fontClasses.sans} bg-transparent overflow-x-hidden`}>
        <ConditionalBackground />
        <ClientProviders>
          {children}
          <Footer />
        </ClientProviders>
        {process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && (
          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID} />
        )}
        <SpeedInsights />
        <StructuredData data={websiteJsonLd} />
      </body>
    </html>
  );
}