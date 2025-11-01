import type { Metadata } from 'next';
import { cdnUrl } from '@/lib/cdn';

export const metadata: Metadata = {
  alternates: {
    canonical: 'https://www.plantocode.com/schedule',
  },
  openGraph: {
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
