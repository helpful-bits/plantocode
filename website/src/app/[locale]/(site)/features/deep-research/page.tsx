import React from 'react';
import { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Search, Globe, Database, Brain, Zap, Shield, CheckCircle2, Network, TrendingUp, FileText, Filter, Clock } from 'lucide-react';
import { cdnUrl } from '@/lib/cdn';
import { loadMessages, type Locale } from '@/lib/i18n';
import { locales } from '@/i18n/config';
export const metadata: Metadata = {
  title: 'Deep research - web search for developers',
  description: 'AI research assistant generates sophisticated queries and parallel tasks. Context-aware analysis with project integration.',
  keywords: [
    'ai web search',
    'intelligent research',
    'information synthesis',
    'source verification',
    'credibility analysis',
    'multi-source research',
    'development research',
    'smart query generation',
    'real-time search',
    'research workflow',
    'web intelligence',
    'ai research assistant',
  ],
  openGraph: {
    title: 'Deep Research - Intelligent Web Search for Development',
    description: 'AI-powered research assistant with intelligent query generation and parallel research execution. Transform your development workflow with context-aware research insights.',
    url: 'https://www.plantocode.com/features/deep-research',
    siteName: 'PlanToCode',
    type: 'website',
    locale: 'en_US',
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
  },
  alternates: {
    canonical: 'https://www.plantocode.com/features/deep-research',
    languages: {
      'en-US': 'https://www.plantocode.com/features/deep-research',
      'en': 'https://www.plantocode.com/features/deep-research',
    },
  },
};
export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}
export default async function DeepResearchPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);
  return (
    <React.Fragment>
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
                  <span>{t['deepResearch.hero.badge']}</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  {t['deepResearch.hero.title']}
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  {t['deepResearch.hero.description']}
                </p>
              </div>
              {/* Core Features Grid */}
              <div className="mb-16">
                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <Brain className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t['deepResearch.features.queryGeneration.title']}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['deepResearch.features.queryGeneration.description']}
                    </p>
                  </GlassCard>
                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <Network className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t['deepResearch.features.parallelExecution.title']}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['deepResearch.features.parallelExecution.description']}
                    </p>
                  </GlassCard>
                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <Shield className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t['deepResearch.features.projectIntegration.title']}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['deepResearch.features.projectIntegration.description']}
                    </p>
                  </GlassCard>
                </div>
              </div>
              {/* Research Intelligence System */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['deepResearch.intelligence.title']}</h2>
                <div className="grid md:grid-cols-2 gap-8">
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Search className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['deepResearch.intelligence.queryExpansion.title']}</h3>
                        <p className="text-foreground/80 mb-4">
                          {t['deepResearch.intelligence.queryExpansion.description']}
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['deepResearch.intelligence.queryExpansion.features.0']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['deepResearch.intelligence.queryExpansion.features.1']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['deepResearch.intelligence.queryExpansion.features.2']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['deepResearch.intelligence.queryExpansion.features.3']}</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Globe className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['deepResearch.intelligence.execution.title']}</h3>
                        <p className="text-foreground/80 mb-4">
                          {t['deepResearch.intelligence.execution.description']}
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['deepResearch.intelligence.execution.features.0']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['deepResearch.intelligence.execution.features.1']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['deepResearch.intelligence.execution.features.2']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['deepResearch.intelligence.execution.features.3']}</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Database className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['deepResearch.intelligence.synthesis.title']}</h3>
                        <p className="text-foreground/80 mb-4">
                          {t['deepResearch.intelligence.synthesis.description']}
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['deepResearch.intelligence.synthesis.features.0']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['deepResearch.intelligence.synthesis.features.1']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['deepResearch.intelligence.synthesis.features.2']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['deepResearch.intelligence.synthesis.features.3']}</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <TrendingUp className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['deepResearch.intelligence.contextIntegration.title']}</h3>
                        <p className="text-foreground/80 mb-4">
                          {t['deepResearch.intelligence.contextIntegration.description']}
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['deepResearch.intelligence.contextIntegration.features.0']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['deepResearch.intelligence.contextIntegration.features.1']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['deepResearch.intelligence.contextIntegration.features.2']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['deepResearch.intelligence.contextIntegration.features.3']}</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>
              {/* Research Workflow */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['deepResearch.process.title']}</h2>
                <div className="space-y-4 max-w-3xl mx-auto">
                  <GlassCard className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                        1
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">{t['deepResearch.process.stage1.title']}</h3>
                        <p className="text-foreground/80">
                          {t['deepResearch.process.stage1.description']}
                        </p>
                      </div>
                    </div>
                  </GlassCard>
                  <GlassCard className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                        2
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">{t['deepResearch.process.stage2.title']}</h3>
                        <p className="text-foreground/80">
                          {t['deepResearch.process.stage2.description']}
                        </p>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>
              {/* Development Integration */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['deepResearch.developmentFocus.title']}</h2>
                <div className="grid md:grid-cols-2 gap-8">
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <FileText className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['deepResearch.developmentFocus.implementationReady.title']}</h3>
                        <p className="text-foreground/80 mb-4">
                          {t['deepResearch.developmentFocus.implementationReady.description']}
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <Zap className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['deepResearch.developmentFocus.implementationReady.features.0']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Zap className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['deepResearch.developmentFocus.implementationReady.features.1']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Zap className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['deepResearch.developmentFocus.implementationReady.features.2']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Zap className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['deepResearch.developmentFocus.implementationReady.features.3']}</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Filter className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['deepResearch.developmentFocus.contextFiltering.title']}</h3>
                        <p className="text-foreground/80 mb-4">
                          {t['deepResearch.developmentFocus.contextFiltering.description']}
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          <li className="flex items-start gap-2">
                            <Clock className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['deepResearch.developmentFocus.contextFiltering.features.0']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Clock className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['deepResearch.developmentFocus.contextFiltering.features.1']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Clock className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['deepResearch.developmentFocus.contextFiltering.features.2']}</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <Clock className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>{t['deepResearch.developmentFocus.contextFiltering.features.3']}</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>
              {/* AI Research Features */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['deepResearch.aiCapabilities.title']}</h2>
                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6 bg-gray-900/50 dark:bg-black/50">
                    <h3 className="text-lg font-semibold mb-3 text-primary">{t['deepResearch.aiCapabilities.multiModel.title']}</h3>
                    <p className="text-foreground/80 text-sm mb-4">
                      {t['deepResearch.aiCapabilities.multiModel.description']}
                    </p>
                    <div className="bg-black/70 dark:bg-black/50 rounded-lg p-4 font-mono text-xs space-y-1">
                      <div className="text-green-400">{t['deepResearch.aiCapabilities.multiModel.models.0']}</div>
                      <div className="text-yellow-400">{t['deepResearch.aiCapabilities.multiModel.models.1']}</div>
                      <div className="text-cyan-400">{t['deepResearch.aiCapabilities.multiModel.models.2']}</div>
                      <div className="text-purple-400">{t['deepResearch.aiCapabilities.multiModel.models.3']}</div>
                    </div>
                  </GlassCard>
                  <GlassCard className="p-6 bg-gray-900/50 dark:bg-black/50">
                    <h3 className="text-lg font-semibold mb-3 text-primary">{t['deepResearch.aiCapabilities.projectContext.title']}</h3>
                    <p className="text-foreground/80 text-sm mb-4">
                      {t['deepResearch.aiCapabilities.projectContext.description']}
                    </p>
                    <div className="bg-black/70 dark:bg-black/50 rounded-lg p-4 font-mono text-xs space-y-1">
                      <div className="text-green-400">{t['deepResearch.aiCapabilities.projectContext.features.0']}</div>
                      <div className="text-yellow-400">{t['deepResearch.aiCapabilities.projectContext.features.1']}</div>
                      <div className="text-red-400">{t['deepResearch.aiCapabilities.projectContext.features.2']}</div>
                      <div className="text-cyan-400">{t['deepResearch.aiCapabilities.projectContext.features.3']}</div>
                    </div>
                  </GlassCard>
                  <GlassCard className="p-6 bg-gray-900/50 dark:bg-black/50">
                    <h3 className="text-lg font-semibold mb-3 text-primary">{t['deepResearch.aiCapabilities.parallel.title']}</h3>
                    <p className="text-foreground/80 text-sm mb-4">
                      {t['deepResearch.aiCapabilities.parallel.description']}
                    </p>
                    <div className="bg-black/70 dark:bg-black/50 rounded-lg p-4 font-mono text-xs space-y-1">
                      <div className="text-green-400">{t['deepResearch.aiCapabilities.parallel.features.0']}</div>
                      <div className="text-yellow-400">{t['deepResearch.aiCapabilities.parallel.features.1']}</div>
                      <div className="text-orange-400">{t['deepResearch.aiCapabilities.parallel.features.2']}</div>
                      <div className="text-cyan-400">{t['deepResearch.aiCapabilities.parallel.features.3']}</div>
                    </div>
                  </GlassCard>
                </div>
              </div>
              {/* Advanced Capabilities */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['deepResearch.advanced.title']}</h2>
                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3">{t['deepResearch.advanced.features.0.title']}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['deepResearch.advanced.features.0.description']}
                    </p>
                  </GlassCard>
                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3">{t['deepResearch.advanced.features.1.title']}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['deepResearch.advanced.features.1.description']}
                    </p>
                  </GlassCard>
                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3">{t['deepResearch.advanced.features.2.title']}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['deepResearch.advanced.features.2.description']}
                    </p>
                  </GlassCard>
                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3">{t['deepResearch.advanced.features.3.title']}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['deepResearch.advanced.features.3.description']}
                    </p>
                  </GlassCard>
                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3">{t['deepResearch.advanced.features.4.title']}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['deepResearch.advanced.features.4.description']}
                    </p>
                  </GlassCard>
                  <GlassCard className="p-6">
                    <h3 className="text-lg font-semibold mb-3">{t['deepResearch.advanced.features.5.title']}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['deepResearch.advanced.features.5.description']}
                    </p>
                  </GlassCard>
                </div>
              </div>
              {/* CTA */}
              <div className="text-center">
                <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">{t['deepResearch.cta.title']}</h2>
                  <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                    {t['deepResearch.cta.description']}
                  </p>
                  <PlatformDownloadSection location="features_deep_research" />
                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                    <LinkWithArrow href="/features/plan-mode">
                      {t['deepResearch.cta.links.planMode']}
                    </LinkWithArrow>
                    <span className="hidden sm:inline">•</span>
                    <LinkWithArrow href="/features/text-improvement">
                      {t['deepResearch.cta.links.textImprovement']}
                    </LinkWithArrow>
                  </div>
                </GlassCard>
              </div>
            </div>
          </section>
        </main>
      </div>
    </React.Fragment>
  );
}
