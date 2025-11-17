import { baseValueBullets, buildJsonLdHowTo } from './_base';
import type { PlanIntegrationContent } from '@/components/plan/PlanIntegrationLayout';

export const claudeCodeContent: PlanIntegrationContent = {
  meta: {
    title: 'Claude Code Plan Mode - Reviewable Specs',
    description:
      "Enhance Claude Code Plan Mode with file discovery, multi-model synthesis, and reviewable specs. Enterprise governance for AI coding.",
    canonical: 'https://www.plantocode.com/plan-mode/claude-code',
  },

  hero: {
    eyebrow: 'Claude Code • Enhance native Plan Mode',
    h1: "Plan with file-by-file specs. Use Claude Code's Plan Mode with confidence.",
    subhead:
      "Generate comprehensive implementation plans with file discovery and multi-model synthesis, then feed them into Claude Code's Plan Mode for safe execution.",
    supporting:
      'Claude Code has Plan Mode built-in. PlanToCode enhances it by adding file discovery, multi-model planning, and reviewable specs before you use Plan Mode.',
  },

  intro:
    "This page explains how PlanToCode's file-by-file implementation specs work with Claude Code's Plan Mode, with all technical details verified against Anthropic's official documentation.",

  valueBullets: [...baseValueBullets],

  integrationNotes: [
    {
      title: "Claude Code's Plan Mode",
      description:
        'Claude Code includes Plan Mode that allows users to review proposed changes before execution. Activate it to see what Claude intends to do and approve or modify the plan.',
    },
    {
      title: 'PlanToCode adds comprehensive context',
      description:
        'File discovery identifies all relevant files and dependencies. Multi-model synthesis compares different AI perspectives. Merge instructions create comprehensive specs from multiple model outputs.',
    },
    {
      title: 'How to use together',
      description:
        'Generate plans in PlanToCode with file discovery and multi-model synthesis. Provide the merged plan and discovered files to Claude Code Plan Mode for review and execution.',
    },
    {
      title: 'Review before execution',
      description:
        'PlanToCode generates detailed file-by-file specs. Claude Code Plan Mode lets you review and approve changes. This two-stage workflow ensures enterprise-grade governance and visibility.',
    },
    {
      title: 'Plan Mode specifics',
      description:
        'Toggle Plan Mode with Shift+Tab (read-only analysis). Start in Plan Mode via --permission-mode plan.',
    },
  ],

  quickstart: [
    {
      step: 'Install PlanToCode alongside Claude Code',
      detail:
        'Download PlanToCode and connect it to the same repository you use with Claude Code CLI.',
    },
    {
      step: 'Discover relevant files',
      detail:
        'Use file discovery to build a comprehensive list of files and dependencies for your task.',
    },
    {
      step: 'Generate and merge plans',
      detail:
        'Create plans from multiple AI models and merge them with custom instructions for a complete architectural view.',
    },
    {
      step: 'Use with Claude Code Plan Mode',
      detail:
        'Provide the merged plan and discovered files to Claude Code. Use Plan Mode to review the changes before execution.',
    },
  ],

  learnMore: [
    {
      label: 'Plan Mode guide',
      href: 'https://docs.anthropic.com/en/docs/claude-code/tutorials',
    },
    {
      label: 'Permission modes',
      href: 'https://docs.anthropic.com/fr/docs/claude-code/sdk/sdk-permissions',
    },
  ],

  verifiedFacts: [
    {
      claim: 'Claude Code is an official AI coding CLI from Anthropic with built-in planning capabilities.',
      href: 'https://docs.anthropic.com/claude/docs/claude-code',
      source: 'official',
    },
    {
      claim: 'Claude Code supports review workflows where users can see and approve proposed changes before execution.',
      href: 'https://docs.anthropic.com/claude/docs/claude-code',
      source: 'official',
    },
    {
      claim: 'Claude Code provides settings for controlling AI behavior and approval workflows.',
      href: 'https://docs.anthropic.com/claude/docs/claude-code',
      source: 'official',
    },
    {
      claim: 'Claude Code integrates with local development environments and respects user permissions.',
      href: 'https://docs.anthropic.com/claude/docs/claude-code',
      source: 'official',
    },
    {
      claim: 'Plan Mode tutorial',
      href: 'https://docs.anthropic.com/en/docs/claude-code/tutorials',
      source: 'official',
    },
    {
      claim: 'SDK permissions note',
      href: 'https://docs.anthropic.com/fr/docs/claude-code/sdk/sdk-permissions',
      source: 'official',
    },
  ],

  faq: [
    {
      q: "Does PlanToCode replace Claude Code's Plan Mode?",
      a: "No, it enhances Plan Mode with better context. PlanToCode adds file discovery to identify all relevant files, multi-model synthesis to compare different AI perspectives, and merge instructions to create comprehensive specs. You then provide this context to Claude Code's Plan Mode for review and execution.",
    },
    {
      q: 'How do I use the merged plan with Claude Code?',
      a: 'After generating and merging plans in PlanToCode, feed the context and plan to Claude Code. Use Plan Mode to review the proposed changes, modify if needed, and approve for execution. The file discovery output helps ensure Claude Code has complete context.',
    },
    {
      q: 'What operating systems are supported?',
      a: 'PlanToCode works on macOS 11+ and Windows 10+. It integrates seamlessly with Claude Code CLI on both platforms, with full audit trail support for enterprise governance requirements.',
    },
  ],

  jsonLd: {
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: 'PlanToCode',
        applicationCategory: 'DeveloperApplication',
        operatingSystem: ['macOS 11.0+', 'Windows 10+'],
        url: 'https://www.plantocode.com/plan-mode/claude-code',
        description:
          'Enhance Claude Code Plan Mode with file discovery and multi-model synthesis.',
        softwareVersion: '1.0.23',
        downloadUrl: 'https://www.plantocode.com/downloads',
        offers: {
          '@type': 'Offer',
          price: 0,
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
        },
        creator: {
          '@type': 'Organization',
          name: 'PlanToCode',
          url: 'https://www.plantocode.com'
        },
        featureList: [
          'File Discovery',
          'Multi-Model Planning',
          'Claude Code Integration',
          'Plan Review Workflow'
        ]
      },
      buildJsonLdHowTo('Use PlanToCode with Claude Code Plan Mode', [
        {
          step: 'Install PlanToCode alongside Claude Code',
          detail:
            'Download PlanToCode and connect it to the same repository you use with Claude Code CLI.',
        },
        {
          step: 'Discover relevant files',
          detail:
            'Use file discovery to build a comprehensive list of files and dependencies for your task.',
        },
        {
          step: 'Generate and merge plans',
          detail:
            'Create plans from multiple AI models and merge them with custom instructions for a complete architectural view.',
        },
        {
          step: 'Use with Claude Code Plan Mode',
          detail:
            'Provide the merged plan and discovered files to Claude Code. Use Plan Mode to review the changes before execution.',
        },
      ]),
    ],
  },
};
