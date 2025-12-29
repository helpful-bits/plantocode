import type { Metadata, Viewport } from 'next';
import '../globals.css';
import '@/styles/vibe-panels.css';
import { fontClasses } from '../fonts';
import { StructuredData } from '@/components/seo/StructuredData';
import type { WebSite, Organization } from 'schema-dts';
import { ClientProviders } from '@/components/providers/ClientProviders';
import { Footer } from '@/components/landing/Footer';
import { CSSFix } from '@/components/system/CSSFix';
import { cdnUrl } from '@/lib/cdn';
import { XPixel } from '@/components/analytics/XPixel';
import { CookieConsent } from '@/components/analytics/CookieConsent';
import { GoogleAnalytics } from '@/components/analytics/GoogleAnalytics';
import { DatafastAnalytics } from '@/components/analytics/DatafastAnalytics';
import Script from 'next/script';
import { I18nProvider } from '@/components/i18n/I18nProvider';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/config';
import { LOCALES } from '@/i18n/config';
import { loadMessages } from '@/lib/i18n';

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
    canonical: 'https://www.plantocode.com',
    languages: {
      en: 'https://www.plantocode.com',
      de: 'https://www.plantocode.com/de',
      es: 'https://www.plantocode.com/es',
      fr: 'https://www.plantocode.com/fr',
      ja: 'https://www.plantocode.com/ja',
      ko: 'https://www.plantocode.com/ko',
      'x-default': 'https://www.plantocode.com',
    }
  },
  openGraph: {
    title: 'PlanToCode - plan and ship code changes',
    description: 'Find impacted files, generate and merge AI plans, run in a persistent terminal.',
    url: 'https://www.plantocode.com',
    siteName: 'PlanToCode',
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI planning tool with integrated terminal',
      type: 'image/png',
    }],
    locale: 'en_US',
    alternateLocale: ['de_DE', 'fr_FR', 'es_ES', 'ko_KR', 'ja_JP'],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PlanToCode - plan and ship code changes',
    description: 'Find impacted files, generate and merge AI plans, run in a persistent terminal.',
    images: [{
      url: cdnUrl('/images/og-image.png'),
      alt: 'PlanToCode - AI Planning for Code',
      width: 1200,
      height: 630,
    }],
    creator: '@helpfulbits_com',
    site: '@helpfulbits_com',
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
  // SearchAction removed - we use client-side search only (SearchDialog component)
  // This prevents Google from crawling non-existent /search?q= URLs
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
    'https://x.com/helpfulbits_com',
    'https://github.com/plantocode'
  ],
  description: 'PlanToCode helps you plan and ship code changes - find the right files, generate and merge AI plans, then run them in a persistent terminal.',
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'Customer Support',
    url: 'https://www.plantocode.com/support',
    availableLanguage: ['English', 'German', 'French', 'Spanish', 'Japanese', 'Korean']
  },
  foundingDate: '2024',
  // @ts-ignore - address is valid but optional in schema.org
  address: {
    '@type': 'PostalAddress',
    addressCountry: 'US'
  }
};

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params as { locale: Locale };
  setRequestLocale(locale);
  const messages = await getMessages();
  const flatMessages = await loadMessages(locale);

  return (
    <>
      {/* Crisp Chat Widget */}
      <Script
        id="crisp-chat"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `window.$crisp=[];window.CRISP_WEBSITE_ID="9cdabe80-2d86-4925-9490-c999d53d0e6b";(function(){d=document;s=d.createElement("script");s.src="https://client.crisp.chat/l.js";s.async=1;d.getElementsByTagName("head")[0].appendChild(s);})();`
        }}
      />

      <div className={`${fontClasses.sans} ${fontClasses.variables} bg-transparent overflow-x-hidden`} data-locale={locale}>
        <CSSFix />
        <ClientProviders>
          <NextIntlClientProvider locale={locale} messages={messages}>
            <I18nProvider locale={locale} initialMessages={flatMessages}>
              {children}
              <Footer />
            </I18nProvider>
          </NextIntlClientProvider>
          {/* Cookie Consent Banner - GDPR Compliant */}
          <CookieConsent />
          {/* X Pixel - Loads ONLY after consent */}
          {process.env.NEXT_PUBLIC_X_PIXEL_ID && (
            <XPixel pixelId={process.env.NEXT_PUBLIC_X_PIXEL_ID} />
          )}
          {/* Google Analytics - Loads ONLY after consent */}
          {process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && (
            <GoogleAnalytics
              measurementId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}
              locale={locale}
            />
          )}
          {/* Datafast Analytics - Loads ONLY after consent */}
          {process.env.NEXT_PUBLIC_DATAFAST_WEBSITE_ID && (
            <DatafastAnalytics
              websiteId={process.env.NEXT_PUBLIC_DATAFAST_WEBSITE_ID}
            />
          )}
        </ClientProviders>
        <StructuredData data={websiteJsonLd} />
        <StructuredData data={organizationJsonLd} />
      </div>
    </>
  );
}
