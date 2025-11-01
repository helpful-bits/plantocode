import type { Metadata } from 'next';
import { PlanIntegrationLayout } from '@/components/plan/PlanIntegrationLayout';
import { cursorContent } from '@/content/plan-integrations/cursor';
import { cdnUrl } from '@/lib/cdn';

export const metadata: Metadata = {
  title: cursorContent.meta.title,
  description: cursorContent.meta.description,
  keywords: [
    'cursor planning workflow',
    'cursor composer planning',
    'cursor agent mode workflow',
    'cursor architectural planning',
    'cursor agent pre-planning',
    'cursor composer context',
    'plantocode cursor',
    'cursor agent terminal',
    'cursor background agents',
    'cursor ai planning',
    'cursor file discovery',
    'cursor multi-model planning',
  ],
  openGraph: {
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
    
    title: cursorContent.meta.title,
    description: cursorContent.meta.description,
    url: cursorContent.meta.canonical,
    siteName: 'PlanToCode',
    type: 'website',
  },
  alternates: {
    canonical: cursorContent.meta.canonical,
    languages: {
      'en-US': cursorContent.meta.canonical,
      'en': cursorContent.meta.canonical,
    },
  },
};

export default function CursorPlanModePage() {
  return <PlanIntegrationLayout content={cursorContent} location="plan_mode_cursor" />;
}
