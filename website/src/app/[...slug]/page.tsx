import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/GlassCard';
import { VideoButton } from '@/components/ui/VideoButton';
import { StructuredData } from '@/components/seo/StructuredData';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import {
  Code2, Terminal, GitMerge, Zap, CheckCircle2,
  FileSearch, Brain, Layers, XCircle, ArrowRight, ChevronRight
} from 'lucide-react';
import pseoData from '@/data/pseo';

// List of existing pages to exclude from pSEO routing
const EXISTING_PAGES = [
  'about', 'changelog', 'demo', 'docs', 'downloads', 'features', 'how-it-works',
  'legal', 'plan-mode', 'screenshots', 'solutions', 'support'
];

interface PseoPage {
  category: string;
  slug: string;
  headline: string;
  subhead: string;
  meta_title: string;
  meta_description: string;
  primary_cta: string;
  pain_points: Array<{
    problem: string;
    solution: string;
  }>;
  workflow_steps: string[];
  key_features?: string[];
  comparison_table?: {
    features: Array<{
      name: string;
      plantocode: string;
      competitor: string;
    }>;
  };
  tool_integration?: string;
  os?: string;
  language?: string;
  framework?: string;
  workflow?: string;
  role?: string;
}

interface PageParams {
  slug: string[];
}

export async function generateStaticParams() {
  return pseoData.pages
    .filter(page => page.publish === true)
    .map(page => ({
      slug: page.slug.split('/')
    }));
}

export async function generateMetadata(
  { params }: { params: Promise<PageParams> }
): Promise<Metadata> {
  const { slug } = await params;
  const slugString = slug.join('/');

  // Skip if it's an existing page
  if (slug[0] && EXISTING_PAGES.includes(slug[0])) {
    return {
      title: 'Page Not Found',
      description: 'The requested page could not be found.'
    };
  }

  const pageData = pseoData.pages.find(p => p.slug === slugString) as PseoPage | undefined;

  if (!pageData) {
    return {
      title: 'Page Not Found',
      description: 'The requested page could not be found.'
    };
  }

  return {
    title: pageData.meta_title,
    description: pageData.meta_description,
    openGraph: {
      title: pageData.headline,
      description: pageData.meta_description,
      url: `https://www.plantocode.com/${slugString}`,
      siteName: 'PlanToCode',
      type: 'website',
    },
    alternates: {
      canonical: `https://www.plantocode.com/${slugString}`,
    },
  };
}

// Icon mapping for different categories/features
const getIconForCategory = (category: string) => {
  const iconMap: Record<string, React.ReactElement> = {
    'workflows': <GitMerge className="w-4 h-4" />,
    'integrations': <Terminal className="w-4 h-4" />,
    'stacks': <Code2 className="w-4 h-4" />,
    'comparisons': <Layers className="w-4 h-4" />,
    'use-cases': <Brain className="w-4 h-4" />,
    'features': <Zap className="w-4 h-4" />
  };
  return iconMap[category] || <Terminal className="w-4 h-4" />;
};

// Tool name formatting
const formatToolName = (tool: string) => {
  const nameMap: Record<string, string> = {
    'claude-code': 'Claude Code',
    'cursor': 'Cursor',
    'codex-cli': 'Codex CLI',
    'openai-o3': 'OpenAI o3',
    'tmux-script-asciinema': 'tmux, script & asciinema',
    'warp': 'Warp AI'
  };
  return nameMap[tool] || tool;
};

// OS badge formatting
const formatOS = (os: string) => {
  const osMap: Record<string, string> = {
    'macos': 'macOS',
    'windows': 'Windows',
    'linux': 'Linux'
  };
  return osMap[os] || os;
};

