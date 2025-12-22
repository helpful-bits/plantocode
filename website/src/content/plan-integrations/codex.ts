import { buildJsonLdHowTo } from './_base';
import type { PlanIntegrationContent } from '@/components/plan/PlanIntegrationLayout';

export const codexContent: PlanIntegrationContent = {
  meta: {
    title: 'Codex CLI Planning - Blueprint-First Execution',
    description:
      'PlanToCode discovers files via 4-stage workflow, generates multi-model plans across GPT-5.2/Claude Sonnet 4.5/Gemini, merges them into XML blueprint, then Codex CLI executes. Stage 5 construction crew for Intelligence-Driven Development.',
    canonical: 'https://www.plantocode.com/plan-mode/codex',
  },

  hero: {
    eyebrow: 'Codex CLI × PlanToCode',
    h1: 'The architect builds blueprints. The construction crew executes.',
    subhead:
      'PlanToCode completes Stages 1-4 (spec capture, file discovery, multi-model planning, human review). Codex CLI is Stage 5: taking the merged XML implementation plan and executing it with approval governance.',
    supporting:
      '$5 free credits • Pay-as-you-go • Intelligence-Driven Development: Blueprint-first execution with monorepo-ready terminal workflows',
  },

  intro:
    "Intelligence-Driven Development follows 5 stages: (1) Specification capture via voice/meetings/text, (2) Targeted file discovery using 4-stage FileFinderWorkflow, (3) Multi-model implementation planning across GPT-5.2/Claude Sonnet 4.5/Gemini, (4) Human review and plan merge with merge instructions, (5) Secure execution. Codex CLI is your Stage 5 construction crew—taking the merged implementation_plan XML blueprint and building it with approval governance.",

  valueBullets: [
    {
      title: 'Blueprint-first Codex runs',
      description:
        'Stage 4 produces a merged implementation_plan XML with file-by-file edits, dependencies, and constraints. Stage 5 feeds this blueprint directly into Codex CLI for execution—no ambiguity, no surprises.',
    },
    {
      title: 'Approval modes as governance',
      description:
        'Auto (workspace freedom, prompts outside scope), Read-Only (plan and chat only), Full Access (unrestricted). Choose the approval mode that matches your risk tolerance and team policy. The blueprint defines scope, Codex enforces boundaries.',
    },
    {
      title: 'File discovery ensures no-surprises changes',
      description:
        'Stage 2 FileFinderWorkflow (root folder selection, regex file filter, AI relevance assessment, extended path finder) identifies every relevant file before planning. Stage 5 execution touches only what the blueprint declares—no stray edits.',
    },
    {
      title: 'Monorepo-ready terminal workflows',
      description:
        'Run Codex CLI inside PlanToCode\'s integrated terminal. Navigate monorepo workspaces, execute build scripts, run migrations—all with persistent logs, health checks, and auto-reconnect. The terminal is Stage 5\'s execution environment.',
    },
    {
      title: 'Multi-model plan synthesis prevents blind spots',
      description:
        'Stage 3 runs implementation_plan prompts across multiple models (GPT-5.2, Claude Sonnet 4.5, Gemini 3 Pro). Stage 4 merges their outputs with your merge instructions. Codex gets a comprehensive blueprint, not a single model\'s narrow perspective.',
    },
    {
      title: 'Skyscraper blueprint analogy',
      description:
        'PlanToCode is the architect (Stages 1-4): capturing requirements, surveying the site (file discovery), drafting plans (multi-model), reviewing blueprints (merge). Codex CLI is the construction crew (Stage 5): building exactly what the blueprint specifies.',
    },
  ],

  integrationNotes: [
    {
      title: 'How to use Codex CLI with a merged implementation plan',
      description:
        'Complete Stages 1-4 in PlanToCode: (1) Capture specification via voice/text using text_improvement and task_refinement prompts. (2) Run FileFinderWorkflow (root folder selection → regex file filter → AI relevance assessment → extended path finder) to discover all relevant files. (3) Generate multiple implementation plans using different models (GPT-5.2, Claude Sonnet 4.5, Gemini 3 Pro) via the implementation_plan prompt. (4) Review plans side-by-side, write merge instructions, run implementation_plan_merge to produce a single XML blueprint.',
    },
    {
      title: 'Stage 5: Feeding the blueprint to Codex CLI',
      description:
        'Open PlanToCode\'s integrated terminal, navigate to your repo root, start Codex CLI. Paste the merged implementation_plan XML into Codex as context. The XML contains file-by-file edits (add/modify/delete), dependencies, rollback instructions, and constraints. Codex treats this as the execution specification—no improvisation, no scope creep.',
    },
    {
      title: 'Approval modes as risk governance',
      description:
        'Auto (default): Codex can read/edit/run inside the working directory without prompting; asks before leaving workspace or using network. Read-Only: Plan and chat only—no edits or command execution. Full Access: Edits + commands (incl. network) without approval. Use only when policy allows. Configure via /approvals in Codex UI or CLI flags. The blueprint defines scope, approval mode enforces boundaries.',
    },
    {
      title: 'Real-world scenario: Database migration with schema changes',
      description:
        'Stage 1: "Add user_preferences table with JSONB column, migrate existing settings from user_settings." Stage 2: FileFinderWorkflow discovers migrations folder, models, API routes, tests. Stage 3: Generate plans with GPT-5.2 and Gemini 3 Pro—each brings a different perspective. Stage 4: Merge with instruction "Prioritize GPT-5.2 rollback strategy, use Gemini data validation." Stage 5: Codex executes migration, updates models, runs tests—all from the merged blueprint.',
    },
    {
      title: 'Monorepo workflows and build orchestration',
      description:
        'PlanToCode terminal supports WSL, persistent sessions, health checks. Run Codex in backend/, then switch to frontend/. The merged plan declares cross-package dependencies—Codex follows them. Terminal logs every step. If Codex crashes, terminal auto-reconnects; resume from last checkpoint.',
    },
    {
      title: 'Model selection and Windows compatibility',
      description:
        'Codex CLI defaults to GPT-5.2; switch to GPT-5.2-Codex via /model or --model gpt-5-codex. Windows users: WSL recommended for best CLI compatibility. PlanToCode detects WSL environments and preserves paths across Windows/Linux boundaries.',
    },
  ],

  quickstart: [
    {
      step: 'Stage 1-2: Capture spec and discover files',
      detail: 'Use text_improvement/task_refinement prompts to clarify "Add rate limiting to API endpoints." Run FileFinderWorkflow to discover routes/, middleware/, tests/, docs/.',
    },
    {
      step: 'Stage 3: Generate multi-model plans',
      detail: `Run implementation_plan prompt with GPT-5.2, Claude Sonnet 4.5, and Gemini 3 Pro. Each model brings a different perspective—review each plan's approach to middleware placement, config, tests.`,
    },
    {
      step: 'Stage 4: Merge with human guidance',
      detail: 'Write merge instructions: "Use GPT-5.2 middleware architecture, Gemini test coverage, Claude Sonnet 4.5 config approach." Run implementation_plan_merge. Review merged XML blueprint.',
    },
    {
      step: 'Stage 5: Execute in Codex with approvals',
      detail: 'Open PlanToCode terminal, start Codex CLI, paste merged XML. Choose Auto mode (workspace-only edits). Codex reads blueprint, executes file-by-file, logs progress. Review terminal output, verify tests pass.',
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
        'Codex CLI defaults to GPT-5.2. Users can switch to GPT-5.2-Codex via the /model command or --model flag.',
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
