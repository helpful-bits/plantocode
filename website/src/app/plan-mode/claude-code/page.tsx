import React from 'react';
import type { Metadata } from 'next';
import { PlanIntegrationLayout } from '@/components/plan/PlanIntegrationLayout';
import { claudeCodeContent } from '@/content/plan-integrations/claude-code';

export const metadata: Metadata = {
  title: claudeCodeContent.meta.title,
  description: claudeCodeContent.meta.description,
  keywords: [
    'claude code plan mode enhancement',
    'claude code planning',
    'claude code multi-model planning',
    'enhance claude code plan mode',
    'claude code file discovery',
    'claude code planning workflow',
    'plantocode claude code',
    'claude code integration',
    'ai coding with claude code',
    'claude code reviewable specs',
  ],
  openGraph: {
    title: claudeCodeContent.meta.title,
    description: claudeCodeContent.meta.description,
    url: claudeCodeContent.meta.canonical,
    siteName: 'PlanToCode',
    type: 'website',
  },
  alternates: {
    canonical: claudeCodeContent.meta.canonical,
  },
};

export default function ClaudeCodePlanModePage() {
  return <PlanIntegrationLayout content={claudeCodeContent} location="plan_mode_claude_code" />;
}
