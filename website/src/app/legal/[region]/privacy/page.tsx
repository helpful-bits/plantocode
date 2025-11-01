import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import LegalContent from '@/components/legal/LegalContent';
import { cdnUrl } from '@/lib/cdn';
import EUPrivacyContent from '@/components/legal/eu/PrivacyContent';
import USPrivacyContent from '@/components/legal/us/PrivacyContent';

interface PrivacyPageProps {
  params: Promise<{
    region: string;
  }>;
}

export async function generateMetadata({ params }: PrivacyPageProps): Promise<Metadata> {
  const { region } = await params;
  
  if (region !== 'eu' && region !== 'us') {
    return {
      title: 'Privacy Policy - Not Found',
    };
  }

  const regionName = region === 'eu' ? 'EU/UK' : 'United States';
  
  return {
    title: 'Privacy Policy',
    description: `Privacy policy for our application outlining how we collect, use, and protect your personal information. Applicable to ${regionName} users.`,
    robots: {
      index: true,
      follow: true,
    },
    alternates: {
      canonical: `https://www.plantocode.com/legal/${region}/privacy`,
      languages: {
        'x-default': 'https://www.plantocode.com/legal/us/privacy',
        'en-US': 'https://www.plantocode.com/legal/us/privacy',
        'en-GB': 'https://www.plantocode.com/legal/eu/privacy',
        'en-EU': 'https://www.plantocode.com/legal/eu/privacy',
      },
    },
    openGraph: {
      title: 'Privacy Policy',
      description: `Privacy policy for our application outlining how we collect, use, and protect your personal information. Applicable to ${regionName} users.`,
      url: `https://www.plantocode.com/legal/${region}/privacy`,
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

export default async function PrivacyPage({ params }: PrivacyPageProps) {
  const { region } = await params;

  if (region === 'eu') {
    return (
      <LegalContent
        title="Privacy Policy"
        subtitle="Effective Date: September 22, 2025"
      >
        <EUPrivacyContent />
      </LegalContent>
    );
  } else if (region === 'us') {
    return (
      <LegalContent
        title="Privacy Policy"
        subtitle="Effective Date: September 22, 2025"
      >
        <USPrivacyContent />
      </LegalContent>
    );
  }
  
  notFound();
}