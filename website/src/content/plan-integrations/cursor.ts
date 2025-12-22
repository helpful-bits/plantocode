import type { PlanIntegrationContent } from '@/components/plan/PlanIntegrationLayout';
import { buildJsonLdHowTo } from './_base';

export const cursorContent: PlanIntegrationContent = {
  meta: {
    title: 'Cursor Agent Planning - Fix Agent Failures',
    description:
      'Stop Cursor Agent duplicate files, wrong paths, and scope creep. PlanToCode provides Stages 1-4 (spec capture, 4-stage FileFinderWorkflow, multi-model planning, merge review) before Cursor executes. Intelligence-Driven Development for reliable Cursor Agent runs.',
    canonical: 'https://www.plantocode.com/plan-mode/cursor',
  },

  hero: {
    eyebrow: 'Cursor • Fix Agent Failures with Pre-Planning',
    h1: 'Stop duplicate files, wrong paths, and scope creep. Plan first, execute safely.',
    subhead:
      'Cursor Agent is the execution environment. PlanToCode is the explicit reviewable plan that prevents common Agent failures: duplicate files, wrong imports, missing dependencies, scope creep. Intelligence-Driven Development in 5 stages.',
    supporting:
      'Stages 1-4: Spec capture (voice/text) → FileFinderWorkflow (4 stages) → Multi-model planning (GPT-5.2/Claude Sonnet 4.5/Gemini) → Human review and merge. Stage 5: Cursor Agent executes the blueprint. No surprises.',
  },

  intro:
    "Cursor Agent Terminal and Background Agents plan internally during execution—but without pre-discovery, multi-model synthesis, or human review, they fail predictably: duplicate files, wrong paths, missing imports, scope creep. PlanToCode fixes this with Intelligence-Driven Development: (1) Specification capture via text_improvement/task_refinement, (2) Targeted file discovery via 4-stage FileFinderWorkflow, (3) Multi-model implementation planning across GPT-5.2/Claude Sonnet 4.5/Gemini, (4) Human review and plan merge, (5) Cursor Agent executes the merged blueprint. All claims verified against Cursor's official documentation.",

  valueBullets: [
    {
      title: 'Stop duplicate files and wrong paths',
      description:
        'Common Cursor Agent failure: creates components/Button.tsx when src/components/Button.tsx exists. Stage 2 FileFinderWorkflow (root folder selection, regex file filter, AI relevance assessment, extended path finder) discovers exact paths before planning. Stage 4 review validates every path. Stage 5 Cursor Agent gets pre-resolved paths—no duplicates.',
    },
    {
      title: 'Stop wrong imports and missing dependencies',
      description:
        'Cursor Agent improvises imports during execution, misses transitive dependencies. Stage 3 multi-model planning with GPT-5.2 and Gemini surfaces different dependency graphs. Stage 4 merge consolidates them. Cursor executes with complete import map—no runtime failures.',
    },
    {
      title: 'Large refactor scenario: 40 files, multi-model safety',
      description:
        'Refactor auth system across 40 files (routes, middleware, components, tests, docs). Stage 2 FileFinderWorkflow discovers all 40. Stage 3 generates plans from GPT-5.2 (backward-compatible) and Gemini (new patterns). Stage 4 merge prioritizes GPT-5.2 rollback, Gemini test coverage. Stage 5 Cursor Agent executes with full context—no stray edits.',
    },
    {
      title: 'Human review prevents scope creep',
      description:
        'Cursor Agent often expands scope mid-execution (rewrites unrelated code, adds features). Stage 4 human review locks scope: approve/reject each file edit, constrain boundaries. Cursor sees only approved actions. The skyscraper blueprint defines every floor, wall, door—no improvisation.',
    },
    {
      title: 'Multi-model blind spot prevention',
      description:
        'Single-model Cursor runs miss edge cases (GPT-5.2 misses new patterns, Gemini misses legacy constraints). Stage 3 runs implementation_plan across 3+ models. Stage 4 merge surfaces conflicts, you choose. Cursor executes the synthesized plan—comprehensive, not narrow.',
    },
    {
      title: 'Architect vs construction crew analogy',
      description:
        'PlanToCode is the architect (Stages 1-4): capturing requirements, surveying site (file discovery), drafting blueprints (multi-model), reviewing plans (merge). Cursor Agent is the construction crew (Stage 5): building exactly what the blueprint specifies. No architect = chaotic construction.',
    },
  ],

  integrationNotes: [
    {
      title: 'Large refactor scenario: 40-file auth system overhaul',
      description:
        'Without PlanToCode: Cursor Agent rewrites src/auth/login.ts, misses lib/auth/login.ts (duplicate), breaks imports in 12 downstream files, adds unplanned OAuth flow (scope creep), fails tests. With PlanToCode: Stage 2 FileFinderWorkflow discovers both login.ts files, all 40 affected files, transitive dependencies. Stage 3 generates plans from GPT-5.2 and Gemini—each with a different approach. Stage 4 review rejects Gemini OAuth suggestion (out of scope), merges remaining. Stage 5 Cursor Agent executes merged blueprint—no duplicates, no scope creep, tests pass.',
    },
    {
      title: 'How Stage 2 path validation prevents duplicate files',
      description:
        `FileFinderWorkflow Stage 2a (root folder selection): Identifies src/ vs lib/ vs packages/. Stage 2b (regex file filter): Matches **/*auth*.ts, **/*login*.ts. Stage 2c (AI relevance assessment): Scores each file's relevance to "refactor auth system." Stage 2d (extended path finder): Discovers transitive imports (components using auth, tests, docs). Human review confirms all paths. Cursor Agent sees validated path list—creates no duplicates.`,
    },
    {
      title: 'How Stage 4 merge resolves import conflicts',
      description:
        'GPT-5.2 plan: Import { auth } from "@/lib/auth" (absolute). Gemini plan: Import { auth } from "../lib/auth" (relative). Stage 4 merge instruction: "Use absolute imports per project convention." Merged blueprint specifies @/lib/auth everywhere. Cursor Agent follows merged imports—no mismatches, no runtime errors.',
    },
    {
      title: 'Cursor Agent Terminal vs Background Agents execution',
      description:
        'Agent Terminal: Executes within Cursor IDE, inherits workspace context, suitable for interactive tasks. Background Agents: Isolated ubuntu-based VMs, configurable via environment.json, suitable for long-running builds/migrations. Both consume the same PlanToCode merged blueprint (Stages 1-4 output). Choose execution environment based on task duration and isolation needs.',
    },
    {
      title: 'Pre-resolved imports and dependency graph',
      description:
        'Stage 3 multi-model planning: GPT-5.2 identifies direct imports (auth → user → db), Gemini identifies transitive imports (auth → session → cache → redis). Stage 4 merge consolidates full dependency graph. Merged blueprint includes import statements, dependency order, circular dependency warnings. Cursor Agent executes in correct order—no missing imports, no circular failures.',
    },
    {
      title: 'PlanToCode + Cursor workflow: From voice to execution',
      description:
        'Stage 1: Record voice note "Refactor auth to support SSO." Use text_improvement prompt to clarify, task_refinement to break down. Stage 2: Run FileFinderWorkflow, discover 40 files. Stage 3: Generate GPT-5.2 plan (safe), Gemini plan (fast). Stage 4: Review side-by-side, merge with instructions. Stage 5: Copy merged XML to Cursor Agent, execute. PlanToCode terminal logs progress, health checks detect failures, auto-reconnect if Cursor crashes.',
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

  learnMore: [
    {
      label: 'Agent Terminal',
      href: 'https://docs.cursor.com/en/agent/terminal',
    },
    {
      label: 'Pricing',
      href: 'https://cursor.com/pricing',
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
    {
      claim: 'Cursor Agent Terminal natively executes commands in the IDE',
      href: 'https://docs.cursor.com/en/agent/terminal',
      source: 'official',
    },
    {
      claim: 'Background Agents run on ubuntu-based machines',
      href: 'https://docs.cursor.com/en/background-agents',
      source: 'official',
    },
    {
      claim: 'Cursor provides pricing tiers for different usage levels',
      href: 'https://cursor.com/pricing',
      source: 'official',
    },
  ],

  faq: [
    {
      q: 'Is PlanToCode an alternative to Cursor?',
      a: 'No. PlanToCode is a planning layer (Stages 1-4), not an execution alternative. Cursor Agent is Stage 5 execution. Think architect vs construction crew: PlanToCode designs the skyscraper blueprint (spec capture, file discovery, multi-model planning, human review). Cursor Agent builds it. You need both. Without PlanToCode, Cursor Agent improvises—duplicate files, wrong paths, scope creep. With PlanToCode, Cursor executes a validated blueprint.',
    },
    {
      q: 'Does Cursor have a plan mode feature?',
      a: 'No, Cursor has Composer and Agent mode which plan internally during execution—but without pre-discovery or multi-model synthesis. They improvise based on immediate context, leading to predictable failures (duplicate files, missing imports). PlanToCode adds Stages 1-4 (spec capture, FileFinderWorkflow, multi-model planning, merge review) before Cursor Agent (Stage 5) executes. Complementary, not redundant.',
    },
    {
      q: 'How do I use PlanToCode plans with Cursor Agent?',
      a: "Complete Stages 1-4 in PlanToCode: (1) Capture spec via text_improvement/task_refinement. (2) Run FileFinderWorkflow (4 stages: root selection, regex filter, AI relevance, extended path finder). (3) Generate plans from GPT-5.2, Gemini, and Claude Sonnet 4.5—each brings a different perspective. (4) Review side-by-side, write merge instructions, run implementation_plan_merge. Copy merged XML blueprint into Cursor Agent (via Composer or Agent Terminal). Cursor executes the blueprint. Alternatively, execute in PlanToCode's terminal with full logging.",
    },
    {
      q: 'What are the most common Cursor Agent failures PlanToCode prevents?',
      a: 'Duplicate files (creates src/Button.tsx when components/Button.tsx exists)—Stage 2 path validation fixes this. Wrong imports (absolute vs relative, missing dependencies)—Stage 3 multi-model planning + Stage 4 merge resolves this. Scope creep (adds unplanned features mid-execution)—Stage 4 human review locks scope. Missing transitive dependencies—Stage 2d extended path finder discovers them. All prevented by Stages 1-4 pre-planning.',
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
          'Cursor Integration',
          'Composer Pre-Planning'
        ]
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
