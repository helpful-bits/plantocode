import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import LegalContent from '@/components/legal/LegalContent';
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
      canonical: `/legal/${region}/privacy`,
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