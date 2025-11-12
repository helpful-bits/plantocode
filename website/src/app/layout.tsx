import './globals.css';
import type { Metadata } from 'next';
import { headers } from 'next/headers';

export const metadata: Metadata = {
  alternates: {
    languages: {
      en: 'https://www.plantocode.com',
      de: 'https://www.plantocode.com/de',
      fr: 'https://www.plantocode.com/fr',
      es: 'https://www.plantocode.com/es',
    },
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const locale = headersList.get('x-next-locale') || 'en';

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Preconnect to critical third-party origins - from Lighthouse report */}
        <link rel="preconnect" href="https://va.vercel-scripts.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://cdn.jsdelivr.net" />
        {/* Preconnect to CloudFront CDN for faster image loading */}
        <link rel="preconnect" href="https://d2tyb0wucqqf48.cloudfront.net" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://d2tyb0wucqqf48.cloudfront.net" />
      </head>
      <body>{children}</body>
    </html>
  );
}
