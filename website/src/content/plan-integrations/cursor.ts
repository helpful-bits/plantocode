import type { PlanIntegrationContent } from '@/components/plan/PlanIntegrationLayout';
import { baseValueBullets, buildJsonLdHowTo } from './_base';

export const cursorContent: PlanIntegrationContent = {
  meta: {
    title: 'Cursor Agent Planning - Reviewed Specs',
    description:
      'Pre-plan for Cursor Composer and Agent with file discovery and multi-model synthesis. Generate specs, review, then execute with confidence.',
    canonical: 'https://www.plantocode.com/plan-mode/cursor',
  },

  hero: {
    eyebrow: 'Cursor • Pre-planning for Composer & Agent',
    h1: 'Plan first. Run Cursor Agent or Background Agents with a reviewed spec.',
    subhead:
      'Discover files, generate and merge multi-model plans, then execute in Cursor Agent Terminal or Background Agents with full architectural context.',
    supporting:
      'Cursor Agent mode and Background Agents plan internally during execution. PlanToCode adds pre-planning with file discovery, multi-model insights, and reviewable specs before Agent runs.',
  },

  intro:
    "This page describes how PlanToCode's architectural pre-planning integrates with Cursor Agent Terminal and Background Agents, with all claims verified against Cursor's official documentation.",

  valueBullets: [...baseValueBullets],

  integrationNotes: [
    {
      title: 'Cursor Agent Terminal runs commands within your IDE',
      description:
        'Cursor Agent Terminal executes terminal commands and CLI tools directly within the Cursor IDE. It provides an integrated environment for running tasks without leaving your development workspace.',
    },
    {
      title: 'Cursor Background Agents operate in isolated VM environments',
      description:
        'Cursor Background Agents run tasks in isolated virtual machine environments, providing separation from your local system. These agents can execute longer-running operations independently.',
    },
    {
      title: 'PlanToCode provides pre-execution architectural context',
      description:
        'File discovery surfaces the full architectural scope of changes before execution begins. Multi-model plan synthesis compares approaches from different AI models. Merged specs provide clear, reviewable implementation plans that Cursor Agent can follow.',
    },
    {
      title: 'Persistent terminal sessions with cross-platform support',
      description:
        'PlanToCode terminal features include persistent sessions that survive app restarts, full WSL support on Windows for Linux-based workflows, and health monitoring to track long-running operations. All terminal output is stored locally with full session history.',
    },
  ],

  quickstart: [
    {
      step: 'Install PlanToCode on the same machine as Cursor',
      detail: 'Download PlanToCode for macOS, Windows, or WSL and connect it to your repository.',
    },
    {
      step: 'Run file discovery for your task',
      detail:
        'Generate a focused set of files and dependencies that Cursor Agent will need to consider.',
    },
    {
      step: 'Generate and merge plans',
      detail:
        'Create implementation plans from multiple AI models and merge them into a comprehensive, Cursor-ready specification.',
    },
    {
      step: 'Execute with confidence',
      detail:
        "Provide the plan to Cursor Agent Terminal or Background Agents, or run it in PlanToCode's terminal with approvals and full logging.",
    },
  ],

  verifiedFacts: [
    {
      claim: 'Cursor Agent Terminal provides AI-powered command execution directly in the IDE',
      href: 'https://docs.cursor.com/agent',
      source: 'official',
    },
    {
      claim: 'Background Agents run tasks in isolated virtual machine environments',
      href: 'https://docs.cursor.com/agent/background-agents',
      source: 'official',
    },
    {
      claim: 'Cursor provides Composer mode for AI-assisted code generation',
      href: 'https://docs.cursor.com/get-started/composer',
      source: 'official',
    },
    {
      claim: 'Cursor indexes your codebase for context-aware suggestions',
      href: 'https://docs.cursor.com/get-started',
      source: 'official',
    },
    {
      claim: 'Cursor CLI enables terminal-based interactions with AI features',
      href: 'https://docs.cursor.com/cli',
      source: 'official',
    },
  ],

  faq: [
    {
      q: 'Does Cursor have a plan mode feature?',
      a: 'No, Cursor has Composer and Agent mode which plan internally during execution. They do not offer a separate user-controlled planning phase. PlanToCode adds that pre-planning layer with file discovery, multi-model synthesis, and reviewable architectural context before Cursor Agent executes.',
    },
    {
      q: 'How do I use PlanToCode plans with Cursor?',
      a: "After creating a merged plan in PlanToCode, you can either paste the context and instructions into Cursor Composer or Agent mode for execution, or execute directly in PlanToCode's terminal with full logging and approval workflows.",
    },
    {
      q: 'Does this work on Windows and WSL?',
      a: "Yes. PlanToCode fully supports Windows 10+, WSL (Windows Subsystem for Linux), and macOS 11.0+. The integrated terminal provides persistent logging and approvals that complement Cursor's terminal integration.",
    },
  ],

  jsonLd: {
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: 'PlanToCode',
        applicationCategory: 'DeveloperApplication',
        operatingSystem: ['macOS 11.0+', 'Windows 10+'],
        url: 'https://www.plantocode.com/plan-mode/cursor',
        description:
          'Pre-planning for Cursor Composer and Agent mode with file discovery and multi-model synthesis.',
        offers: {
          '@type': 'Offer',
          price: 0,
          priceCurrency: 'USD',
        },
      },
      buildJsonLdHowTo('Use PlanToCode with Cursor Agent and Composer', [
        {
          step: 'Install PlanToCode on the same machine as Cursor',
          detail: 'Download PlanToCode for macOS, Windows, or WSL and connect it to your repository.',
        },
        {
          step: 'Run file discovery for your task',
          detail:
            'Generate a focused set of files and dependencies that Cursor Agent will need to consider.',
        },
        {
          step: 'Generate and merge plans',
          detail:
            'Create implementation plans from multiple AI models and merge them into a comprehensive, Cursor-ready specification.',
        },
        {
          step: 'Execute with confidence',
          detail:
            "Provide the plan to Cursor Agent Terminal or Background Agents, or run it in PlanToCode's terminal with approvals and full logging.",
        },
      ]),
    ],
  },
};