export default async function PseoPage({ params }: { params: Promise<PageParams> }) {
  const { slug } = await params;
  const slugString = slug.join('/');

  // Skip if it's an existing page
  if (slug[0] && EXISTING_PAGES.includes(slug[0])) {
    notFound();
  }

  const pageData = pseoData.pages.find(p => p.slug === slugString) as PseoPage | undefined;

  if (!pageData) {
    notFound();
  }

  // Generate structured data
  const structuredData: any = {
    '@type': ['SoftwareApplication', 'HowTo'],
    name: 'PlanToCode',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: pageData.os ? [formatOS(pageData.os)] : ['Windows 10+', 'macOS 11.0+'],
    url: `https://www.plantocode.com/${slugString}`,
    description: pageData.meta_description,
    offers: {
      '@type': 'Offer',
      price: 0,
      description: 'Free app with pay-as-you-go API usage. $5 free credits on signup.',
    },
    about: {
      '@type': 'Thing',
      name: pageData.headline,
      description: pageData.subhead
    },
    step: pageData.workflow_steps ? pageData.workflow_steps.map((step, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: step,
    })) : [],
  };

  // Badge components for metadata
  const MetadataBadges = () => (
    <div className="flex flex-wrap gap-2 mb-6">
      {pageData.tool_integration && (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
          <Terminal className="w-3 h-3" />
          {formatToolName(pageData.tool_integration)}
        </span>
      )}
      {pageData.os && (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-500/10 text-blue-500 text-sm font-medium">
          {formatOS(pageData.os)}
        </span>
      )}
      {pageData.language && (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-purple-500/10 text-purple-500 text-sm font-medium">
          <Code2 className="w-3 h-3" />
          {pageData.language.charAt(0).toUpperCase() + pageData.language.slice(1)}
        </span>
      )}
      {pageData.framework && (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-500/10 text-green-500 text-sm font-medium">
          {pageData.framework}
        </span>
      )}
    </div>
  );

  return (
    <React.Fragment>
      <StructuredData data={structuredData} />
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />

        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 lg:py-32 px-4">
            <div className="container mx-auto max-w-6xl">
              {/* Breadcrumbs */}
              <nav className="flex items-center gap-2 text-sm text-foreground/60 mb-8">
                <Link href="/" className="hover:text-foreground transition-colors">
                  Home
                </Link>
                <ChevronRight className="w-4 h-4" />
                <Link href={`#`} className="hover:text-foreground transition-colors capitalize">
                  {pageData.category.replace('-', ' ')}
                </Link>
                {pageData.tool_integration && (
                  <>
                    <ChevronRight className="w-4 h-4" />
                    <span className="text-foreground">{formatToolName(pageData.tool_integration)}</span>
                  </>
                )}
                {pageData.os && (
                  <>
                    <ChevronRight className="w-4 h-4" />
                    <span className="text-foreground">{formatOS(pageData.os)}</span>
                  </>
                )}
              </nav>

              {/* Hero Section */}
              <div className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6 text-sm font-medium">
                  {getIconForCategory(pageData.category)}
                  <span>{pageData.category.charAt(0).toUpperCase() + pageData.category.slice(1).replace('-', ' ')}</span>
                </div>

                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight sm:leading-tight md:leading-snug lg:leading-snug bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  {pageData.headline}
                </h1>

                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed mb-6">
                  {pageData.subhead}
                </p>

                <MetadataBadges />

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Button variant="cta" size="lg" asChild>
                    <Link href="/downloads">
                      {pageData.primary_cta}
                    </Link>
                  </Button>
                  <VideoButton />
                </div>
                <p className="text-sm text-foreground/60 mt-4">
                  $5 free credits • Pay-as-you-go • Works with your existing tools
                </p>
              </div>

              {/* Pain Points & Solutions */}
              {pageData.pain_points && pageData.pain_points.length > 0 && (
                <div className="mb-16">
                  <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">
                    {pageData.category === 'comparisons' ? 'Why developers are switching' : 'The problems you face today'}
                  </h2>
                  <div className="space-y-6">
                    {pageData.pain_points.map((point, i) => (
                    <GlassCard key={i} className="p-6">
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 mt-1">
                          <XCircle className="w-6 h-6 text-red-500" />
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-lg mb-2 text-foreground">
                            {point.problem}
                          </div>
                          <div className="flex items-start gap-2">
                            <ArrowRight className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                            <span className="text-primary">
                              {point.solution}
                            </span>
                          </div>
                        </div>
                      </div>
                    </GlassCard>
                  ))}
                </div>
                </div>
              )}

              {/* Comparison Table (if applicable) */}
              {pageData.comparison_table && (
                <div className="mb-16">
                  <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">
                    Feature-by-feature comparison
                  </h2>
                  <GlassCard className="p-8 overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-foreground/10">
                          <th className="text-left py-4 px-4 font-semibold">Feature</th>
                          <th className="text-left py-4 px-4 font-semibold text-primary">PlanToCode</th>
                          <th className="text-left py-4 px-4 font-semibold text-foreground/60">
                            {formatToolName(pageData.comparison_table.features[0]?.competitor || 'Alternative')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageData.comparison_table.features.map((feature, i) => (
                          <tr key={i} className="border-b border-foreground/5">
                            <td className="py-4 px-4 font-medium">{feature.name}</td>
                            <td className="py-4 px-4">
                              <span className="text-primary font-medium">{feature.plantocode}</span>
                            </td>
                            <td className="py-4 px-4 text-foreground/60">{feature.competitor}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </GlassCard>
                </div>
              )}

              {/* Workflow Steps */}
              {pageData.workflow_steps && pageData.workflow_steps.length > 0 && (
                <div className="mb-16">
                  <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">How it works</h2>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {pageData.workflow_steps.map((step, i) => (
                    <GlassCard key={i} className="p-6" highlighted>
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                          {i + 1}
                        </div>
                        <p className="text-sm text-foreground/80">{step}</p>
                      </div>
                    </GlassCard>
                  ))}
                </div>
                </div>
              )}

              {/* Key Features (if applicable) */}
              {pageData.key_features && pageData.key_features.length > 0 && (
                <div className="mb-16">
                  <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">
                    {pageData.category === 'stacks' ? 'Stack-specific features' : 'Key capabilities'}
                  </h2>
                  <div className="grid md:grid-cols-3 gap-6">
                    {pageData.key_features.map((feature, i) => (
                      <GlassCard key={i} className="p-6" highlighted>
                        <div className="flex items-start gap-3">
                          <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                          <span className="text-foreground/80">{feature}</span>
                        </div>
                      </GlassCard>
                    ))}
                  </div>
                </div>
              )}

              {/* Technical Implementation Details */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Technical implementation</h2>
                <div className="grid md:grid-cols-2 gap-8">
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <FileSearch className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Intelligent File Discovery</h3>
                        <p className="text-foreground/80 mb-4">
                          {pageData.category === 'workflows'
                            ? 'Multi-stage AI workflow identifies relevant files for your ' + (pageData.workflow || 'workflow')
                            : 'Hierarchical folder selection, pattern filtering, and AI relevance assessment'}
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Root folder selection based on task</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Targeted regex pattern groups</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>LLM analyzes actual file contents</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Automatic dependency detection</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Files organized into XML for LLM consumption</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Brain className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">Multi-Model Planning</h3>
                        <p className="text-foreground/80 mb-4">
                          Generate multiple implementation approaches using different AI models, then synthesize the best solution
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>OpenAI GPT‑5 family (GPT‑5 and GPT‑5 Thinking/Pro), historical o‑series (e.g., o3 variants); Anthropic Claude Sonnet 4 and Opus 4.1; Google Gemini 2.5 Pro - availability and features vary by plan and endpoint (ChatGPT vs API).</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>AI architect merges best insights</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Your guidance shapes the merge</span>
                          </li>
                        </ul>
                        <p className="text-sm text-foreground/60 mt-4">
                          Use official vendor docs to confirm features like streaming, function calling, and background mode for each model.
                        </p>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>

              {/* Setup Guide */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">
                  Quick setup for {pageData.tool_integration ? formatToolName(pageData.tool_integration) : 'your workflow'}
                </h2>
                <GlassCard className="p-8 max-w-3xl mx-auto">
                  <div className="space-y-6">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                        1
                      </div>
                      <div>
                        <h3 className="font-semibold mb-1">Install PlanToCode</h3>
                        <p className="text-foreground/70">
                          Download for {pageData.os ? formatOS(pageData.os) : 'your platform'}.
                          Launches in seconds, no complex setup.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                        2
                      </div>
                      <div>
                        <h3 className="font-semibold mb-1">Connect your tools</h3>
                        <p className="text-foreground/70">
                          {pageData.tool_integration
                            ? `Works seamlessly with ${formatToolName(pageData.tool_integration)}. Just copy and paste.`
                            : 'Integrates with Claude Code, Cursor, Codex CLI and more.'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold">
                        3
                      </div>
                      <div>
                        <h3 className="font-semibold mb-1">Start planning</h3>
                        <p className="text-foreground/70">
                          $5 free credits to start. Generate your first implementation plan in under a minute.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Download CTA */}
                  <div className="mt-8 flex flex-col items-center gap-4">
                    <Button variant="cta" size="lg" asChild>
                      <Link href="/downloads">
                        Download PlanToCode
                      </Link>
                    </Button>
                    <p className="text-sm text-foreground/60">
                      {pageData.os ? `Available for ${formatOS(pageData.os)}` : 'Available for macOS & Windows'} • $5 free credits
                    </p>
                  </div>
                </GlassCard>
              </div>

              {/* Success Metrics */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">What developers achieve</h2>
                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6 text-center" highlighted>
                    <div className="text-4xl font-bold text-primary mb-2">75%</div>
                    <div className="text-foreground/80">Fewer production bugs</div>
                    <div className="text-sm text-foreground/60 mt-2">
                      Impact analysis catches issues before deployment
                    </div>
                  </GlassCard>

                  <GlassCard className="p-6 text-center" highlighted>
                    <div className="text-4xl font-bold text-primary mb-2">3x</div>
                    <div className="text-foreground/80">Faster large changes</div>
                    <div className="text-sm text-foreground/60 mt-2">
                      Multi-model plans handle complexity better
                    </div>
                  </GlassCard>

                  <GlassCard className="p-6 text-center" highlighted>
                    <div className="text-4xl font-bold text-primary mb-2">100%</div>
                    <div className="text-foreground/80">Architectural alignment</div>
                    <div className="text-sm text-foreground/60 mt-2">
                      AI follows your patterns and principles
                    </div>
                  </GlassCard>
                </div>
              </div>

              {/* Related pSEO Pages - Internal Linking */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Explore related topics</h2>
                <div className="grid md:grid-cols-3 gap-6">
                  {/* Related pages from same category */}
                  {pseoData.pages
                    .filter(p =>
                      p.publish === true &&
                      p.slug !== pageData.slug &&
                      (p.category === pageData.category ||
                       p.tool_integration === pageData.tool_integration ||
                       p.os === pageData.os ||
                       p.language === pageData.language)
                    )
                    .slice(0, 6)
                    .map((relatedPage, i) => (
                      <GlassCard key={i} className="p-6">
                        <h3 className="font-semibold mb-2">{relatedPage.headline}</h3>
                        <p className="text-sm text-foreground/70 mb-4">
                          {relatedPage.subhead.substring(0, 100)}...
                        </p>
                        <LinkWithArrow href={`/${relatedPage.slug}`} className="text-sm">
                          Learn more
                        </LinkWithArrow>
                      </GlassCard>
                    ))}
                </div>
              </div>

              {/* Related Resources */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Related resources</h2>
                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6">
                    <h3 className="font-semibold mb-2">Documentation</h3>
                    <p className="text-sm text-foreground/70 mb-4">
                      Complete guides for {pageData.category === 'integrations' ? 'integration setup' : 'getting started'}
                    </p>
                    <LinkWithArrow href="/docs" className="text-sm">
                      Read the docs
                    </LinkWithArrow>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="font-semibold mb-2">Video Demo</h3>
                    <p className="text-sm text-foreground/70 mb-4">
                      See {pageData.headline.toLowerCase()} in action
                    </p>
                    <LinkWithArrow href="/demo" className="text-sm">
                      Watch demo
                    </LinkWithArrow>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="font-semibold mb-2">Architecture</h3>
                    <p className="text-sm text-foreground/70 mb-4">
                      Deep dive into how PlanToCode works
                    </p>
                    <LinkWithArrow href="/docs/vibe-manager-architecture" className="text-sm">
                      Learn more
                    </LinkWithArrow>
                  </GlassCard>
                </div>
              </div>

              {/* Final CTA */}
              <div className="text-center">
                <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                    Ready to {pageData.category === 'workflows' ? 'transform your ' + (pageData.workflow || 'workflow') : 'get started'}?
                  </h2>
                  <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                    Join thousands of developers who ship with confidence using architectural AI planning.
                  </p>

                  <PlatformDownloadSection location={`pseo_${pageData.category}_${slugString.replace(/\//g, '_')}`} />

                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                    <LinkWithArrow href="/demo">
                      Try interactive demo first
                    </LinkWithArrow>
                    <span className="hidden sm:inline">•</span>
                    <LinkWithArrow href="/support#book">
                      Book a session
                    </LinkWithArrow>
                  </div>

                  <p className="text-sm text-foreground/70 mt-6">
                    Pay-as-you-go credits. $5 free for new users. No subscription traps.
                  </p>
                </GlassCard>
              </div>
            </div>
          </section>
        </main>
      </div>
    </React.Fragment>
  );
}