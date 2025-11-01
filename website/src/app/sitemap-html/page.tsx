import { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '@/components/landing/Header';
import { GlassCard } from '@/components/ui/GlassCard';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { getPublishedPages, getPagesByCategory } from '@/data/pseo';
import {
  FileText, GitMerge, Terminal, Code2, Layers, Zap,
  BookOpen, HelpCircle, Settings, Download
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Sitemap - All Pages | PlanToCode',
  description: 'Complete sitemap of all PlanToCode pages including documentation, workflows, integrations, comparisons, and technology stacks.',
  alternates: {
    canonical: 'https://www.plantocode.com/sitemap-html',
  },
};

export default function HtmlSitemapPage() {
  const pseoPages = getPublishedPages();

  const workflows = getPagesByCategory('workflows').filter(p => p.publish);
  const integrations = getPagesByCategory('integrations').filter(p => p.publish);
  const comparisons = getPagesByCategory('comparisons').filter(p => p.publish);
  const stacks = getPagesByCategory('stacks').filter(p => p.publish);
  const useCases = getPagesByCategory('use-cases').filter(p => p.publish);
  const features = getPagesByCategory('features').filter(p => p.publish);

  const mainPages = [
    { href: '/', label: 'Home', description: 'AI-powered implementation planning' },
    { href: '/about', label: 'About', description: 'Learn about PlanToCode' },
    { href: '/downloads', label: 'Downloads', description: 'Download for macOS and Windows' },
    { href: '/how-it-works', label: 'How It Works', description: 'See the planning workflow in action' },
    { href: '/screenshots', label: 'Screenshots', description: 'Visual tour of features' },
    { href: '/support', label: 'Support', description: 'Get help and book sessions' },
  ];

  const docPages = [
    { href: '/docs', label: 'Documentation Home' },
    { href: '/docs/architecture', label: 'Architecture' },
    { href: '/docs/file-discovery', label: 'File Discovery' },
    { href: '/docs/implementation-plans', label: 'Implementation Plans' },
    { href: '/docs/deep-research', label: 'Deep Research' },
    { href: '/docs/model-configuration', label: 'Model Configuration' },
    { href: '/docs/terminal-sessions', label: 'Terminal Sessions' },
    { href: '/docs/voice-transcription', label: 'Voice Transcription' },
    { href: '/docs/text-improvement', label: 'Text Improvement' },
  ];

  const solutionPages = [
    { href: '/solutions/hard-bugs', label: 'Hard Bugs', description: 'Debug with preserved context' },
    { href: '/solutions/large-features', label: 'Large Features', description: 'Plan complex implementations' },
    { href: '/solutions/library-upgrades', label: 'Library Upgrades', description: 'Safe dependency updates' },
    { href: '/solutions/maintenance-enhancements', label: 'Maintenance & Enhancements', description: 'Systematic improvements' },
  ];

  const featurePages = [
    { href: '/features/file-discovery', label: 'File Discovery' },
    { href: '/features/deep-research', label: 'Deep Research' },
    { href: '/features/plan-mode', label: 'Plan Mode' },
    { href: '/features/merge-instructions', label: 'Merge Instructions' },
    { href: '/features/integrated-terminal', label: 'Integrated Terminal' },
    { href: '/features/voice-transcription', label: 'Voice Transcription' },
    { href: '/features/text-improvement', label: 'Text Improvement' },
    { href: '/features/video-analysis', label: 'Video Analysis' },
    { href: '/features/copy-buttons', label: 'Copy Buttons' },
  ];

  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />

        <main className="flex-grow">
          <section className="py-16 sm:py-20 px-4">
            <div className="container mx-auto max-w-6xl">
              <Breadcrumbs items={[{ label: 'Sitemap' }]} />

              <header className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6 text-sm font-medium">
                  <FileText className="w-4 h-4" />
                  <span>Site Navigation</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6 leading-tight">
                  Complete Sitemap
                </h1>
                <p className="text-lg text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  Browse all pages, documentation, workflows, integrations, and resources.
                </p>
              </header>

              <div className="space-y-12">
                {/* Main Pages */}
                <section>
                  <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                    <FileText className="w-6 h-6 text-primary" />
                    Main Pages
                  </h2>
                  <GlassCard className="p-6">
                    <ul className="grid md:grid-cols-2 gap-4">
                      {mainPages.map(page => (
                        <li key={page.href}>
                          <Link href={page.href} className="block hover:text-primary transition-colors">
                            <span className="font-medium">{page.label}</span>
                            {page.description && (
                              <p className="text-sm text-foreground/60">{page.description}</p>
                            )}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </GlassCard>
                </section>

                {/* Documentation */}
                <section>
                  <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                    <BookOpen className="w-6 h-6 text-primary" />
                    Documentation ({docPages.length})
                  </h2>
                  <GlassCard className="p-6">
                    <ul className="grid md:grid-cols-3 gap-4">
                      {docPages.map(page => (
                        <li key={page.href}>
                          <Link href={page.href} className="hover:text-primary transition-colors">
                            {page.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </GlassCard>
                </section>

                {/* Solutions */}
                <section>
                  <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                    <HelpCircle className="w-6 h-6 text-primary" />
                    Solutions ({solutionPages.length})
                  </h2>
                  <GlassCard className="p-6">
                    <ul className="grid md:grid-cols-2 gap-4">
                      {solutionPages.map(page => (
                        <li key={page.href}>
                          <Link href={page.href} className="block hover:text-primary transition-colors">
                            <span className="font-medium">{page.label}</span>
                            {page.description && (
                              <p className="text-sm text-foreground/60">{page.description}</p>
                            )}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </GlassCard>
                </section>

                {/* Features */}
                <section>
                  <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                    <Zap className="w-6 h-6 text-primary" />
                    Features ({featurePages.length})
                  </h2>
                  <GlassCard className="p-6">
                    <ul className="grid md:grid-cols-3 gap-4">
                      {featurePages.map(page => (
                        <li key={page.href}>
                          <Link href={page.href} className="hover:text-primary transition-colors">
                            {page.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </GlassCard>
                </section>

                {/* Workflows */}
                <section>
                  <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                    <GitMerge className="w-6 h-6 text-primary" />
                    Workflows ({workflows.length})
                  </h2>
                  <GlassCard className="p-6">
                    <div className="mb-4">
                      <Link href="/workflows" className="text-primary hover:underline font-medium">
                        View all workflows →
                      </Link>
                    </div>
                    <ul className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                      {workflows.map(page => (
                        <li key={page.slug}>
                          <Link href={`/${page.slug}`} className="hover:text-primary transition-colors line-clamp-1">
                            {page.headline}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </GlassCard>
                </section>

                {/* Integrations */}
                <section>
                  <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                    <Terminal className="w-6 h-6 text-primary" />
                    Integrations ({integrations.length})
                  </h2>
                  <GlassCard className="p-6">
                    <div className="mb-4">
                      <Link href="/integrations" className="text-primary hover:underline font-medium">
                        View all integrations →
                      </Link>
                    </div>
                    <ul className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                      {integrations.map(page => (
                        <li key={page.slug}>
                          <Link href={`/${page.slug}`} className="hover:text-primary transition-colors line-clamp-1">
                            {page.headline}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </GlassCard>
                </section>

                {/* Technology Stacks */}
                <section>
                  <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                    <Code2 className="w-6 h-6 text-primary" />
                    Technology Stacks ({stacks.length})
                  </h2>
                  <GlassCard className="p-6">
                    <div className="mb-4">
                      <Link href="/stacks" className="text-primary hover:underline font-medium">
                        View all stacks →
                      </Link>
                    </div>
                    <ul className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                      {stacks.map(page => (
                        <li key={page.slug}>
                          <Link href={`/${page.slug}`} className="hover:text-primary transition-colors line-clamp-1">
                            {page.headline}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </GlassCard>
                </section>

                {/* Comparisons */}
                <section>
                  <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                    <Layers className="w-6 h-6 text-primary" />
                    Comparisons ({comparisons.length})
                  </h2>
                  <GlassCard className="p-6">
                    <div className="mb-4">
                      <Link href="/comparisons" className="text-primary hover:underline font-medium">
                        View all comparisons →
                      </Link>
                    </div>
                    <ul className="grid md:grid-cols-2 gap-3 text-sm">
                      {comparisons.map(page => (
                        <li key={page.slug}>
                          <Link href={`/${page.slug}`} className="hover:text-primary transition-colors line-clamp-1">
                            {page.headline}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </GlassCard>
                </section>

                {/* Use Cases (if any) */}
                {useCases.length > 0 && (
                  <section>
                    <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                      <Settings className="w-6 h-6 text-primary" />
                      Use Cases ({useCases.length})
                    </h2>
                    <GlassCard className="p-6">
                      <ul className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                        {useCases.map(page => (
                          <li key={page.slug}>
                            <Link href={`/${page.slug}`} className="hover:text-primary transition-colors line-clamp-1">
                              {page.headline}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </GlassCard>
                  </section>
                )}

                {/* Bottom Summary */}
                <GlassCard className="p-8 text-center" highlighted>
                  <h2 className="text-xl font-bold mb-2">Total Pages: {pseoPages.length + mainPages.length + docPages.length + solutionPages.length + featurePages.length}</h2>
                  <p className="text-foreground/70 mb-6">
                    Comprehensive documentation, workflows, and integrations for AI-powered development
                  </p>
                  <Link href="/" className="text-primary hover:underline">
                    Back to Home
                  </Link>
                </GlassCard>
              </div>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
