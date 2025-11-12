import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import LegalContent from '@/components/legal/LegalContent';
import { cdnUrl } from '@/lib/cdn';
import type { Locale } from '@/lib/i18n';
import { locales } from '@/i18n/config';
import EUTermsContent from '@/components/legal/eu/TermsContent';
import EUTermsContentDE from '@/components/legal/eu/TermsContent.de';
import USTermsContent from '@/components/legal/us/TermsContent';

interface TermsPageProps {
  params: Promise<{
    locale: Locale;
    region: string;
  }>;
}

export async function generateMetadata({ params }: TermsPageProps): Promise<Metadata> {
  const { locale, region } = await params;

  if (region !== 'eu' && region !== 'us') {
    return {
      title: 'Terms of Service - Not Found',
    };
  }

  const regionName = region === 'eu' ? 'EU/UK' : 'United States';
  const title = locale === 'de' ? 'Nutzungsbedingungen' : 'Terms of Service';
  const description = locale === 'de'
    ? `Nutzungsbedingungen für die Nutzung unserer KI-Workflow-Plattform. Gilt für ${regionName} Nutzer.`
    : `Terms of service outlining rules for using our AI workflow platform. Applicable to ${regionName} users.`;

  const canonicalUrl = locale === 'en'
    ? `https://www.plantocode.com/legal/${region}/terms`
    : `https://www.plantocode.com/${locale}/legal/${region}/terms`;

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
        en: `https://www.plantocode.com/legal/${region}/terms`,
        de: `https://www.plantocode.com/de/legal/${region}/terms`,
        es: `https://www.plantocode.com/es/legal/${region}/terms`,
        fr: `https://www.plantocode.com/fr/legal/${region}/terms`,
        ja: `https://www.plantocode.com/ja/legal/${region}/terms`,
        ko: `https://www.plantocode.com/ko/legal/${region}/terms`,
        'x-default': `https://www.plantocode.com/legal/${region}/terms`,
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
        alt: 'PlanToCode - AI Planning for Code',
      }],
    },
  };
}

export function generateStaticParams() {
  return locales.flatMap((locale: Locale) =>
    ['us', 'eu'].map(region => ({ locale, region }))
  );
}

export default async function TermsPage({ params }: TermsPageProps) {
  const { locale, region } = await params;

  const title = locale === 'de' ? 'Nutzungsbedingungen' : 'Terms of Service';
  const subtitle = locale === 'de' ? 'Gültig ab: 22. September 2025' : 'Effective Date: September 22, 2025';

  if (region === 'eu') {
    const ContentComponent = locale === 'de' ? EUTermsContentDE : EUTermsContent;
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
        <USTermsContent />
      </LegalContent>
    );
  }

  notFound();
}