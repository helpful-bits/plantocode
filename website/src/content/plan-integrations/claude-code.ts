import { buildJsonLdHowTo } from './_base';
import type { PlanIntegrationContent } from '@/components/plan/PlanIntegrationLayout';

export const claudeCodeContent: PlanIntegrationContent = {
  meta: {
    title: 'Claude Code Plan Mode - Repeatable Multi-Model Planning',
    description:
      "Claude Code has Plan Mode built-in. PlanToCode adds repeatable multi-model planning: 4-stage FileFinderWorkflow discovers files, implementation_plan runs across GPT-5.2/Claude Sonnet 4.5/Gemini, implementation_plan_merge consolidates. Feed comprehensive blueprints into Claude Code Plan Mode permissions.",
    canonical: 'https://www.plantocode.com/plan-mode/claude-code',
  },

  hero: {
    eyebrow: 'Claude Code • Repeatable Multi-Model Planning',
    h1: "Claude Code has Plan Mode. PlanToCode adds the architect's blueprint.",
    subhead:
      "Claude Code Plan Mode is Stage 5 execution with permission controls. PlanToCode provides Stages 1-4: spec capture (voice/text), 4-stage FileFinderWorkflow, multi-model implementation_plan across GPT-5.2/Claude Sonnet 4.5/Gemini, human review and merge. Feed comprehensive blueprints into Plan Mode.",
    supporting:
      'Intelligence-Driven Development: PlanToCode is the architect (repeatable multi-model planning). Claude Code Plan Mode is the construction crew (permission-controlled execution). Combine for enterprise-grade governance.',
  },

  intro:
    "Claude Code Plan Mode (Shift+Tab, read-only analysis; --permission-mode plan for execution) provides permission-controlled execution. But it lacks repeatable pre-planning: no multi-model synthesis, no human-guided merge, no systematic file discovery. PlanToCode fills this gap with Intelligence-Driven Development Stages 1-4: (1) Specification capture via text_improvement/task_refinement, (2) 4-stage FileFinderWorkflow (root selection, regex filter, AI relevance, extended path finder), (3) Multi-model implementation_plan across GPT-5.2/Claude Sonnet 4.5/Gemini, (4) Human review and implementation_plan_merge. Stage 5: Feed merged blueprint into Claude Code Plan Mode. All technical details verified against Anthropic's official documentation.",

  valueBullets: [
    {
      title: 'Architect vs implementor: Complementary roles',
      description:
        'PlanToCode is the architect (Stages 1-4): capturing requirements from voice/meetings, surveying the codebase (FileFinderWorkflow), drafting blueprints from multiple perspectives (multi-model planning), reviewing and consolidating (merge). Claude Code Plan Mode is the implementor (Stage 5): executing the blueprint with permission controls. Both needed for enterprise governance.',
    },
    {
      title: 'No brittle rules—infers patterns from code',
      description:
        'Stage 2c AI relevance assessment and Stage 2d extended path finder analyze your codebase to infer patterns (import conventions, folder structure, test co-location). Stage 3 implementation_plan adapts to your patterns—no manual config, no brittle linting rules. Claude Code Plan Mode executes within these inferred constraints.',
    },
    {
      title: 'Repeatable multi-model planning process',
      description:
        'Stage 3: Run implementation_plan with GPT-5.2, Claude Sonnet 4.5, and Gemini 3 Pro. Each model brings a different perspective. Stage 4: Review side-by-side, identify conflicts (one suggests class components, another uses hooks). Write merge instructions ("Prefer hooks, keep error handling from the other plan"). Run implementation_plan_merge. Repeatable process, reproducible results.',
    },
    {
      title: 'Plan Mode permissions + pre-planned scope',
      description:
        'Claude Code Plan Mode: Shift+Tab for read-only analysis, --permission-mode plan for execution with approvals. PlanToCode Stages 1-4 define scope before Plan Mode runs. Stage 4 human review locks file list, edit types (add/modify/delete), dependencies. Plan Mode executes within pre-approved scope—no permission escalation, no scope creep.',
    },
    {
      title: 'Narrative: Generate → Copy → Execute',
      description:
        'Complete workflow: Stage 1 (capture "Add caching layer to API" via text_improvement). Stage 2 (FileFinderWorkflow discovers routes/, middleware/, redis config). Stage 3 (generate GPT-5.2 plan: Redis client setup; Gemini plan: Redis cluster + fallback). Stage 4 (merge with "Use GPT-5.2 Redis client, add Gemini fallback"). Copy merged XML. Open Claude Code, paste blueprint, enable Plan Mode (Shift+Tab), review proposed changes, approve. Claude Code executes. PlanToCode terminal logs output.',
    },
    {
      title: 'Skyscraper blueprint analogy',
      description:
        'PlanToCode is the architect: surveys site (file discovery), drafts blueprints (multi-model), reviews structural integrity (merge), stamps approval (Stage 4 review). Claude Code Plan Mode is the construction crew: follows blueprint, requests permission before each floor (Plan Mode approvals), builds exactly as specified. No architect = improvised construction = brittle foundation.',
    },
  ],

  integrationNotes: [
    {
      title: 'Stages 1-4: PlanToCode repeatable planning workflow',
      description:
        'Stage 1: Capture specification from voice notes, meeting transcripts, or text descriptions using text_improvement (clarify vague requirements) and task_refinement (break down into sub-tasks). Stage 2: Run FileFinderWorkflow—4 sub-stages: (2a) root folder selection identifies scope boundaries, (2b) regex file filter matches patterns, (2c) AI relevance assessment scores each file, (2d) extended path finder discovers transitive dependencies. Stage 3: Generate multiple implementation plans using implementation_plan prompt across GPT-5.2, Claude Sonnet 4.5, and Gemini 3 Pro—each brings a different perspective. Stage 4: Review plans side-by-side, identify conflicts/gaps, write merge instructions (plain English guidance: "Prefer this plan\'s error handling, use that plan\'s test coverage"), run implementation_plan_merge to produce single XML blueprint.',
    },
    {
      title: 'Stage 5: Feeding the blueprint into Claude Code Plan Mode',
      description:
        'Open Claude Code CLI in your repo. Paste the merged implementation_plan XML from Stage 4 as context. The XML contains file-by-file edits (add/modify/delete operations), import statements, dependency order, rollback instructions, and constraints. Toggle Plan Mode with Shift+Tab (read-only analysis: see what Claude proposes without execution). Or start in Plan Mode via --permission-mode plan (execution with approvals: Claude requests permission for each file edit). Claude Code treats the merged blueprint as the execution specification.',
    },
    {
      title: 'Plan Mode permissions layer on pre-planned scope',
      description:
        'Claude Code Plan Mode permissions: Shift+Tab (read-only analysis, no edits), --permission-mode plan (execution with per-file approvals), default mode (full access). PlanToCode Stage 4 human review pre-approves scope: which files to touch, which operations (add/modify/delete), which dependencies to include. Plan Mode permissions enforce boundaries on pre-approved scope. No permission escalation, no scope creep. Two-stage governance: human review (Stage 4) + permission controls (Stage 5).',
    },
    {
      title: 'Concrete narrative: Caching layer implementation',
      description:
        `Stage 1: Voice note "Add Redis caching to API endpoints to reduce DB load." Text_improvement clarifies: "Cache GET requests with 5-minute TTL, invalidate on POST/PUT/DELETE." Stage 2: FileFinderWorkflow discovers api/routes/*.ts, middleware/cache.ts (doesn't exist yet—Stage 2d suggests creation), config/redis.ts, tests/integration/. Stage 3: GPT-5.2 suggests Redis client with basic TTL; Gemini suggests Redis cluster with async invalidation. Stage 4: Merge instruction "Use simple Redis client, add async invalidation for write-heavy endpoints." Merged blueprint ready. Stage 5: Open Claude Code, paste blueprint, enable Plan Mode (Shift+Tab), review 8 file edits, approve. Claude Code executes: creates cache.ts, updates routes, adds tests, updates redis config.`,
    },
    {
      title: 'Multi-model blind spot prevention',
      description:
        `Single-model Claude Code Plan Mode provides one perspective—may miss edge cases, legacy constraints, or alternative patterns. PlanToCode Stage 3 multi-model planning runs GPT-5.2, Claude Sonnet 4.5, and Gemini 3 Pro in parallel. Each model brings a different perspective and catches different things. Stage 4 merge consolidates all three perspectives. Claude Code Plan Mode executes the synthesized blueprint—comprehensive coverage, fewer blind spots.`,
    },
    {
      title: 'Repeatable process for audits and compliance',
      description:
        `Enterprise governance requirement: reproducible planning process with audit trail. PlanToCode Stages 1-4 provide this: (1) Specification is versioned (text_improvement/task_refinement outputs stored). (2) FileFinderWorkflow results are logged (which files discovered, relevance scores). (3) Each model's implementation_plan is saved (GPT-5.2 output, Gemini output). (4) Merge instructions and final merged blueprint are versioned. Stage 5 Claude Code Plan Mode execution uses the blueprint—logs every file edit, permission request, approval. Full audit trail from requirements to execution.`,
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
      q: "Should I trust Claude's Plan Mode alone or pre-plan with PlanToCode?",
      a: "Claude Code Plan Mode provides permission-controlled execution (Stage 5), but lacks repeatable pre-planning. Without Stages 1-4, Plan Mode improvises: single-model perspective (misses edge cases), no systematic file discovery (misses dependencies), no human-guided merge (misses conflicts). Recommendation: Combine both. Use PlanToCode Stages 1-4 for repeatable multi-model planning + human review. Feed merged blueprint into Claude Code Plan Mode (Stage 5) for permission-controlled execution. Together: architect + construction crew. Alone: improvised construction = unpredictable outcomes.",
    },
    {
      q: "Does PlanToCode replace Claude Code's Plan Mode?",
      a: "No. PlanToCode is the architect (Stages 1-4: spec capture, file discovery, multi-model planning, merge review). Claude Code Plan Mode is the implementor (Stage 5: permission-controlled execution). They're complementary, not redundant. PlanToCode generates the blueprint (XML implementation_plan with file-by-file edits, imports, dependencies). Claude Code Plan Mode executes the blueprint (Shift+Tab to review, --permission-mode plan to execute with approvals). Both needed for enterprise governance: repeatable planning + controlled execution.",
    },
    {
      q: 'How do I use the merged plan with Claude Code Plan Mode?',
      a: 'Complete PlanToCode Stages 1-4: (1) Capture spec via text_improvement/task_refinement. (2) Run FileFinderWorkflow (root selection → regex filter → AI relevance → extended path finder). (3) Generate plans from GPT-5.2, Claude Sonnet 4.5, and Gemini—each brings a different perspective. (4) Review side-by-side, write merge instructions, run implementation_plan_merge. Copy merged XML. Open Claude Code CLI, paste XML as context. Enable Plan Mode (Shift+Tab or --permission-mode plan). Review proposed file edits. Approve/reject each. Claude Code executes within approved scope. PlanToCode terminal (optional) logs output for audit trail.',
    },
    {
      q: 'What are the benefits of multi-model planning over single-model Plan Mode?',
      a: 'Single-model Plan Mode: One perspective, may miss edge cases or alternative approaches. Multi-model planning (PlanToCode Stage 3) runs GPT-5.2, Claude Sonnet 4.5, and Gemini in parallel. Each model catches different things. Stage 4 merge consolidates all three—comprehensive blueprint. Example: One model suggests class components, another suggests hooks. Merge instruction: "Use hooks, keep the error handling approach." Claude Code Plan Mode executes merged blueprint—best of all models, fewer blind spots.',
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
