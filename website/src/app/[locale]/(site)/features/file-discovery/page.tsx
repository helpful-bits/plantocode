import { Metadata } from 'next';

import { loadMessages, type Locale } from '@/lib/i18n';
import { Header } from '@/components/landing/Header';
import { GlassCard } from '@/components/ui/GlassCard';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { RelatedFeatures } from '@/components/RelatedContent';
import { Search, Workflow, Target, DollarSign, GitBranch, CheckCircle2, Brain, Layers, Zap } from 'lucide-react';
import { generatePageMetadata, COMMON_KEYWORDS, mergeKeywords, generateHowToSchema } from '@/content/metadata';
import { locales } from '@/i18n/config';
import { StructuredData } from '@/components/seo/StructuredData';

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return {
    ...generatePageMetadata({
      locale,
      slug: '/features/file-discovery',
      title: t['features.fileDiscovery.meta.title'],
      description: t['features.fileDiscovery.meta.description'],
    }),
    keywords: mergeKeywords(
      [
        'ai file discovery',
        'intelligent file selection',
        'repository navigation',
        'multi-stage workflow',
        'code analysis',
        'file filtering',
        'git optimization',
        'project context',
        'implementation plans',
        'cost effective ai',
      ],
      COMMON_KEYWORDS.core,
      COMMON_KEYWORDS.features
    ),
  };
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default async function FileDiscoveryFeaturePage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);

  const howToJsonLd = generateHowToSchema({
    name: 'AI File Discovery Workflow',
    description: 'Multi-stage workflow to identify relevant files and dependencies for implementation planning',
    steps: [
      {
        name: 'Project Scan',
        text: 'AI analyzes your repository structure and generates targeted search patterns based on your task description'
      },
      {
        name: 'Smart Filtering',
        text: 'Filters out non-essential files using .gitignore rules and project-specific patterns'
      },
      {
        name: 'Relevance Scoring',
        text: 'Ranks files by relevance to your task using semantic analysis and dependency mapping'
      },
      {
        name: 'Selection & Review',
        text: 'Review scored files, adjust selections, and add them to your planning session'
      }
    ]
  });

  return (
    <>
      <StructuredData data={howToJsonLd} />
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />

      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />

        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 lg:py-32 px-4">
            <div className="container mx-auto max-w-6xl">
              {/* Hero */}
              <div className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6 text-sm font-medium">
                  <Search className="w-4 h-4" />
                  <span>{t['fileDiscovery.hero.badge']}</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  {t['fileDiscovery.hero.title']}
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  {t['fileDiscovery.hero.description']}
                </p>
              </div>

              {/* Core Benefits Grid */}
              <div className="mb-16">
                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <Brain className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t['fileDiscovery.benefits.multiStage.title']}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['fileDiscovery.benefits.multiStage.description']}
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <DollarSign className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t['fileDiscovery.benefits.costEffective.title']}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['fileDiscovery.benefits.costEffective.description']}
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <Zap className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t['fileDiscovery.benefits.realTimeProgress.title']}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['fileDiscovery.benefits.realTimeProgress.description']}
                    </p>
                  </GlassCard>
                </div>
              </div>

              {/* 4-Stage Workflow */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['fileDiscovery.workflow.title']}</h2>

                <div className="space-y-6 max-w-4xl mx-auto">
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center font-bold">
                        1
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['fileDiscovery.workflow.stage1.title']}</h3>
                        <p className="text-foreground/80 mb-4">
                          {t['fileDiscovery.workflow.stage1.description']}
                        </p>
                        <ul className="space-y-2 text-foreground/70 text-sm">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['fileDiscovery.workflow.stage1.features.0']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['fileDiscovery.workflow.stage1.features.1']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['fileDiscovery.workflow.stage1.features.2']}</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center font-bold">
                        2
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['fileDiscovery.workflow.stage2.title']}</h3>
                        <p className="text-foreground/80 mb-4">
                          {t['fileDiscovery.workflow.stage2.description']}
                        </p>
                        <ul className="space-y-2 text-foreground/70 text-sm">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['fileDiscovery.workflow.stage2.features.0']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['fileDiscovery.workflow.stage2.features.1']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['fileDiscovery.workflow.stage2.features.2']}</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center font-bold">
                        3
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['fileDiscovery.workflow.stage3.title']}</h3>
                        <p className="text-foreground/80 mb-4">
                          {t['fileDiscovery.workflow.stage3.description']}
                        </p>
                        <ul className="space-y-2 text-foreground/70 text-sm">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['fileDiscovery.workflow.stage3.features.0']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['fileDiscovery.workflow.stage3.features.1']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['fileDiscovery.workflow.stage3.features.2']}</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground flex items-center justify-center font-bold">
                        4
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['fileDiscovery.workflow.stage4.title']}</h3>
                        <p className="text-foreground/80 mb-4">
                          {t['fileDiscovery.workflow.stage4.description']}
                        </p>
                        <ul className="space-y-2 text-foreground/70 text-sm">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['fileDiscovery.workflow.stage4.features.0']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['fileDiscovery.workflow.stage4.features.1']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['fileDiscovery.workflow.stage4.features.2']}</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>

              {/* Technical Capabilities */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['fileDiscovery.capabilities.title']}</h2>

                <div className="grid md:grid-cols-2 gap-8">
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <Target className="w-8 h-8 text-primary flex-shrink-0" />
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['fileDiscovery.capabilities.tokenManagement.title']}</h3>
                        <p className="text-foreground/80 mb-4">
                          {t['fileDiscovery.capabilities.tokenManagement.description']}
                        </p>
                        <ul className="space-y-2 text-foreground/70 text-sm">
                          <li>{t['fileDiscovery.capabilities.tokenManagement.features.0']}</li>
                          <li>{t['fileDiscovery.capabilities.tokenManagement.features.1']}</li>
                          <li>{t['fileDiscovery.capabilities.tokenManagement.features.2']}</li>
                          <li>{t['fileDiscovery.capabilities.tokenManagement.features.3']}</li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <Workflow className="w-8 h-8 text-primary flex-shrink-0" />
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['fileDiscovery.capabilities.workflow.title']}</h3>
                        <p className="text-foreground/80 mb-4">
                          {t['fileDiscovery.capabilities.workflow.description']}
                        </p>
                        <ul className="space-y-2 text-foreground/70 text-sm">
                          <li>{t['fileDiscovery.capabilities.workflow.features.0']}</li>
                          <li>{t['fileDiscovery.capabilities.workflow.features.1']}</li>
                          <li>{t['fileDiscovery.capabilities.workflow.features.2']}</li>
                          <li>{t['fileDiscovery.capabilities.workflow.features.3']}</li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <GitBranch className="w-8 h-8 text-primary flex-shrink-0" />
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['fileDiscovery.capabilities.git.title']}</h3>
                        <p className="text-foreground/80 mb-4">
                          {t['fileDiscovery.capabilities.git.description']}
                        </p>
                        <ul className="space-y-2 text-foreground/70 text-sm">
                          <li>{t['fileDiscovery.capabilities.git.features.0']}</li>
                          <li>{t['fileDiscovery.capabilities.git.features.1']}</li>
                          <li>{t['fileDiscovery.capabilities.git.features.2']}</li>
                          <li>{t['fileDiscovery.capabilities.git.features.3']}</li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <Layers className="w-8 h-8 text-primary flex-shrink-0" />
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['fileDiscovery.capabilities.planIntegration.title']}</h3>
                        <p className="text-foreground/80 mb-4">
                          {t['fileDiscovery.capabilities.planIntegration.description']}
                        </p>
                        <ul className="space-y-2 text-foreground/70 text-sm">
                          <li>{t['fileDiscovery.capabilities.planIntegration.features.0']}</li>
                          <li>{t['fileDiscovery.capabilities.planIntegration.features.1']}</li>
                          <li>{t['fileDiscovery.capabilities.planIntegration.features.2']}</li>
                          <li>{t['fileDiscovery.capabilities.planIntegration.features.3']}</li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>

              {/* Cost and Performance */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['fileDiscovery.performance.title']}</h2>

                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6 bg-green-500/5 dark:bg-green-900/30 border-green-500/20 dark:border-green-400/30">
                    <DollarSign className="w-8 h-8 text-green-600 dark:text-green-300 mb-3" />
                    <h3 className="text-lg font-semibold mb-2 text-green-700 dark:text-green-200">{t['fileDiscovery.performance.cost.title']}</h3>
                    <div className="text-2xl font-bold text-green-600 dark:text-green-300 mb-2">{t['fileDiscovery.performance.cost.value']}</div>
                    <p className="text-green-700/70 dark:text-green-200/90 text-sm">
                      {t['fileDiscovery.performance.cost.description']}
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6 bg-blue-500/5 dark:bg-blue-900/30 border-blue-500/20 dark:border-blue-400/30">
                    <Zap className="w-8 h-8 text-blue-600 dark:text-blue-300 mb-3" />
                    <h3 className="text-lg font-semibold mb-2 text-blue-700 dark:text-blue-200">{t['fileDiscovery.performance.speed.title']}</h3>
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-300 mb-2">{t['fileDiscovery.performance.speed.value']}</div>
                    <p className="text-blue-700/70 dark:text-blue-200/90 text-sm">
                      {t['fileDiscovery.performance.speed.description']}
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6 bg-purple-500/5 dark:bg-purple-900/30 border-purple-500/20 dark:border-purple-400/30">
                    <Target className="w-8 h-8 text-purple-600 dark:text-purple-300 mb-3" />
                    <h3 className="text-lg font-semibold mb-2 text-purple-700 dark:text-purple-200">{t['fileDiscovery.performance.accuracy.title']}</h3>
                    <div className="text-2xl font-bold text-purple-600 dark:text-purple-300 mb-2">{t['fileDiscovery.performance.accuracy.value']}</div>
                    <p className="text-purple-700/70 dark:text-purple-200/90 text-sm">
                      {t['fileDiscovery.performance.accuracy.description']}
                    </p>
                  </GlassCard>
                </div>
              </div>

              {/* Related Features */}
              <RelatedFeatures currentSlug="features/file-discovery" maxItems={3} />

              {/* Call to Action */}
              <div className="text-center">
                <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">{t['fileDiscovery.cta.title']}</h2>
                  <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                    {t['fileDiscovery.cta.description']}
                  </p>

                  <PlatformDownloadSection location="file_discovery_feature" redirectToDownloadPage />

                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                    <LinkWithArrow href="/features/plan-mode">
                      {t['fileDiscovery.cta.links.planMode']}
                    </LinkWithArrow>
                    <span className="hidden sm:inline">•</span>
                    <LinkWithArrow href="/docs/file-discovery">
                      {t['fileDiscovery.cta.links.docs']}
                    </LinkWithArrow>
                  </div>
                </GlassCard>
              </div>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
