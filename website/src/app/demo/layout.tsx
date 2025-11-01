import type { Metadata } from 'next';
import { cdnUrl } from '@/lib/cdn';

export const metadata: Metadata = {
  title: 'Interactive Demo - PlanToCode AI Planning Workflow',
  description: 'Try the complete AI planning workflow. See how file discovery, multi-model plans, human review, and safe execution work together.',
  alternates: {
    canonical: 'https://www.plantocode.com/demo',
  },
  openGraph: {
    title: 'Interactive Demo - PlanToCode AI Planning Workflow',
    description: 'Experience the complete workflow: file discovery, multi-model planning, human-in-the-loop review, and safe execution.',
    url: 'https://www.plantocode.com/demo',
    siteName: 'PlanToCode',
    type: 'website',
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
  },
};

export default function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
