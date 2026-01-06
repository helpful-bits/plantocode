import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import LegalContent from '@/components/legal/LegalContent';
import { cdnUrl } from '@/lib/cdn';
import type { Locale } from '@/lib/i18n';
import { locales } from '@/i18n/config';
import EUPrivacyContent from '@/components/legal/eu/PrivacyContent';
import EUPrivacyContentDE from '@/components/legal/eu/PrivacyContent.de';
import USPrivacyContent from '@/components/legal/us/PrivacyContent';

interface PrivacyPageProps {
  params: Promise<{
    locale: Locale;
    region: string;
  }>;
}

export async function generateMetadata({ params }: PrivacyPageProps): Promise<Metadata> {
  const { locale, region } = await params;

  if (region !== 'eu' && region !== 'us') {
    return {
      title: 'Privacy Policy - Not Found',
    };
  }

  const regionName = region === 'eu' ? 'EU/UK' : 'United States';
  const title = locale === 'de' ? 'Datenschutzerklärung' : 'Privacy Policy';
  const description = locale === 'de'
    ? `Datenschutzerklärung für unsere Anwendung, die beschreibt, wie wir Ihre persönlichen Daten erfassen, verwenden und schützen. Gilt für ${regionName} Nutzer.`
    : `Privacy policy for our application outlining how we collect, use, and protect your personal information. Applicable to ${regionName} users.`;

  const canonicalUrl = locale === 'en'
    ? `https://www.plantocode.com/legal/${region}/privacy`
    : `https://www.plantocode.com/${locale}/legal/${region}/privacy`;

  return {
    title,
    description,
    robots: {
      index: true,
      follow: true,
    },
    alternates: {
      canonical: canonicalUrl,
      languages: {
        en: `https://www.plantocode.com/legal/${region}/privacy`,
        de: `https://www.plantocode.com/de/legal/${region}/privacy`,
        es: `https://www.plantocode.com/es/legal/${region}/privacy`,
        fr: `https://www.plantocode.com/fr/legal/${region}/privacy`,
        ja: `https://www.plantocode.com/ja/legal/${region}/privacy`,
        ko: `https://www.plantocode.com/ko/legal/${region}/privacy`,
        'x-default': `https://www.plantocode.com/legal/${region}/privacy`,
      },
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: 'PlanToCode',
      type: 'website',
      locale: locale === 'de' ? 'de_DE' : 'en_US',
      images: [{
        url: cdnUrl('/images/og-image.png'),
        width: 1200,
        height: 630,
        alt: 'PlanToCode overview',
      }],
    },
  };
}

export function generateStaticParams() {
  return locales.flatMap((locale: Locale) =>
    ['us', 'eu'].map(region => ({ locale, region }))
  );
}

export default async function PrivacyPage({ params }: PrivacyPageProps) {
  const { locale, region } = await params;

  const title = locale === 'de' ? 'Datenschutzerklärung' : 'Privacy Policy';
  const subtitle = locale === 'de' ? 'Gültig ab: 22. September 2025' : 'Effective Date: September 22, 2025';

  if (region === 'eu') {
    const ContentComponent = locale === 'de' ? EUPrivacyContentDE : EUPrivacyContent;
    return (
      <LegalContent
        title={title}
        subtitle={subtitle}
      >
        <ContentComponent />
      </LegalContent>
    );
  } else if (region === 'us') {
    return (
      <LegalContent
        title={title}
        subtitle={subtitle}
      >
        <USPrivacyContent />
      </LegalContent>
    );
  }

  notFound();
}