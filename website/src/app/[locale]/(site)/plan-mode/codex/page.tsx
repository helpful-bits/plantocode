import type { Metadata } from 'next';
import { PlanIntegrationLayout } from '@/components/plan/PlanIntegrationLayout';
import { codexContent } from '@/content/plan-integrations/codex';
import { cdnUrl } from '@/lib/cdn';
import { locales } from '@/i18n/config';
import type { Locale } from '@/lib/i18n';

export const metadata: Metadata = {
  title: codexContent.meta.title,
  description: codexContent.meta.description,
  keywords: [
    'codex cli planning workflow',
    'openai codex cli architectural planning',
    'codex cli approval modes',
    'codex cli read-only mode',
    'codex planning workflow',
    'gpt-5-codex planning',
    'codex cli file discovery',
    'plantocode codex',
    'codex cli pre-planning',
    'codex cli governance',
    'codex cli multi-model planning',
  ],
  openGraph: {
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
    
    title: codexContent.meta.title,
    description: codexContent.meta.description,
    url: codexContent.meta.canonical,
    siteName: 'PlanToCode',
    type: 'website',
  },
  alternates: {
    canonical: codexContent.meta.canonical,
    languages: {
      'en-US': codexContent.meta.canonical,
      'en': codexContent.meta.canonical,
    },
  },
};

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default function CodexPlanModePage() {
  return <PlanIntegrationLayout content={codexContent} location="plan_mode_codex" />;
}
