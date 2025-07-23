import type { Metadata, Viewport } from 'next';
import './globals.css';
import { fontClasses } from './fonts';
import { StructuredData } from '@/components/seo/StructuredData';
import type { WebSite } from 'schema-dts';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { GoogleAnalytics } from '@next/third-parties/google';
import { ParallaxProvider } from '@/components/providers/ParallaxProvider';
import { ClientWrapper } from '@/components/ClientWrapper';
import { InteractiveBackground } from '@/components/landing/InteractiveBackground';

export const metadata: Metadata = {
  metadataBase: new URL('https://vibemanager.app'),
  title: {
    template: '%s | Vibe Manager',
    default: 'Vibe Manager | AI-Powered Context Curation',
  },
  description: 'An AI coding assistant that seamlessly integrates internet knowledge with your codebase to create actionable implementation plans.',
  keywords: [
    'AI coding assistant',
    'codebase analysis', 
    'implementation plans',
    'developer tools',
    'code context',
    'file discovery',
    'AI-powered development',
    'context curation',
    'large codebases',
    'file finder',
    'web research integration',
    'multi-model AI',
    'cost tracking',
    'privacy-first',
    'parallel execution',
    'session persistence'
  ],
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
    canonical: '/',
  },
  openGraph: {
    title: 'Vibe Manager | AI-Powered Context Curation',
    description: 'An AI coding assistant that seamlessly integrates internet knowledge with your codebase to create actionable implementation plans.',
    url: '/',
    siteName: 'Vibe Manager',
    images: [{
      url: 'https://vibe-manager-media.s3.amazonaws.com/og-image.png',
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
    title: 'Vibe Manager | AI-Powered Context Curation',
    description: 'An AI coding assistant that seamlessly integrates internet knowledge with your codebase to create actionable implementation plans.',
    images: [{
      url: 'https://vibe-manager-media.s3.amazonaws.com/og-image.png',
      alt: 'Vibe Manager - AI-Powered Context Curation for Large Codebases',
    }],
    creator: '@vibemanager',
    site: '@vibemanager',
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
    google: 'google-site-verification-code',
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
    { media: '(prefers-color-scheme: dark)', color: 'oklch(0.18 0.02 206)' }
  ],
};

const websiteJsonLd: WebSite = {
  '@type': 'WebSite',
  name: 'Vibe Manager',
  url: 'https://vibemanager.app',
  description: 'An AI coding assistant that seamlessly integrates internet knowledge with your codebase to create actionable implementation plans.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={fontClasses.variables}>
      <head></head>
      <body className={`${fontClasses.sans} bg-background dark:bg-background`}>
        <ClientWrapper />
        
        <ThemeProvider>
          <ParallaxProvider>
            <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "G-XXXXXXXXXX"} />
            <StructuredData data={websiteJsonLd} />
            
            {/* 3D Particle Background */}
            <InteractiveBackground particleCount={300} />
            
            {/* Main content with proper z-index */}
            <div className="relative z-10">
              {children}
            </div>
          </ParallaxProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}