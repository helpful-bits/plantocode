import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import LegalContent from '@/components/legal/LegalContent';
import { cdnUrl } from '@/lib/cdn';
import { ObfuscatedEmail } from '@/components/ui/ObfuscatedEmail';
import SubprocessorsList from '@/components/legal/SubprocessorsList';
import { locales } from '@/i18n/config';
import type { Locale } from '@/lib/i18n';

interface SubprocessorsPageProps {
  params: Promise<{
    locale: string;
    region: string;
  }>;
}

export async function generateMetadata({ params }: SubprocessorsPageProps): Promise<Metadata> {
  const { locale, region } = await params;

  if (region !== 'eu' && region !== 'us') {
    return {
      title: 'Sub-processors - Not Found',
    };
  }

  const regionName = region === 'eu' ? 'EU/UK' : 'United States';
  const canonicalUrl = locale === 'en'
    ? `https://www.plantocode.com/legal/${region}/subprocessors`
    : `https://www.plantocode.com/${locale}/legal/${region}/subprocessors`;

  return {
    title: 'Sub-processors',
    description: `List of third-party sub-processors used by PlanToCode for providing our AI-powered workflow automation services. Applicable to ${regionName} users.`,
    robots: {
      index: true,
      follow: true,
    },
    alternates: {
      canonical: canonicalUrl,
      languages: {
        en: `https://www.plantocode.com/legal/${region}/subprocessors`,
        de: `https://www.plantocode.com/de/legal/${region}/subprocessors`,
        es: `https://www.plantocode.com/es/legal/${region}/subprocessors`,
        fr: `https://www.plantocode.com/fr/legal/${region}/subprocessors`,
        ja: `https://www.plantocode.com/ja/legal/${region}/subprocessors`,
        ko: `https://www.plantocode.com/ko/legal/${region}/subprocessors`,
        'x-default': `https://www.plantocode.com/legal/${region}/subprocessors`,
      },
    },
    openGraph: {
      title: 'Sub-processors',
      description: `List of third-party sub-processors used by PlanToCode for providing our AI-powered workflow automation services. Applicable to ${regionName} users.`,
      url: canonicalUrl,
      siteName: 'PlanToCode',
      type: 'website',
      locale: 'en_US',
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

export default async function SubprocessorsPage({ params }: SubprocessorsPageProps) {
  const { region } = await params;

  if (region !== 'eu' && region !== 'us') {
    notFound();
  }

  const regionName = region === 'eu' ? 'EU/UK' : 'United States';

  return (
    <LegalContent
      title="Sub-processors"
      subtitle="Last updated: September 22, 2025"
    >
      <section>
        <h2 className="text-2xl font-semibold mb-4">Introduction</h2>
        <p>
          This page lists the third-party sub-processors that helpful bits GmbH uses to provide
          the PlanToCode service to users in the {regionName}. We will provide advance notice of any material changes to
          our sub-processor arrangements, including the addition of new sub-processors or changes
          to existing ones that may affect the processing of your personal data.
        </p>
        <p className="mt-4">
          All sub-processors are contractually bound to maintain appropriate security measures 
          and comply with applicable data protection laws{region === 'eu' ? ', including GDPR requirements and appropriate safeguards for international transfers' : ''}.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Current Sub-processors</h2>
        <SubprocessorsList region={region as 'eu' | 'us'} />
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Data Protection</h2>
        <p>
          All sub-processors are required to implement appropriate technical and organizational 
          measures to ensure a level of security appropriate to the risk of processing. We conduct 
          due diligence on all sub-processors to ensure they meet our data protection standards 
          and comply with applicable privacy laws{region === 'eu' ? ', including GDPR requirements' : ''}.
        </p>
        {region === 'eu' && (
          <p className="mt-4">
            <strong>International Transfers:</strong> Where personal data is transferred outside the EEA, 
            we ensure appropriate safeguards are in place through Standard Contractual Clauses (SCCs) 
            and supplementary measures as recommended by the European Data Protection Board.
          </p>
        )}
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Updates and Changes</h2>
        <p>
          We may update this list from time to time as we add or remove sub-processors. 
          Material changes will be communicated in advance through appropriate channels, 
          including updates to this page and direct notification where required by applicable law.
        </p>
        <p className="mt-4">
          If you have questions about our sub-processor arrangements or data processing practices,
          please contact us at <ObfuscatedEmail user="legal" domain="plantocode.com" className="link-primary" />.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Data Processing Addendum</h2>
        <p>
          Business customers who process personal data through our Service should review and accept our <a href={`/legal/${region}/dpa`} className="link-primary">Data Processing Addendum (DPA)</a>, which governs our data processing relationship and includes provisions for sub-processor management.
        </p>
      </section>
    </LegalContent>
  );
}