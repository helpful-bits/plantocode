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
    title: 'Planning & Context',
    items: [
      {
        slug: '/docs/text-improvement',
        title: 'Text Improvement',
        shortTitle: 'Text Improvement',
        description: 'Selection popover, job queue, and integrations for prompt cleanup.',
        tags: ['text-improvement', 'prompts', 'workflows'],
        doc_type: 'reference',
        last_reviewed: '2025-09-22',
        review_frequency: '90d'
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
        slug: '/docs/deep-research',
        title: 'Deep Research & Web Search',
        shortTitle: 'Deep Research',
        description: 'Web search workflow, API integration, query optimization, and development workflow integration.',
        tags: ['web-search', 'research', 'api-integration', 'context'],
        doc_type: 'reference',
        last_reviewed: '2025-09-21',
        review_frequency: '90d'
      }
    ]
  },
  {
    id: 'execution',
    title: 'Execution Surface',
    items: [
      {
        slug: '/docs/model-configuration',
        title: 'Model Configuration',
        shortTitle: 'Model Configuration',
        description: 'Allowed models per task and token guardrails in the selector toggle.',
        tags: ['models', 'guardrails', 'configuration'],
        doc_type: 'reference',
        last_reviewed: '2025-09-19',
        review_frequency: '90d'
      },
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
        slug: '/docs/voice-transcription',
        title: 'Voice Transcription',
        shortTitle: 'Voice Transcription',
        description: 'Recording lifecycle, project-aware settings, and device management.',
        tags: ['voice', 'transcription', 'input'],
        doc_type: 'reference',
        last_reviewed: '2025-09-19',
        review_frequency: '90d'
      }
    ]
  },
  {
    id: 'architecture',
    title: 'Architecture',
    items: [
      {
        slug: '/docs/vibe-manager-architecture',
        title: 'Architecture Overview',
        shortTitle: 'Architecture',
        description: 'How the React front end, Tauri commands, and persistence fit together.',
        tags: ['architecture', 'tauri', 'services'],
        doc_type: 'explanation',
        last_reviewed: '2025-09-19',
        review_frequency: '180d'
      }
    ]
  }
];
