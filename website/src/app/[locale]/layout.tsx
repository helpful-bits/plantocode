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
    canonical: 'https://www.plantocode.com/',
    languages: {
      en: '/',
      de: '/de',
      fr: '/fr',
      es: '/es',
    }
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
      {/* Google Analytics - GA4 */}
      {process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}`}
            strategy="afterInteractive"
          />
          <Script
            id="ga-init"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}', {
                  page_path: window.location.pathname,
                  send_page_view: false
                });
              `
            }}
          />
          <Script
            id="ga-locale"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
                if (window.gtag) {
                  window.gtag('set', {'language': '${locale}'});
                }
              `
            }}
          />
        </>
      )}

      {/* Privacy-friendly analytics by Plausible */}
      <Script
        src="https://plausible.io/js/pa-OwEhgpe8qgYykGAXbW94Z.js"
        strategy="afterInteractive"
      />
      <Script
        id="plausible-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()`
        }}
      />

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
        </ClientProviders>
        <StructuredData data={websiteJsonLd} />
        <StructuredData data={organizationJsonLd} />
      </div>
    </>
  );
}
