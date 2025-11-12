import type { Metadata } from 'next';
import { PlanIntegrationLayout } from '@/components/plan/PlanIntegrationLayout';
import { cursorContent } from '@/content/plan-integrations/cursor';
import { cdnUrl } from '@/lib/cdn';
import { locales } from '@/i18n/config';
import type { Locale } from '@/lib/i18n';
import { generatePageMetadata } from '@/content/metadata';

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;

  return generatePageMetadata({
    locale,
    slug: '/plan-mode/cursor',
    title: cursorContent.meta.title,
    description: cursorContent.meta.description,
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
  });
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default function CursorPlanModePage() {
  return <PlanIntegrationLayout content={cursorContent} location="plan_mode_cursor" />;
}
