import React from 'react';
import type { Metadata } from 'next';
import { PlanIntegrationLayout } from '@/components/plan/PlanIntegrationLayout';
import { codexContent } from '@/content/plan-integrations/codex';

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
    title: codexContent.meta.title,
    description: codexContent.meta.description,
    url: codexContent.meta.canonical,
    siteName: 'PlanToCode',
    type: 'website',
  },
  alternates: {
    canonical: codexContent.meta.canonical,
  },
};

export default function CodexPlanModePage() {
  return <PlanIntegrationLayout content={codexContent} location="plan_mode_codex" />;
}
