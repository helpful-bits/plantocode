import type { Metadata } from 'next';
import { cdnUrl } from '@/lib/cdn';

export const metadata: Metadata = {
  title: 'Talk to an Architect - PlanToCode',
  description: 'Get expert guidance on using PlanToCode for your team. Discuss architecture patterns, integration strategies, and deployment options.',
  alternates: {
    canonical: 'https://www.plantocode.com/schedule',
  },
  openGraph: {
    type: 'website',
    url: 'https://www.plantocode.com/schedule',
    title: 'Talk to an Architect - PlanToCode',
    siteName: 'PlanToCode',
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
  },
};

export default function ScheduleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
