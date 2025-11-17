import { buildJsonLdHowTo } from './_base';
import type { PlanIntegrationContent } from '@/components/plan/PlanIntegrationLayout';

export const codexContent: PlanIntegrationContent = {
  meta: {
    title: 'Codex CLI Planning - Reviewed Approvals',
    description:
      'See the exact files that will change, review a concrete per-file plan, then run Codex CLI in the approval mode your team allows.',
    canonical: 'https://www.plantocode.com/plan-mode/codex',
  },

  hero: {
    eyebrow: 'Codex CLI × PlanToCode',
    h1: 'Plan first. Execute with the right approvals.',
    subhead:
      'See the exact files that will change, review a concrete per-file plan, then run Codex CLI in the approval mode your team allows.',
    supporting:
      '$5 free credits • Pay-as-you-go • Works with Codex CLI (and other CLIs via the built-in terminal)',
  },

  intro:
    "Plan first. Execute with the right approvals. See the exact files that will change, review a concrete per-file plan, then run Codex CLI in the approval mode your team allows.",

  valueBullets: [
    {
      title: 'Human-in-the-loop control',
      description:
        'You approve the plan before anything runs. Edit steps, exclude files, and lock constraints. Every action is visible and auditable.',
    },
    {
      title: 'Per-file specs with real paths',
      description:
        'Plans are expressed as a list of file edits (add/modify/delete) using your repository paths, so you can see exactly what will be touched.',
    },
    {
      title: 'Intelligent file discovery',
      description:
        'Before prompting, we surface likely-relevant files using pattern groups + relevance scoring. You can stage, review, and prune the list.',
    },
    {
      title: 'Integrated terminal',
      description:
        'Launch Codex (or any CLI) inside PlanToCode. We detect the Codex binary, preserve environment, and keep long jobs stable with health checks and auto-reconnect.',
    },
    {
      title: 'Persistent sessions & logs',
      description:
        'Terminal output and planning sessions are stored locally. Close the app and pick up right where you left off.',
    },
    {
      title: 'Privacy',
      description:
        'Sessions live in a local SQLite database. Before any AI call, PlanToCode shows you the request payload. No silent uploads.',
    },
  ],

  integrationNotes: [
    {
      title: 'Run Codex from the built-in terminal',
      description:
        'Open a terminal in your repo, review the plan, and start Codex. Keep the plan and terminal side-by-side while Codex executes.',
    },
    {
      title: 'Choose the right approval mode',
      description:
        'Auto (default): Codex can read/edit/run inside the working directory without prompting; asks before leaving the workspace or using network. Read-Only: Plan and chat only—no edits or command execution. Full Access: Edits + commands (incl. network) without approval. Use only when policy allows. Configure via /approvals in the Codex UI or CLI flags.',
    },
    {
      title: 'Model note',
      description:
        'Defaults to GPT-5; switch to GPT-5-Codex via /model or --model gpt-5-codex',
    },
    {
      title: 'Windows hint',
      description:
        'Windows users: WSL recommended for best CLI compatibility',
    },
  ],

  quickstart: [
    {
      step: 'Install CLI',
      detail: '',
    },
    {
      step: 'Login and select model (GPT-5 or GPT-5-Codex)',
      detail: '',
    },
    {
      step: 'Paste approved plan',
      detail: '',
    },
    {
      step: 'Pick approval mode',
      detail: '',
    },
  ],

  quickstartHeading: 'Quick start',
  quickstartGlassCard: true,

  learnMore: [
    {
      label: 'Codex CLI',
      href: 'https://developers.openai.com/codex/cli',
    },
    {
      label: 'Approval modes',
      href: 'https://developers.openai.com/codex/cli/features',
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
        'Codex CLI offers three approval modes: Auto (default - workspace freedom with approval outside), Read-Only (requires approval for all actions), and Full Access (no approvals).',
      href: 'https://help.openai.com/en/articles/10274291-codex-cli-approvals',
      source: 'official',
    },
    {
      claim:
        'Windows users should run Codex CLI in WSL2 for correct sandboxing and performance.',
      href: 'https://help.openai.com/en/articles/10274294-codex-cli-installation',
      source: 'official',
    },
    {
      claim:
        'Codex CLI defaults to GPT-5. Users can switch to GPT-5-Codex via the /model command or --model flag.',
      href: 'https://help.openai.com/en/articles/10274290-codex-cli-models',
      source: 'official',
    },
    {
      claim:
        'Approval modes can be configured using the /approvals command or CLI flags.',
      href: 'https://developers.openai.com/codex/cli/features',
      source: 'official',
    },
    {
      claim:
        'Codex CLI supports multiple models and usage patterns.',
      href: 'https://developers.openai.com/codex/cli',
      source: 'official',
    },
    {
      claim:
        'WSL getting started guide is available for Windows users.',
      href: 'https://help.openai.com',
      source: 'official',
    },
  ],

  faq: [
    {
      q: 'Does PlanToCode replace Codex?',
      a: 'No. PlanToCode handles discovery and planning. Codex does the execution.',
    },
    {
      q: 'How do approval modes actually behave?',
      a: 'Auto = free to operate within the working directory; prompts when going outside or using network. Read-Only = no edits/commands. Full Access = no prompts; use with caution per policy.',
    },
    {
      q: 'Which platforms are supported?',
      a: 'PlanToCode: macOS 11+ and Windows 10+. Codex CLI: macOS and Linux officially; on Windows use WSL2.',
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
          'Plan first. Execute with the right approvals. See the exact files that will change, review a concrete per-file plan, then run Codex CLI in the approval mode your team allows.',
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
          'Codex CLI Integration',
          'Approval Mode Support'
        ]
      },
      buildJsonLdHowTo('Use PlanToCode with Codex CLI', [
        {
          step: 'Install PlanToCode',
          detail: 'Download and connect to your repo/workspace.',
        },
        {
          step: 'Discover files',
          detail: 'Run file discovery and confirm the set of impacted files.',
        },
        {
          step: 'Generate the plan',
          detail:
            'Create one or more model drafts, merge them, and edit the per-file spec until it matches your intent.',
        },
        {
          step: 'Run Codex with approvals',
          detail:
            'Open Codex in the integrated terminal. Pick Auto, Read-Only, or Full Access. Execute with confidence.',
        },
      ]),
    ],
  },
};
