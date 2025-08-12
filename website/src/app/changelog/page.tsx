import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Changelog',
  description: 'Stay updated with the latest features, improvements, and fixes in Vibe Manager.',
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: '/changelog',
  },
};

interface ChangelogEntry {
  version: string;
  date: string;
  type: 'major' | 'minor' | 'patch';
  changes: {
    added?: string[];
    improved?: string[];
    fixed?: string[];
    removed?: string[];
  };
}

const changelog: ChangelogEntry[] = [
  {
    version: '1.0.11',
    date: '2025-08-11',
    type: 'patch',
    changes: {
      improved: [
        'Enhanced legal compliance with GDPR/CPRA consent management',
        'Updated cookie consent banner with proper styling',
        'Improved accessibility across legal pages'
      ],
      fixed: [
        'Resolved particle effects display on legal pages',
        'Fixed external link handling in desktop application'
      ]
    }
  },
  {
    version: '1.0.10',
    date: '2025-08-05',
    type: 'minor',
    changes: {
      added: [
        'Legal pages with comprehensive privacy policy and terms of service',
        'Desktop settings legal tab with third-party provider policies',
        'Support for xAI (Grok) AI provider'
      ],
      improved: [
        'Better context curation for large codebases',
        'Enhanced AI provider integration',
        'Improved desktop application performance'
      ]
    }
  },
  {
    version: '1.0.9',
    date: '2025-07-28',
    type: 'minor',
    changes: {
      added: [
        'Multi-model AI support with provider routing',
        'Context-aware workflow orchestration',
        'Local-first data storage architecture'
      ],
      improved: [
        'Faster codebase analysis and indexing',
        'Better error handling and user feedback',
        'Enhanced security with local data processing'
      ],
      fixed: [
        'Memory leaks in large project analysis',
        'UI responsiveness issues on slower machines'
      ]
    }
  },
  {
    version: '1.0.8',
    date: '2025-07-15',
    type: 'major',
    changes: {
      added: [
        'Initial public release',
        'Core context curation engine',
        'Desktop application with system tray integration',
        'Support for OpenAI, Google AI, and OpenRouter providers'
      ],
      improved: [
        'Streamlined onboarding experience',
        'Comprehensive documentation'
      ]
    }
  }
];

function getChangeTypeColor(type: ChangelogEntry['type']) {
  switch (type) {
    case 'major':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    case 'minor':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'patch':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
  }
}

function ChangeList({ title, items, icon }: { title: string; items: string[]; icon: React.ReactNode }) {
  if (!items.length) return null;

  return (
    <div>
      <h4 className="font-medium text-foreground flex items-center gap-2 mb-2">
        {icon}
        {title}
      </h4>
      <ul className="space-y-1 ml-6">
        {items.map((item, index) => (
          <li key={index} className="text-muted-foreground text-sm">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ChangelogPage() {
  return (
    <div className="container mx-auto max-w-4xl px-6 py-12 sm:py-16">
      <div className="space-y-12">
        <header className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-foreground">Changelog</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Stay updated with the latest features, improvements, and fixes in Vibe Manager.
          </p>
        </header>

        <div className="space-y-8">
          {changelog.map((entry) => (
            <div key={entry.version} className="border border-border rounded-lg p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold text-foreground">
                    v{entry.version}
                  </h2>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getChangeTypeColor(entry.type)}`}>
                    {entry.type}
                  </span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {entry.date}
                </span>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <ChangeList
                    title="Added"
                    items={entry.changes.added || []}
                    icon={
                      <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    }
                  />
                  
                  <ChangeList
                    title="Improved"
                    items={entry.changes.improved || []}
                    icon={
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    }
                  />
                </div>

                <div className="space-y-4">
                  <ChangeList
                    title="Fixed"
                    items={entry.changes.fixed || []}
                    icon={
                      <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    }
                  />
                  
                  <ChangeList
                    title="Removed"
                    items={entry.changes.removed || []}
                    icon={
                      <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                      </svg>
                    }
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center">
          <p className="text-muted-foreground">
            Want to be notified about new releases?{' '}
            <a href="https://x.com/vibemanagerapp" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              Follow us on X
            </a>{' '}
            or{' '}
            <a href="https://vibemanager.featurebase.app" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              join our community
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}