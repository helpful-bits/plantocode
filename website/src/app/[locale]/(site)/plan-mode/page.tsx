import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/GlassCard';
import { StructuredData } from '@/components/seo/StructuredData';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Code2, Terminal, GitMerge, Search, Zap } from 'lucide-react';
import type { SoftwareApplication, HowTo, FAQPage } from 'schema-dts';
import { cdnUrl } from '@/lib/cdn';

// Lazy load heavy components that aren't immediately visible
const VideoButtonOptimized = dynamic(() => import('@/components/ui/VideoButtonOptimized').then(mod => ({ default: mod.VideoButtonOptimized })), {
  loading: () => <Button variant="outline" size="lg" disabled>Loading...</Button>,
});
const FAQOptimized = dynamic(() => import('@/components/landing/FAQOptimized').then(mod => ({ default: mod.FAQOptimized })), {
  loading: () => <div className="py-12 text-center text-foreground/60">Loading FAQ...</div>,
});

import { loadMessagesFor, type Locale } from '@/lib/i18n';
import { locales } from '@/i18n/config';
import { generatePageMetadata } from '@/content/metadata';

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessagesFor(locale, ['common', 'pages']);

  return generatePageMetadata({
    locale,
    slug: '/plan-mode',
    title: t['planMode.meta.title'],
    description: t['planMode.meta.description'],
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
  });
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default async function HirePage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessagesFor(locale, ['common', 'pages']);
  const softwareApplicationJsonLd: SoftwareApplication = {
    '@type': 'SoftwareApplication',
    name: 'PlanToCode',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: ['Windows 10+', 'macOS 11.0+'],
    url: 'https://www.plantocode.com/plan-mode',
    description: 'Desktop planning workspace that helps you generate, merge, and execute implementation plans - then run them in an integrated terminal.',
    softwareVersion: '1.0.23',
    downloadUrl: 'https://www.plantocode.com/downloads',
    offers: {
      '@type': 'Offer',
      price: 0,
      priceCurrency: 'USD',
      description: 'Free app with pay-as-you-go API usage. $5 free credits on signup.',
      availability: 'https://schema.org/InStock',
    },
    creator: {
      '@type': 'Organization',
      name: 'PlanToCode',
      url: 'https://www.plantocode.com'
    },
    featureList: [
      'File Discovery',
      'Multi-Model AI Planning',
      'Plan Merge & Review',
      'Integrated Terminal'
    ]
  };

  const howToJsonLd: HowTo = {
    '@type': 'HowTo',
    name: 'Architectural planning workflow for AI coding tools',
    description: 'Generate, merge, and execute implementation plans with multi-model synthesis.',
    step: [
      {
        '@type': 'HowToStep',
        position: 1,
        name: 'File Discovery',
        text: 'Multi-stage workflow surfaces the right files before you plan',
      },
      {
        '@type': 'HowToStep',
        position: 2,
        name: 'Generate Plans',
        text: 'Run multiple models with different perspectives and token guardrails',
      },
      {
        '@type': 'HowToStep',
        position: 3,
        name: 'AI Merges + You Guide',
        text: 'Provide merge instructions, AI consolidates complementary details from multiple runs',
      },
      {
        '@type': 'HowToStep',
        position: 4,
        name: 'Execute',
        text: 'Run in terminal or paste into your AI coding tool',
      },
    ],
  };

  const faqJsonLd: FAQPage = {
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'How is this different from Codex CLI or Claude Code?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'PlanToCode provides architectural pre-planning before you use Codex, Claude Code, or Cursor. It adds file discovery, multi-model synthesis, and merge instructions that complement the execution phase of those tools.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I use this with my existing AI coding tool?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. PlanToCode works alongside Codex CLI, Claude Code, Cursor, and Windsurf. Generate plans in PlanToCode, then execute in your preferred tool with full context.',
        },
      },
      {
        '@type': 'Question',
        name: 'What does multi-model synthesis mean?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Run the same task multiple times with different AI models. Each run surfaces different implementation details. PlanToCode merges them into one comprehensive plan with source attribution.',
        },
      },
    ],
  };

  const realCircumstances = [
    {
      moment: t['planMode.circumstances.items.symptom.moment'] ?? '',
      progress: t['planMode.circumstances.items.symptom.progress'] ?? '',
      icon: <Search className="w-5 h-5" />
    },
    {
      moment: t['planMode.circumstances.items.plans.moment'] ?? '',
      progress: t['planMode.circumstances.items.plans.progress'] ?? '',
      icon: <Code2 className="w-5 h-5" />
    },
    {
      moment: t['planMode.circumstances.items.drift.moment'] ?? '',
      progress: t['planMode.circumstances.items.drift.progress'] ?? '',
      icon: <Zap className="w-5 h-5" />
    },
    {
      moment: t['planMode.circumstances.items.breaks.moment'] ?? '',
      progress: t['planMode.circumstances.items.breaks.progress'] ?? '',
      icon: <GitMerge className="w-5 h-5" />
    },
  ];

  const whatYouGet = [
    {
      capability: t['planMode.capabilities.know.capability'] ?? '',
      details: t['planMode.capabilities.know.details'] ?? '',
      link: '/docs/file-discovery'
    },
    {
      capability: t['planMode.capabilities.architect.capability'] ?? '',
      details: t['planMode.capabilities.architect.details'] ?? '',
      link: '/plan-mode'
    },
    {
      capability: t['planMode.capabilities.prompts.capability'] ?? '',
      details: t['planMode.capabilities.prompts.details'] ?? '',
      link: '/features/copy-buttons'
    },
    {
      capability: t['planMode.capabilities.execution.capability'] ?? '',
      details: t['planMode.capabilities.execution.details'] ?? '',
      link: '/features/integrated-terminal'
    },
  ];

  const workflow = [
    {
      step: t['planMode.workflow.discovery.step'] ?? '',
      description: t['planMode.workflow.discovery.description'] ?? '',
      icon: <Search className="w-5 h-5" />
    },
    {
      step: t['planMode.workflow.generate.step'] ?? '',
      description: t['planMode.workflow.generate.description'] ?? '',
      icon: <Code2 className="w-5 h-5" />
    },
    {
      step: t['planMode.workflow.merge.step'] ?? '',
      description: t['planMode.workflow.merge.description'] ?? '',
      icon: <GitMerge className="w-5 h-5" />
    },
    {
      step: t['planMode.workflow.execute.step'] ?? '',
      description: t['planMode.workflow.execute.description'] ?? '',
      icon: <Terminal className="w-5 h-5" />
    },
  ];

  const whyNowReasons = [
    {
      reason: t['planMode.whyNow.models.reason'] ?? '',
      detail: t['planMode.whyNow.models.detail'] ?? ''
    },
    {
      reason: t['planMode.whyNow.systems.reason'] ?? '',
      detail: t['planMode.whyNow.systems.detail'] ?? ''
    },
    {
      reason: t['planMode.whyNow.ide.reason'] ?? '',
      detail: t['planMode.whyNow.ide.detail'] ?? ''
    },
  ];

  const integrationPaths = [
    {
      name: t['planMode.integrations.codex.title'] ?? '',
      description: t['planMode.integrations.codex.description'] ?? '',
      href: '/plan-mode/codex',
      icon: <Terminal className="w-5 h-5 text-primary" />,
      link: t['planMode.integrations.codex.link'] ?? ''
    },
    {
      name: t['planMode.integrations.claude.title'] ?? '',
      description: t['planMode.integrations.claude.description'] ?? '',
      href: '/plan-mode/claude-code',
      icon: <GitMerge className="w-5 h-5 text-primary" />,
      link: t['planMode.integrations.claude.link'] ?? ''
    },
    {
      name: t['planMode.integrations.cursor.title'] ?? '',
      description: t['planMode.integrations.cursor.description'] ?? '',
      href: '/plan-mode/cursor',
      icon: <Code2 className="w-5 h-5 text-primary" />,
      link: t['planMode.integrations.cursor.link'] ?? ''
    },
  ];

  return (
    <>
      <StructuredData data={{ '@graph': [softwareApplicationJsonLd, howToJsonLd, faqJsonLd] }} />
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent">
        <Header />

        <main>
          <section className="py-16 sm:py-20 md:py-24 lg:py-32 px-4">
            <div className="container mx-auto max-w-6xl">
              {/* Hero */}
              <div className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6 text-sm font-medium">
                  <Terminal className="w-4 h-4" />
                  <span>{t['planMode.hero.badge']}</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  {t['planMode.hero.title']}
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed mb-6">
                  {t['planMode.hero.subtitle']}
                </p>
                <p className="text-base sm:text-lg text-foreground/80 mb-8">
                  <strong>{t['planMode.hero.insight'] || 'The complete planning pipeline:'}</strong><br/>
                  {t['planMode.hero.guidance'] || 'Voice → Text Improvement → Task Refinement → File Discovery (Root selection, Regex, AI Relevance, Extended Pathfinder) → Generate multiple plans (GPT-5/GPT-5.1, Gemini 3 Pro) → Merge → Execute in agents (Aider, Cursor, Claude Code, Codex)'}
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Button variant="cta" size="lg" asChild>
                    <Link href="/downloads">
                      {t['planMode.hero.install']}
                    </Link>
                  </Button>
                  <VideoButtonOptimized />
                </div>
                <p className="text-sm text-foreground/60 mt-4">
                  {t['planMode.hero.credits']}
                </p>
              </div>

              {/* Choose your IDE */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['planMode.integrations.title']}</h2>
                <div className="grid md:grid-cols-3 gap-6">
                  {integrationPaths.map((item, i) => (
                    <GlassCard key={i} className="p-6 h-full" highlighted>
                      <div className="flex items-start gap-3 mb-3">
                        <div className="mt-1">{item.icon}</div>
                        <div>
                          <h3 className="font-semibold text-lg">{item.name}</h3>
                        </div>
                      </div>
                      <p className="text-sm text-foreground/70 leading-relaxed mb-4">{item.description}</p>
                      <LinkWithArrow href={item.href} className="text-sm">
                        {item.link}
                      </LinkWithArrow>
                    </GlassCard>
                  ))}
                </div>
              </div>

              {/* Real circumstances */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['planMode.circumstances.title']}</h2>
                <div className="grid md:grid-cols-2 gap-6">
                  {realCircumstances.map((item, i) => (
                    <GlassCard key={i} className="p-6">
                      <div className="flex items-start gap-4">
                        <div className="text-primary mt-1">{item.icon}</div>
                        <div>
                          <div className="font-semibold text-lg mb-2">{item.moment}</div>
                          <div className="text-foreground/70">{item.progress}</div>
                        </div>
                      </div>
                    </GlassCard>
                  ))}
                </div>
                <div className="text-center mt-8">
                  <p className="text-foreground/80">
                    {t['planMode.circumstances.footer']}
                  </p>
                </div>
              </div>

              {/* What you actually get */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['planMode.capabilities.title']}</h2>
                <div className="grid md:grid-cols-2 gap-6">
                  {whatYouGet.map((item, i) => (
                    <GlassCard key={i} className="p-6" highlighted>
                      <h3 className="font-semibold text-lg mb-2">{item.capability}</h3>
                      <p className="text-sm text-foreground/70 mb-3">{item.details}</p>
                      <LinkWithArrow href={item.link} className="text-sm">
                        {t['planMode.capabilities.know.link']}
                      </LinkWithArrow>
                    </GlassCard>
                  ))}
                </div>
              </div>

              {/* Why now */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['planMode.whyNow.title']}</h2>
                <div className="space-y-4">
                  {whyNowReasons.map((item, i) => (
                    <GlassCard key={i} className="p-6">
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                          {i + 1}
                        </div>
                        <div>
                          <h3 className="font-semibold mb-1">{item.reason}</h3>
                          <p className="text-foreground/70">{item.detail}</p>
                        </div>
                      </div>
                    </GlassCard>
                  ))}
                </div>
              </div>

              {/* FAQ */}
              <div className="mb-16">
                <FAQOptimized />
              </div>

              {/* How it works */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['planMode.workflow.title']}</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {workflow.map((item, i) => (
                    <GlassCard key={i} className="p-6" highlighted>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="text-primary">{item.icon}</div>
                        <span className="font-semibold">{item.step}</span>
                      </div>
                      <p className="text-sm text-foreground/70">{item.description}</p>
                    </GlassCard>
                  ))}
                </div>
                <div className="mt-6 text-center">
                  <LinkWithArrow href="/how-it-works">
                    {t['planMode.workflow.link']}
                  </LinkWithArrow>
                </div>
              </div>

              {/* Who uses this */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['planMode.users.title']}</h2>
                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6">
                    <h3 className="font-semibold mb-2">{t['planMode.users.senior.title']}</h3>
                    <p className="text-sm text-foreground/70">
                      {t['planMode.users.senior.quote']}
                    </p>
                  </GlassCard>
                  <GlassCard className="p-6">
                    <h3 className="font-semibold mb-2">{t['planMode.users.cli.title']}</h3>
                    <p className="text-sm text-foreground/70">
                      {t['planMode.users.cli.quote']}
                    </p>
                  </GlassCard>
                  <GlassCard className="p-6">
                    <h3 className="font-semibold mb-2">{t['planMode.users.ide.title']}</h3>
                    <p className="text-sm text-foreground/70">
                      {t['planMode.users.ide.quote']}
                    </p>
                  </GlassCard>
                </div>
              </div>

              {/* The real progress you make */}
              <div className="mb-16 text-center">
                <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-6">{t['planMode.progress.title']}</h2>
                  <div className="space-y-6 max-w-2xl mx-auto">
                    <div>
                      <p className="text-lg font-semibold text-foreground mb-2">{t['planMode.progress.ship.title']}</p>
                      <p className="text-sm text-foreground/70">{t['planMode.progress.ship.description']}</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-foreground mb-2">{t['planMode.progress.guide.title']}</p>
                      <p className="text-sm text-foreground/70">{t['planMode.progress.guide.description']}</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-foreground mb-2">{t['planMode.progress.execute.title']}</p>
                      <p className="text-sm text-foreground/70">{t['planMode.progress.execute.description']}</p>
                    </div>
                    <p className="text-sm text-foreground/60 mt-8">
                      <em>{t['planMode.progress.quote']}</em>
                    </p>
                  </div>
                </GlassCard>
              </div>

              {/* CTA */}
              <div className="text-center">
                <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">{t['planMode.cta.title']}</h2>
                  <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                    {t['planMode.cta.subtitle']}
                  </p>

                  <PlatformDownloadSection location="hire_page" />

                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                    <LinkWithArrow href="/demo">
                      {t['planMode.cta.demo']}
                    </LinkWithArrow>
                    <span className="hidden sm:inline">•</span>
                    <LinkWithArrow href="/support#book">
                      {t['planMode.cta.book']}
                    </LinkWithArrow>
                  </div>
                  <p className="text-sm text-foreground/70 mt-6">
                    {t['planMode.cta.pricing']}
                  </p>
                </GlassCard>
              </div>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
