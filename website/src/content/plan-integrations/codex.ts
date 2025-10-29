import { baseValueBullets, buildJsonLdHowTo } from './_base';
import type { PlanIntegrationContent } from '@/components/plan/PlanIntegrationLayout';

export const codexContent: PlanIntegrationContent = {
  meta: {
    title: 'Plan with Codex — Reviewable Specs and Approvals | PlanToCode',
    description:
      'Plan software changes before running Codex CLI. Generate file-by-file specs with exact paths, review with your team, then execute with Codex approval modes for governance.',
    canonical: 'https://www.plantocode.com/plan-mode/codex',
  },

  hero: {
    eyebrow: 'Codex CLI • Pre-planning before execution',
    h1: 'Plan first. Run Codex with clear approvals and full visibility.',
    subhead:
      'See impacted files, generate and merge multi-model plans, then execute Codex CLI with approval modes that match your governance needs.',
    supporting:
      'PlanToCode provides the planning layer with file discovery and multi-model synthesis. You review file-by-file specs, then run Codex with Auto (default), Read-Only, or Full Access approval modes.',
  },

  intro:
    "This page shows how PlanToCode's reviewable, file-by-file implementation specs integrate with OpenAI Codex CLI, with all claims verified against official documentation.",

  valueBullets: [...baseValueBullets],

  integrationNotes: [
    {
      title: 'Run Codex CLI from integrated terminal',
      description:
        "Launch Codex CLI directly in PlanToCode's built-in terminal. Access your file discovery results and implementation plans while Codex runs.",
    },
    {
      title: 'Codex approval modes',
      description:
        'Codex CLI offers three approval modes: Auto (default - workspace freedom with approval required outside workspace), Read-Only (requires approval for all file actions), and Full Access (no approvals). Choose the mode that matches your governance needs.',
    },
    {
      title: 'Windows and WSL support',
      description:
        "Windows users run Codex CLI in WSL. PlanToCode's integrated terminal provides persistent logging and session management across WSL sessions.",
    },
    {
      title: 'File-by-file specifications',
      description:
        'PlanToCode generates file-by-file implementation plans with exact repository paths. Review these specs before running Codex CLI to ensure all impacted files are considered.',
    },
  ],

  quickstart: [
    {
      step: 'Install PlanToCode',
      detail: 'Download the desktop app and connect it to your development workspace.',
    },
    {
      step: 'Discover relevant files',
      detail:
        'Run file discovery to identify which files Codex will need to consider for your task.',
    },
    {
      step: 'Generate and merge multi-model plans',
      detail:
        'Create implementation plans from multiple AI models and merge them with custom instructions into a comprehensive specification.',
    },
    {
      step: 'Run Codex with approvals',
      detail:
        "Open Codex CLI in PlanToCode's integrated terminal. Choose your approval mode (Auto, Read-Only, or Full Access) and execute the plan.",
    },
  ],

  verifiedFacts: [
    {
      claim: "Codex CLI is OpenAI's official command-line tool for AI-assisted coding.",
      href: 'https://openai.com/index/codex-cli/',
      source: 'official',
    },
    {
      claim:
        'Codex CLI supports three approval modes controlled via the /approvals command: Auto (default), Read-Only, and Full Access.',
      href: 'https://help.openai.com/en/articles/10274291-codex-cli-approvals',
      source: 'official',
    },
    {
      claim:
        'Windows users can run Codex CLI in WSL (Windows Subsystem for Linux) for full compatibility.',
      href: 'https://help.openai.com/en/articles/10274294-codex-cli-installation',
      source: 'official',
    },
    {
      claim: 'Codex CLI uses GPT-5-Codex as its default model for code generation.',
      href: 'https://help.openai.com/en/articles/10274290-codex-cli-models',
      source: 'official',
    },
    {
      claim:
        'Codex CLI traverses workspace files automatically to build context for code generation tasks.',
      href: 'https://help.openai.com/en/articles/10274293-codex-cli-workspace',
      source: 'official',
    },
  ],

  faq: [
    {
      q: 'Does PlanToCode replace Codex CLI?',
      a: 'No. PlanToCode adds a pre-planning layer with file discovery, multi-model plan synthesis, and reviewable specifications. You still use Codex CLI for execution, but now with better context and clear approval modes.',
    },
    {
      q: 'How do Codex approval modes work?',
      a: 'Codex CLI has three approval modes: Auto (default - allows workspace changes without approval, requires approval outside), Read-Only (requires approval for all file actions), and Full Access (no approvals needed). Use the /approvals command to switch modes.',
    },
    {
      q: 'Which platforms are supported?',
      a: "PlanToCode runs on macOS 11+ and Windows 10+. Windows users can run Codex CLI in WSL, and PlanToCode's integrated terminal provides persistent logging across WSL sessions.",
    },
  ],

  jsonLd: {
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: 'PlanToCode',
        applicationCategory: 'DeveloperApplication',
        operatingSystem: ['macOS 11.0+', 'Windows 10+'],
        url: 'https://www.plantocode.com/plan-mode/codex',
        description:
          'Pre-planning workflow for OpenAI Codex CLI with file discovery and approval modes.',
        offers: {
          '@type': 'Offer',
          price: 0,
          priceCurrency: 'USD',
        },
      },
      buildJsonLdHowTo('Use PlanToCode planning workflow with OpenAI Codex CLI', [
        {
          step: 'Install PlanToCode',
          detail: 'Download the desktop app and connect it to your development workspace.',
        },
        {
          step: 'Discover relevant files',
          detail:
            'Run file discovery to identify which files Codex will need to consider for your task.',
        },
        {
          step: 'Generate and merge multi-model plans',
          detail:
            'Create implementation plans from multiple AI models and merge them with custom instructions into a comprehensive specification.',
        },
        {
          step: 'Run Codex with approvals',
          detail:
            "Open Codex CLI in PlanToCode's integrated terminal. Choose your approval mode (Auto, Read-Only, or Full Access) and execute the plan.",
        },
      ]),
    ],
  },
};
