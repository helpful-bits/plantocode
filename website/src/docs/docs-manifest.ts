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
    id: 'architecture',
    title: 'Architecture & Internals',
    items: [
      {
        slug: '/docs/overview',
        title: 'System Overview',
        shortTitle: 'Overview',
        description: 'Start here: what the system does, how the core loop works, and where each component lives.',
        tags: ['overview', 'system', 'start-here'],
        doc_type: 'explanation',
        last_reviewed: '2025-09-25',
        review_frequency: '180d'
      },
      {
        slug: '/docs/runtime-walkthrough',
        title: 'Runtime Walkthrough',
        shortTitle: 'Runtime',
        description: 'End-to-end timeline of what happens from task input to execution.',
        tags: ['pipeline', 'runtime', 'overview'],
        doc_type: 'explanation',
        last_reviewed: '2025-09-25',
        review_frequency: '180d'
      },
      {
        slug: '/docs/architecture',
        title: 'System Architecture',
        shortTitle: 'Architecture',
        description: 'How the desktop shell, Rust services, server APIs, and persistence layers fit together.',
        tags: ['architecture', 'tauri', 'services'],
        doc_type: 'explanation',
        last_reviewed: '2025-09-25',
        review_frequency: '180d'
      },
      {
        slug: '/docs/desktop-app',
        title: 'Desktop App Internals',
        shortTitle: 'Desktop App',
        description: 'Tauri v2 shell, Rust command layer, PTY sessions, and UI state management.',
        tags: ['desktop', 'tauri', 'rust'],
        doc_type: 'reference',
        last_reviewed: '2025-09-25',
        review_frequency: '180d'
      },
      {
        slug: '/docs/server-api',
        title: 'Server API & LLM Proxy',
        shortTitle: 'Server API',
        description: 'Auth, provider routing, model configuration, and WebSocket endpoints.',
        tags: ['server', 'api', 'llm'],
        doc_type: 'reference',
        last_reviewed: '2025-09-25',
        review_frequency: '180d'
      },
      {
        slug: '/docs/mobile-ios',
        title: 'iOS Client Architecture',
        shortTitle: 'iOS Client',
        description: 'Swift workflows, Auth0 login flow, and device-link session management.',
        tags: ['mobile', 'ios', 'workflows'],
        doc_type: 'reference',
        last_reviewed: '2025-09-25',
        review_frequency: '180d'
      },
      {
        slug: '/docs/background-jobs',
        title: 'Background Jobs & Orchestration',
        shortTitle: 'Background Jobs',
        description: 'Job records, workflow orchestration, processors, and event streaming.',
        tags: ['jobs', 'workflow', 'events'],
        doc_type: 'reference',
        last_reviewed: '2025-09-25',
        review_frequency: '180d'
      },
      {
        slug: '/docs/data-model',
        title: 'Data Model & Storage',
        shortTitle: 'Data Model',
        description: 'SQLite entities, relationships, and how state is rehydrated.',
        tags: ['sqlite', 'storage', 'state'],
        doc_type: 'reference',
        last_reviewed: '2025-09-25',
        review_frequency: '180d'
      },
      {
        slug: '/docs/decisions-tradeoffs',
        title: 'Technical Decisions & Tradeoffs',
        shortTitle: 'Decisions',
        description: 'Why Tauri, SQLite, and a dedicated LLM proxy were chosen and what they cost.',
        tags: ['tradeoffs', 'decisions', 'architecture'],
        doc_type: 'explanation',
        last_reviewed: '2025-09-25',
        review_frequency: '180d'
      },
      {
        slug: '/docs/build-your-own',
        title: 'Build Your Own Pipeline',
        shortTitle: 'Build Your Own',
        description: 'Conceptual guide for designing file discovery and plan generation workflows.',
        tags: ['workflow', 'planning', 'reference'],
        doc_type: 'howto',
        last_reviewed: '2025-09-25',
        review_frequency: '180d'
      }
    ]
  },
  {
    id: 'inputs',
    title: 'Inputs & Capture',
    items: [
      {
        slug: '/docs/meeting-ingestion',
        title: 'Meeting & Recording Ingestion',
        shortTitle: 'Meeting Ingestion',
        description: 'How recordings become structured task inputs and artifacts.',
        tags: ['ingestion', 'video', 'audio'],
        doc_type: 'explanation',
        last_reviewed: '2025-09-23',
        review_frequency: '180d'
      },
      {
        slug: '/docs/video-analysis',
        title: 'Video Analysis',
        shortTitle: 'Video Analysis',
        description: 'Frame sampling, prompts, and analysis artifacts from recordings.',
        tags: ['video', 'analysis', 'artifacts'],
        doc_type: 'reference',
        last_reviewed: '2025-09-23',
        review_frequency: '180d'
      },
      {
        slug: '/docs/voice-transcription',
        title: 'Voice Transcription',
        shortTitle: 'Voice Transcription',
        description: 'Recording lifecycle, project-aware settings, and device management.',
        tags: ['voice', 'transcription', 'input'],
        doc_type: 'reference',
        last_reviewed: '2025-09-19',
        review_frequency: '90d'
      },
      {
        slug: '/docs/text-improvement',
        title: 'Text Improvement',
        shortTitle: 'Text Improvement',
        description: 'Selection popover, job queue, and integrations for prompt cleanup.',
        tags: ['text-improvement', 'prompts', 'workflows'],
        doc_type: 'reference',
        last_reviewed: '2025-09-22',
        review_frequency: '90d'
      }
    ]
  },
  {
    id: 'planning',
    title: 'Planning Pipeline',
    items: [
      {
        slug: '/docs/file-discovery',
        title: 'File Discovery Workflow',
        shortTitle: 'File Discovery',
        description: 'Background workflow that gathers relevant paths for each task.',
        tags: ['workflow', 'context', 'file-discovery'],
        doc_type: 'reference',
        last_reviewed: '2025-09-19',
        review_frequency: '180d'
      },
      {
        slug: '/docs/implementation-plans',
        title: 'Implementation Plans',
        shortTitle: 'Implementation Plans',
        description: 'How plans stream into the Monaco viewer and stay linked to plan history.',
        tags: ['implementation', 'plans', 'monaco'],
        doc_type: 'explanation',
        last_reviewed: '2025-09-19',
        review_frequency: '90d'
      },
      {
        slug: '/docs/merge-instructions',
        title: 'Merge Instructions',
        shortTitle: 'Merge Instructions',
        description: 'How multiple plan drafts are merged with explicit guidance.',
        tags: ['merge', 'plans', 'governance'],
        doc_type: 'explanation',
        last_reviewed: '2025-09-23',
        review_frequency: '180d'
      },
      {
        slug: '/docs/prompt-types',
        title: 'Prompt Types & Templates',
        shortTitle: 'Prompt Types',
        description: 'Catalog of prompt-driven job types and template assembly.',
        tags: ['prompts', 'templates', 'jobs'],
        doc_type: 'reference',
        last_reviewed: '2025-09-24',
        review_frequency: '180d'
      }
    ]
  },
  {
    id: 'execution',
    title: 'Execution & Automation',
    items: [
      {
        slug: '/docs/terminal-sessions',
        title: 'Terminal Sessions',
        shortTitle: 'Terminal Sessions',
        description: 'Persistent PTY sessions, CLI detection, and recovery behaviour.',
        tags: ['terminal', 'pty', 'logs'],
        doc_type: 'reference',
        last_reviewed: '2025-09-19',
        review_frequency: '90d'
      },
      {
        slug: '/docs/copy-buttons',
        title: 'Copy Buttons',
        shortTitle: 'Copy Buttons',
        description: 'Template handoff from plans into terminals and external tools.',
        tags: ['templates', 'handoff', 'execution'],
        doc_type: 'reference',
        last_reviewed: '2025-09-23',
        review_frequency: '180d'
      }
    ]
  },
  {
    id: 'research',
    title: 'Research & Models',
    items: [
      {
        slug: '/docs/deep-research',
        title: 'Deep Research & Web Search',
        shortTitle: 'Deep Research',
        description: 'Web search workflow, API integration, query optimization, and development workflow integration.',
        tags: ['web-search', 'research', 'api-integration', 'context'],
        doc_type: 'reference',
        last_reviewed: '2025-09-21',
        review_frequency: '90d'
      },
      {
        slug: '/docs/provider-routing',
        title: 'Provider Routing & Streaming',
        shortTitle: 'Provider Routing',
        description: 'How provider requests are normalized, streamed, and tracked.',
        tags: ['providers', 'routing', 'streaming'],
        doc_type: 'explanation',
        last_reviewed: '2025-09-24',
        review_frequency: '180d'
      },
      {
        slug: '/docs/model-configuration',
        title: 'Model Configuration',
        shortTitle: 'Model Configuration',
        description: 'Allowed models per task and token guardrails in the selector toggle.',
        tags: ['models', 'guardrails', 'configuration'],
        doc_type: 'reference',
        last_reviewed: '2025-09-19',
        review_frequency: '90d'
      }
    ]
  },
  {
    id: 'platform',
    title: 'Build & Deployment',
    items: [
      {
        slug: '/docs/server-setup',
        title: 'Dedicated Server Setup',
        shortTitle: 'Server Setup',
        description: 'Ansible-based infrastructure: base hardening, app deployment, and vault-managed secrets.',
        tags: ['deployment', 'ansible', 'infrastructure'],
        doc_type: 'howto',
        last_reviewed: '2025-09-25',
        review_frequency: '180d'
      },
      {
        slug: '/docs/tauri-v2',
        title: 'Tauri v2 Development Guide',
        shortTitle: 'Tauri v2',
        description: 'Project layout, commands, and capability-based permissions for Tauri v2.',
        tags: ['tauri', 'desktop', 'development'],
        doc_type: 'reference',
        last_reviewed: '2025-09-25',
        review_frequency: '180d'
      },
      {
        slug: '/docs/distribution-macos',
        title: 'macOS Distribution',
        shortTitle: 'macOS',
        description: 'Signing, notarization, DMG packaging, and updater artifacts.',
        tags: ['macos', 'distribution', 'signing'],
        doc_type: 'howto',
        last_reviewed: '2025-09-25',
        review_frequency: '180d'
      },
      {
        slug: '/docs/distribution-windows',
        title: 'Windows Distribution & Store',
        shortTitle: 'Windows',
        description: 'NSIS builds, MSIX packaging, and Microsoft Store submission.',
        tags: ['windows', 'msix', 'distribution'],
        doc_type: 'howto',
        last_reviewed: '2025-09-25',
        review_frequency: '180d'
      }
    ]
  }
];
