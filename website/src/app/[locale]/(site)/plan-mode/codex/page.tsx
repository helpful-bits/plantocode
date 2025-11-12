import type { Metadata } from 'next';
import { PlanIntegrationLayout } from '@/components/plan/PlanIntegrationLayout';
import { codexContent } from '@/content/plan-integrations/codex';
import { cdnUrl } from '@/lib/cdn';
import { locales } from '@/i18n/config';
import type { Locale } from '@/lib/i18n';
import { generatePageMetadata } from '@/content/metadata';

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;

  return generatePageMetadata({
    locale,
    slug: '/plan-mode/codex',
    title: codexContent.meta.title,
    description: codexContent.meta.description,
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

export default function CodexPlanModePage() {
  return <PlanIntegrationLayout content={codexContent} location="plan_mode_codex" />;
}
