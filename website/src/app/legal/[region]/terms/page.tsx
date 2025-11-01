import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import LegalContent from '@/components/legal/LegalContent';
import { cdnUrl } from '@/lib/cdn';
import EUTermsContent from '@/components/legal/eu/TermsContent';
import USTermsContent from '@/components/legal/us/TermsContent';

interface TermsPageProps {
  params: Promise<{
    region: string;
  }>;
}

export async function generateMetadata({ params }: TermsPageProps): Promise<Metadata> {
  const { region } = await params;
  
  if (region !== 'eu' && region !== 'us') {
    return {
      title: 'Terms of Service - Not Found',
    };
  }

  const regionName = region === 'eu' ? 'EU/UK' : 'United States';
  
  return {
    title: 'Terms of Service',
    description: `Terms of service for our application outlining the rules and guidelines for using our AI-powered workflow automation platform. Applicable to ${regionName} users.`,
    robots: {
      index: true,
      follow: true,
    },
    alternates: {
      canonical: `https://www.plantocode.com/legal/${region}/terms`,
      languages: {
        'x-default': 'https://www.plantocode.com/legal/us/terms',
        'en-US': 'https://www.plantocode.com/legal/us/terms',
        'en-GB': 'https://www.plantocode.com/legal/eu/terms',
        'en-EU': 'https://www.plantocode.com/legal/eu/terms',
      },
    },
    openGraph: {
      title: 'Terms of Service',
      description: `Terms of service for our application outlining the rules and guidelines for using our AI-powered workflow automation platform. Applicable to ${regionName} users.`,
      url: `https://www.plantocode.com/legal/${region}/terms`,
      siteName: 'PlanToCode',
      type: 'website',
      locale: 'en_US',
      images: [{
        url: cdnUrl('/images/og-image.png'),
        width: 1200,
        height: 630,
        alt: 'PlanToCode - AI Planning for Code',
      }],
    },
  };
}

export default async function TermsPage({ params }: TermsPageProps) {
  const { region } = await params;

  if (region === 'eu') {
    return (
      <LegalContent
        title="Terms of Service"
        subtitle="Effective Date: September 22, 2025"
      >
        <EUTermsContent />
      </LegalContent>
    );
  } else if (region === 'us') {
    return (
      <LegalContent
        title="Terms of Service"
        subtitle="Effective Date: September 22, 2025"
      >
        <USTermsContent />
      </LegalContent>
    );
  }
  
  notFound();
}