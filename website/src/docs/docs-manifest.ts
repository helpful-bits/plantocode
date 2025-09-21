export type DocItem = { 
  slug: string; 
  title: string; 
  shortTitle?: string; 
  description?: string; 
  tags?: string[]; 
  doc_type?: 'tutorial'|'howto'|'reference'|'explanation'; 
  last_reviewed?: string; 
  review_frequency?: '30d'|'90d'|'180d' 
};

export type DocGroup = { 
  id: string; 
  title: string; 
  items: (DocItem|DocGroup)[] 
};

export const docsManifest: DocGroup[] = [
  {
    id: 'planning',
    title: 'Planning',
    items: [
      {
        slug: '/docs/plan-mode',
        title: 'Plan Mode: Claude Code vs Cursor vs Cline vs Codex CLI',
        shortTitle: 'Plan Mode Comparison',
        description: 'Complete comparison of plan modes and safe planning flows across all major AI coding tools - with setup steps and best practices.',
        tags: ['plan-mode', 'comparison', 'claude-code', 'cursor', 'cline', 'codex-cli'],
        doc_type: 'explanation',
        last_reviewed: '2025-09-12',
        review_frequency: '90d'
      },
      {
        slug: '/docs/claude-code-plan-mode',
        title: 'Claude Code: Plan Mode',
        shortTitle: 'Claude Code Plan Mode',
        description: 'Complete guide to using Claude Code plan mode for safe, reviewable AI-assisted development.',
        tags: ['claude-code', 'plan-mode', 'tutorial'],
        doc_type: 'tutorial',
        last_reviewed: '2025-09-12',
        review_frequency: '90d'
      },
      {
        slug: '/docs/cursor-plan-mode',
        title: 'Cursor: Ask & Agent Modes',
        shortTitle: 'Cursor Plan Mode',
        description: 'Learn how to use Cursor Ask mode for planning and Agent mode for execution in AI-assisted development.',
        tags: ['cursor', 'ask-mode', 'agent-mode', 'plan-mode'],
        doc_type: 'tutorial',
        last_reviewed: '2025-09-12',
        review_frequency: '90d'
      },
      {
        slug: '/docs/cline-plan-mode',
        title: 'Cline Plan & Act Mode',
        shortTitle: 'Cline Plan Mode',
        description: 'Complete guide to using Cline Plan & Act workflow for safe AI-assisted development with step-by-step approval.',
        tags: ['cline', 'plan-mode', 'act-mode', 'approval'],
        doc_type: 'tutorial',
        last_reviewed: '2025-09-12',
        review_frequency: '90d'
      },
      {
        slug: '/docs/codex-cli-plan-mode',
        title: 'OpenAI Codex CLI: Read-Only approvals',
        shortTitle: 'Codex CLI Plan Mode',
        description: 'Learn how to use OpenAI Codex CLI suggest mode for safe code review and planning workflows.',
        tags: ['codex-cli', 'openai', 'plan-mode', 'suggest-mode'],
        doc_type: 'tutorial',
        last_reviewed: '2025-09-12',
        review_frequency: '90d'
      }
    ]
  },
  {
    id: 'integration',
    title: 'Integration',
    items: [
      {
        slug: '/docs/openai-codex-cli',
        title: 'OpenAI Codex CLI',
        shortTitle: 'Codex CLI Setup',
        description: 'Complete setup and configuration guide for OpenAI Codex CLI with MCP integration.',
        tags: ['codex-cli', 'openai', 'installation', 'setup'],
        doc_type: 'howto',
        last_reviewed: '2025-09-12',
        review_frequency: '90d'
      },
      {
        slug: '/docs/claude-code-install',
        title: 'Install Claude Code',
        shortTitle: 'Claude Code Install',
        description: 'Step-by-step installation guide for Claude Code CLI with MCP server configuration.',
        tags: ['claude-code', 'installation', 'setup', 'mcp'],
        doc_type: 'howto',
        last_reviewed: '2025-09-12',
        review_frequency: '90d'
      }
    ]
  },
  {
    id: 'concepts',
    title: 'Concepts & Architecture',
    items: [
      {
        slug: '/docs/vibe-manager-architecture',
        title: 'Vibe Manager Architecture',
        shortTitle: 'Architecture',
        description: 'Technical overview of Vibe Manager architecture, components, and design decisions.',
        tags: ['architecture', 'vibe-manager', 'technical', 'design'],
        doc_type: 'reference',
        last_reviewed: '2025-09-12',
        review_frequency: '180d'
      },
      {
        slug: '/docs/what-is-vibe-code-cleanup-specialist',
        title: 'What is Vibe Code Cleanup Specialist?',
        shortTitle: 'Code Cleanup Specialist',
        description: 'Learn about Vibe Code Cleanup Specialist and how it automates code quality improvements.',
        tags: ['vibe-manager', 'code-cleanup', 'automation', 'quality'],
        doc_type: 'explanation',
        last_reviewed: '2025-09-12',
        review_frequency: '90d'
      }
    ]
  }
];