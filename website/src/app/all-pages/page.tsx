import React from 'react';
import Link from 'next/link';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import {
  GitMerge, Terminal, Code2, Layers, Brain,
  ExternalLink, CheckCircle2, XCircle
} from 'lucide-react';
import pseoData from '@/data/pseo';
import { Metadata } from 'next';
import { cdnUrl } from '@/lib/cdn';

export const metadata: Metadata = {
  title: 'All Pages - pSEO Review',
  description: 'Internal review page for all programmatic SEO pages',
  robots: {
    index: false,
    follow: false,
  },
  openGraph: {
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
  },
};

export default function PseoReviewPage() {
  // Group pages by category
  const pagesByCategory = pseoData.pages.reduce((acc, page) => {
    const category = page.category || 'uncategorized';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(page);
    return acc;
  }, {} as Record<string, typeof pseoData.pages>);

  // Category metadata
  const categoryInfo: Record<string, { icon: React.ReactNode; color: string; description: string }> = {
    workflows: {
      icon: <GitMerge className="w-5 h-5" />,
      color: 'text-purple-500',
      description: 'Migration and upgrade workflows'
    },
    integrations: {
      icon: <Terminal className="w-5 h-5" />,
      color: 'text-green-500',
      description: 'Tool integrations (Claude, Cursor, Aider, etc.)'
    },
    comparisons: {
      icon: <Layers className="w-5 h-5" />,
      color: 'text-blue-500',
      description: 'PlanToCode vs alternatives'
    },
    'use-cases': {
      icon: <Brain className="w-5 h-5" />,
      color: 'text-yellow-500',
      description: 'Role-specific use cases'
    },
    stacks: {
      icon: <Code2 className="w-5 h-5" />,
      color: 'text-cyan-500',
      description: 'Technology stack implementations'
    },
    features: {
      icon: <ExternalLink className="w-5 h-5" />,
      color: 'text-pink-500',
      description: 'Feature-specific pages'
    }
  };

  const publishedCount = pseoData.pages.filter(p => p.publish === true).length;
  const unpublishedCount = pseoData.pages.filter(p => p.publish === false).length;

  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent min-h-screen">
        <Header />

        <main className="py-16 px-4">
          <div className="container mx-auto max-w-7xl">
            {/* Header */}
            <div className="text-center mb-12">
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                Programmatic SEO Pages Review
              </h1>
              <p className="text-lg text-foreground/80 mb-6">
                Review and test all generated pSEO pages
              </p>

              {/* Stats */}
              <div className="flex items-center justify-center gap-6 mb-8">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <span className="text-sm font-medium">{publishedCount} Published</span>
                </div>
                <div className="flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-red-500" />
                  <span className="text-sm font-medium">{unpublishedCount} Unpublished</span>
                </div>
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-primary" />
                  <span className="text-sm font-medium">{pseoData.pages.length} Total</span>
                </div>
              </div>
            </div>

            {/* Categories */}
            {Object.entries(pagesByCategory).map(([category, pages]) => {
              const info = categoryInfo[category] || {
                icon: <Layers className="w-5 h-5" />,
                color: 'text-gray-500',
                description: category
              };

              return (
                <div key={category} className="mb-12">
                  <div className="flex items-center gap-3 mb-6">
                    <div className={`${info.color}`}>{info.icon}</div>
                    <h2 className="text-2xl font-bold capitalize">
                      {category.replace('-', ' ')}
                    </h2>
                    <span className="text-sm text-foreground/60 ml-2">
                      ({pages.filter(p => p.publish === true).length} published, {pages.filter(p => p.publish === false).length} unpublished)
                    </span>
                  </div>
                  <p className="text-sm text-foreground/70 mb-4">{info.description}</p>

                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {pages.map((page) => (
                      <GlassCard
                        key={page.slug}
                        className={`p-4 ${!page.publish ? 'opacity-60' : ''}`}
                        highlighted={page.publish}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="font-semibold text-sm line-clamp-2">
                            {page.headline}
                          </h3>
                          {page.publish ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                          )}
                        </div>

                        <p className="text-xs text-foreground/60 mb-3 line-clamp-2">
                          {page.subhead}
                        </p>

                        {/* Metadata badges */}
                        <div className="flex flex-wrap gap-1 mb-3">
                          {(page as any).tool_integration && (
                            <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">
                              {(page as any).tool_integration}
                            </span>
                          )}
                          {(page as any).role && (
                            <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-500">
                              {(page as any).role}
                            </span>
                          )}
                          {(page as any).os && (
                            <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-500">
                              {(page as any).os}
                            </span>
                          )}
                          {(page as any).language && (
                            <span className="text-xs px-2 py-0.5 rounded bg-purple-500/10 text-purple-500">
                              {(page as any).language}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <Link
                            href={`/${page.slug}`}
                            className="text-xs text-primary hover:underline flex items-center gap-1"
                            target="_blank"
                          >
                            <ExternalLink className="w-3 h-3" />
                            View Page
                          </Link>
                          <span className="text-xs text-foreground/40">•</span>
                          <code className="text-xs text-foreground/50">/{page.slug}</code>
                        </div>
                      </GlassCard>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Quick Links */}
            <div className="mt-12 p-6 bg-primary/5 rounded-lg border border-primary/20">
              <h3 className="font-semibold mb-3">Quick Testing Links</h3>
              <div className="grid md:grid-cols-2 gap-2 text-sm">
                <div>
                  <strong>Popular Pages:</strong>
                  <ul className="mt-1 space-y-1">
                    <li>
                      <Link href="/plantocode-vs-aider" className="text-primary hover:underline">
                        /plantocode-vs-aider
                      </Link>
                    </li>
                    <li>
                      <Link href="/monorepo-migration/claude-code/macos" className="text-primary hover:underline">
                        /monorepo-migration/claude-code/macos
                      </Link>
                    </li>
                    <li>
                      <Link href="/staff-engineer/architectural-decisions" className="text-primary hover:underline">
                        /staff-engineer/architectural-decisions
                      </Link>
                    </li>
                  </ul>
                </div>
                <div>
                  <strong>Testing Notes:</strong>
                  <ul className="mt-1 space-y-1 text-foreground/70">
                    <li>• Published pages show with green checkmark</li>
                    <li>• Unpublished pages are dimmed with red X</li>
                    <li>• Click "View Page" to open in new tab</li>
                    <li>• All pages use clean root-level URLs</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}