import { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { Calendar, Sparkles, Zap, Bug, Trash2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Changelog - Latest Updates | Vibe Manager',
  description: 'Latest features and improvements in Vibe Manager. Multi-model AI planning updates for Claude Code, Cursor, and OpenAI Codex integration.',
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: 'https://www.vibemanager.app/changelog',
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
    version: '1.0.20',
    date: '2025-09-22',
    type: 'patch',
    changes: {
      fixed: [
        'Critical workflow orchestrator initialization in production builds',
        'Workflow JSON definitions and migration rules not bundled in production',
        'Resource loading using compile-time paths instead of Tauri resource resolver',
        'Error log repository Arc management preventing proper cleanup'
      ],
      improved: [
        'Parallel processing in regex file filter for better performance with multiple root directories',
        'Root folder selection with enhanced context about primary project directory',
        'Background job repository with project-specific job visibility',
        'Resource loading with proper production/development path resolution',
        'Workflow orchestrator stability and error handling'
      ],
      added: [
        'Method to retrieve all visible jobs for a specific project'
      ]
    }
  },
  {
    version: '1.0.19',
    date: '2025-09-22',
    type: 'patch',
    changes: {
      improved: [
        'Audio device selection with deduplication to prevent duplicate entries',
        'Media device handling for cleaner device list'
      ],
      added: [
        'Error logging database table for better debugging'
      ]
    }
  },
  {
    version: '1.0.18',
    date: '2025-09-21',
    type: 'patch',
    changes: {
      added: [
        'External folders support for including directories outside the main project',
        'Workspace roots resolution for monorepo support',
        'UI for managing external folders in project settings'
      ],
      fixed: [
        'Windows-specific path handling and Git utilities',
        'Billing commands error handling on Windows'
      ],
      improved: [
        'Cross-platform compatibility'
      ]
    }
  },
  {
    version: '1.0.17',
    date: '2025-09-21',
    type: 'patch',
    changes: {
      improved: [
        'Version numbering alignment'
      ],
      fixed: [
        'Minor UI adjustments'
      ]
    }
  },
  {
    version: '1.0.16',
    date: '2025-09-21',
    type: 'minor',
    changes: {
      added: [
        'Terminal session management with PTY support',
        'Real-time terminal output monitoring in background jobs',
        'Terminal output persistence and logging',
        'Monitoring panel for terminal sessions'
      ],
      improved: [
        'Background job UI with terminal integration'
      ]
    }
  },
  {
    version: '1.0.15',
    date: '2025-09-20',
    type: 'minor',
    changes: {
      added: [
        'Granular background job event system',
        'Real-time job status updates with specific events',
        'Detailed event tracking (created, deleted, status-changed, tokens-updated, cost-updated)'
      ],
      improved: [
        'Background job repository with app handle integration',
        'Job monitoring with more detailed event tracking'
      ]
    }
  },
  {
    version: '1.0.14',
    date: '2025-09-20',
    type: 'patch',
    changes: {
      fixed: [
        'Critical database initialization issue on fresh installs',
        'Database resource bundling in build configuration'
      ],
      added: [
        'Embedded database schema as fallback'
      ],
      improved: [
        'Consent verification with retry logic'
      ]
    }
  },
  {
    version: '1.0.13',
    date: '2025-09-20',
    type: 'patch',
    changes: {
      improved: [
        'Onboarding flow with keychain access detection',
        'Database initialization process'
      ],
      added: [
        'Check for existing keychain access to skip redundant onboarding'
      ],
      fixed: [
        'Payment method handling simplification'
      ]
    }
  },
  {
    version: '1.0.12',
    date: '2025-09-20',
    type: 'patch',
    changes: {
      improved: [
        'Application initialization and setup flow',
        'Error handling with better user-friendly messages'
      ],
      fixed: [
        'Database setup timing issues'
      ]
    }
  },
  {
    version: '1.0.11',
    date: '2025-09-19',
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
    date: '2025-09-19',
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
    date: '2025-09-19',
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
    date: '2025-09-19',
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
      return 'bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400';
    case 'minor':
      return 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400';
    case 'patch':
      return 'bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function getChangeIcon(type: keyof ChangelogEntry['changes']) {
  switch (type) {
    case 'added':
      return <Sparkles className="w-4 h-4 text-green-600 dark:text-green-400" />;
    case 'improved':
      return <Zap className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
    case 'fixed':
      return <Bug className="w-4 h-4 text-orange-600 dark:text-orange-400" />;
    case 'removed':
      return <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />;
    default:
      return null;
  }
}

function ChangeList({ title, items, type }: { title: string; items: string[]; type: keyof ChangelogEntry['changes'] }) {
  if (!items.length) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {getChangeIcon(type)}
        <h4 className="font-semibold text-foreground text-sm uppercase tracking-wide">
          {title}
        </h4>
      </div>
      <ul className="space-y-2 ml-6">
        {items.map((item, index) => (
          <li key={index} className="text-foreground/80 dark:text-foreground/90 text-sm leading-relaxed">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ChangelogPage() {
  return (
    <div className="relative pt-20 sm:pt-24 pb-16 sm:pb-20 lg:pb-24">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
        {/* Hero Section */}
        <div className="text-center mb-12 sm:mb-16">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-6 sm:mb-8 leading-tight bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
            Changelog
          </h1>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Stay updated with the latest features, improvements, and fixes in Vibe Manager. Track our journey as we enhance your Claude Code and Cursor workflows.
          </p>
        </div>

        {/* Changelog Entries */}
        <div className="space-y-8">
          {changelog.map((entry) => (
            <GlassCard key={entry.version} className="p-6 sm:p-8 transition-all duration-300 hover:border-primary/40">
              {/* Version Header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
                    v{entry.version}
                  </h2>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${getChangeTypeColor(entry.type)}`}>
                    {entry.type}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <time dateTime={entry.date}>
                    {new Date(entry.date).toLocaleDateString('en-US', { 
                      month: 'long', 
                      day: 'numeric', 
                      year: 'numeric' 
                    })}
                  </time>
                </div>
              </div>

              {/* Changes Grid */}
              <div className="grid md:grid-cols-2 gap-6 sm:gap-8">
                <div className="space-y-6">
                  <ChangeList
                    title="Added"
                    items={entry.changes.added || []}
                    type="added"
                  />
                  
                  <ChangeList
                    title="Improved"
                    items={entry.changes.improved || []}
                    type="improved"
                  />
                </div>

                <div className="space-y-6">
                  <ChangeList
                    title="Fixed"
                    items={entry.changes.fixed || []}
                    type="fixed"
                  />
                  
                  <ChangeList
                    title="Removed"
                    items={entry.changes.removed || []}
                    type="removed"
                  />
                </div>
              </div>
            </GlassCard>
          ))}
        </div>

        {/* Footer CTA */}
        <footer className="mt-16 text-center">
          <GlassCard className="p-8 space-y-4">
            <h3 className="text-xl font-bold text-foreground">
              Stay in the Loop
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              Want to be notified about new releases and features?
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <a 
                href="https://x.com/vibemanagerapp" 
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
                target="_blank" 
                rel="noopener noreferrer"
              >
                Follow us on X
              </a>
              <a 
                href="https://vibemanager.featurebase.app" 
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
                target="_blank" 
                rel="noopener noreferrer"
              >
                Join our Community
              </a>
            </div>
          </GlassCard>
        </footer>
      </div>
    </div>
  );
}