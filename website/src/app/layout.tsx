import type { Metadata } from 'next';
import './globals.css';
import '@/styles/gradients.css';
import { fontClasses } from './fonts';
import { StructuredData } from '@/components/seo/StructuredData';
import type { WebSite } from 'schema-dts';
import { ClientProviders } from '@/components/providers/ClientProviders';
import { GoogleAnalytics } from '@next/third-parties/google';

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
  other: {
    'apple-mobile-web-app-title': 'Vibe Manager',
    'application-name': 'Vibe Manager',
    'msapplication-TileColor': '#000000',
    'theme-color': '#ffffff', // Default to light theme for initial load
  },
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
      <head>
        <meta 
          name="theme-color" 
          content="#ffffff" 
          media="(prefers-color-scheme: light)"
        />
        <meta 
          name="theme-color" 
          content="#2d3748" 
          media="(prefers-color-scheme: dark)"
        />
        
        {/* Font preload for critical Inter font */}
        <link
          rel="preload"
          href="/fonts/inter-variable.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const savedTheme = localStorage.getItem('vibe-manager-theme');
                  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                  const theme = savedTheme === 'system' || !savedTheme ? systemTheme : savedTheme;
                  
                  if (theme === 'dark') {
                    document.documentElement.classList.add('dark');
                  }
                } catch (e) {}
              })();
            `
          }}
        />
      </head>
      <body className={fontClasses.sans}>
        {/* Animated gradient background with GPU acceleration */}
        <div className="fixed inset-0 -z-10 gradient-hero-animated gradient-optimized" />
        
        {/* Subtle gradient overlay for depth */}
        <div className="fixed inset-0 -z-10 gradient-overlay opacity-30" />
        
        <ClientProviders>
          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "G-XXXXXXXXXX"} />
          <StructuredData data={websiteJsonLd} />
          
          {/* Main content with proper z-index */}
          <div className="relative z-10">
            {children}
          </div>
        </ClientProviders>
      </body>
    </html>
  );
}