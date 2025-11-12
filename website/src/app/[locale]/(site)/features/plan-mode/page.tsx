import React from 'react';
import { Metadata } from 'next';
import { loadMessages, type Locale } from '@/lib/i18n';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { RelatedFeatures } from '@/components/RelatedContent';
import { Code2, Edit3, Save, FileText, CheckCircle2, Terminal, Layers, Brain, Zap, Copy, AlertCircle, Target } from 'lucide-react';
import { locales } from '@/i18n/config';
import { generatePageMetadata, COMMON_KEYWORDS, mergeKeywords } from '@/content/metadata';
export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return {
    ...generatePageMetadata({
      locale,
      slug: '/features/plan-mode',
      title: t['features.planMode.meta.title'],
      description: t['features.planMode.meta.description'],
    }),
    keywords: mergeKeywords(
      [
    'implementation plan',
    'ai code planning',
    'human-in-the-loop ai',
    'implementation plans',
    'ai development planning',
    'monaco editor ai',
    'plan generation',
    'plan execution',
    'terminal integration',
    'multi-model planning',
    'xml plan structure',
    'real-time streaming',
    'file context loading',
    'human in the loop',
    'hitl ai',
    'ai governance',
    'code review',
    'legacy code safety',
    'file by file plans',
    'corporate ai governance',
    'safe ai coding',
    'plan approval workflow',
  ],
      COMMON_KEYWORDS.core
    ),
  };
}
export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}
export default async function ImplementationPlansPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);
  const planModeGuides = [
    {
      name: t['planMode.guides.codex.name'] ?? '',
      description: t['planMode.guides.codex.description'] ?? '',
      href: '/plan-mode/codex',
      icon: <Terminal className="w-5 h-5 text-primary" />,
    },
    {
      name: t['planMode.guides.claudeCode.name'] ?? '',
      description: t['planMode.guides.claudeCode.description'] ?? '',
      href: '/plan-mode/claude-code',
      icon: <Layers className="w-5 h-5 text-primary" />,
    },
    {
      name: t['planMode.guides.cursor.name'] ?? '',
      description: t['planMode.guides.cursor.description'] ?? '',
      href: '/plan-mode/cursor',
      icon: <Code2 className="w-5 h-5 text-primary" />,
    },
  ];
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
                  <Layers className="w-4 h-4" />
                  <span>{t['planMode.hero.badge']}</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  {t['planMode.hero.title']}
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  {t['planMode.hero.description']}
                </p>
              </div>
              {/* Core Features Grid */}
              <div className="mb-16">
                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <Brain className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t['planMode.features.intelligentGeneration.title']}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['planMode.features.intelligentGeneration.description']}
                    </p>
                  </GlassCard>
                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <Code2 className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t['planMode.features.monacoEditor.title']}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['planMode.features.monacoEditor.description']}
                    </p>
                  </GlassCard>
                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <Terminal className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t['planMode.features.terminalExecution.title']}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['planMode.features.terminalExecution.description']}
                    </p>
                  </GlassCard>
                </div>
              </div>
              {/* Human-in-the-Loop Governance */}
              <div className="mb-16">
                <div className="text-center mb-8">
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">{t['planMode.humanInLoop.title']}</h2>
                  <p className="text-lg text-foreground/80 max-w-3xl mx-auto">
                    {t['planMode.humanInLoop.description']}
                  </p>
                </div>
                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <Edit3 className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t['planMode.humanInLoop.review.title']}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['planMode.humanInLoop.review.description']}
                    </p>
                  </GlassCard>
                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <CheckCircle2 className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t['planMode.humanInLoop.edit.title']}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['planMode.humanInLoop.edit.description']}
                    </p>
                  </GlassCard>
                  <GlassCard className="p-6" highlighted>
                    <div className="text-primary mb-3">
                      <Target className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t['planMode.humanInLoop.approve.title']}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['planMode.humanInLoop.approve.description']}
                    </p>
                  </GlassCard>
                </div>
              </div>
              {/* File-by-File Granularity for Maximum Safety */}
              <div className="mb-16">
                <div className="text-center mb-8">
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">{t['planMode.fileByFile.title']}</h2>
                  <p className="text-lg text-foreground/80 max-w-3xl mx-auto">
                    {t['planMode.fileByFile.description']}
                  </p>
                </div>
                <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                  <GlassCard className="p-8">
                    <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                      <FileText className="w-6 h-6 text-primary" />
                      {t['planMode.fileByFile.exactPaths.title']}
                    </h3>
                    <p className="text-foreground/80 mb-4">
                      {t['planMode.fileByFile.exactPaths.description']}
                    </p>
                    <div className="bg-black/50 rounded-lg p-4 font-mono text-xs space-y-1">
                      <div className="text-green-400">src/components/auth/LoginForm.tsx</div>
                      <div className="text-yellow-400">src/api/handlers/user_handlers.rs</div>
                      <div className="text-cyan-400">server/migrations/add_mfa_columns.sql</div>
                    </div>
                  </GlassCard>
                  <GlassCard className="p-8">
                    <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                      <AlertCircle className="w-6 h-6 text-primary" />
                      {t['planMode.fileByFile.preventRegressions.title']}
                    </h3>
                    <p className="text-foreground/80 mb-4">
                      {t['planMode.fileByFile.preventRegressions.description']}
                    </p>
                    <ul className="space-y-2 text-foreground/70">
                      {((t['planMode.fileByFile.preventRegressions.features'] ?? []) as string[]).map((feature: string, index: number) => (
                        <li key={index} className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </GlassCard>
                </div>
              </div>
              {/* Plan Generation Deep Dive */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['planMode.generation.title']}</h2>
                <div className="grid md:grid-cols-2 gap-8">
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <FileText className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['planMode.generation.fullContext.title']}</h3>
                        <p className="text-foreground/80 mb-4">
                          {t['planMode.generation.fullContext.description']}
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          {((t['planMode.generation.fullContext.features'] ?? []) as string[]).map((feature: string, index: number) => (
                            <li key={index} className="flex items-start gap-2">
                              <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                              <span>{feature}</span>
                            </li>
                          ))}
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
                        <h3 className="text-xl font-bold mb-3">{t['planMode.generation.multiModel.title']}</h3>
                        <p className="text-foreground/80 mb-4">
                          {t['planMode.generation.multiModel.description']}
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          {((t['planMode.generation.multiModel.features'] ?? []) as string[]).map((feature: string, index: number) => (
                            <li key={index} className="flex items-start gap-2">
                              <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Zap className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['planMode.generation.streaming.title']}</h3>
                        <p className="text-foreground/80 mb-4">
                          {t['planMode.generation.streaming.description']}
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          {((t['planMode.generation.streaming.features'] ?? []) as string[]).map((feature: string, index: number) => (
                            <li key={index} className="flex items-start gap-2">
                              <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Layers className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['planMode.generation.xmlFormat.title']}</h3>
                        <p className="text-foreground/80 mb-4">
                          {t['planMode.generation.xmlFormat.description']}
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          {((t['planMode.generation.xmlFormat.features'] ?? []) as string[]).map((feature: string, index: number) => (
                            <li key={index} className="flex items-start gap-2">
                              <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>
              {/* Editor and Execution */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['planMode.editing.title']}</h2>
                <div className="grid md:grid-cols-2 gap-8">
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Edit3 className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['planMode.editing.monaco.title']}</h3>
                        <p className="text-foreground/80 mb-4">
                          {t['planMode.editing.monaco.description']}
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          {((t['planMode.editing.monaco.features'] ?? []) as string[]).map((feature: string, index: number) => (
                            <li key={index} className="flex items-start gap-2">
                              <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Terminal className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['planMode.editing.terminal.title']}</h3>
                        <p className="text-foreground/80 mb-4">
                          {t['planMode.editing.terminal.description']}
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          {((t['planMode.editing.terminal.features'] ?? []) as string[]).map((feature: string, index: number) => (
                            <li key={index} className="flex items-start gap-2">
                              <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>
              {/* Copy Button System */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['planMode.copyButtons.title']}</h2>
                <div className="grid md:grid-cols-2 gap-6">
                  <GlassCard className="p-6 bg-gray-900/50 dark:bg-black/50">
                    <h3 className="text-lg font-semibold mb-3 text-primary">{t['planMode.copyButtons.serverConfigured.title']}</h3>
                    <p className="text-foreground/80 text-sm mb-4">
                      {t['planMode.copyButtons.serverConfigured.description']}
                    </p>
                    <div className="bg-black/70 dark:bg-black/50 rounded-lg p-4 font-mono text-xs space-y-1">
                      <div className="text-green-400">Button: "Parallel Claude Agents"</div>
                      <div className="text-yellow-400">Template: "{`{{IMPLEMENTATION_PLAN}}`}"</div>
                      <div className="text-cyan-400">+ Custom instructions...</div>
                    </div>
                  </GlassCard>
                  <GlassCard className="p-6 bg-gray-900/50 dark:bg-black/50">
                    <h3 className="text-lg font-semibold mb-3 text-primary">{t['planMode.copyButtons.stepExtraction.title']}</h3>
                    <p className="text-foreground/80 text-sm mb-4">
                      {t['planMode.copyButtons.stepExtraction.description']}
                    </p>
                    <div className="bg-black/70 dark:bg-black/50 rounded-lg p-4 font-mono text-xs space-y-1">
                      <div className="text-green-400">Copy Step 3</div>
                      <div className="text-yellow-400">Copy All Steps</div>
                      <div className="text-cyan-400">Copy with Instructions</div>
                    </div>
                  </GlassCard>
                </div>
              </div>
              {/* Complete Workflow */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['planMode.workflow.title']}</h2>
                <div className="space-y-4 max-w-3xl mx-auto">
                  {((t['planMode.workflow.steps'] ?? []) as Array<{ title: string; description: string }>).map((step: { title: string; description: string }, index: number) => (
                    <GlassCard key={index} className="p-6">
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                          {index + 1}
                        </div>
                        <div>
                          <h3 className="font-semibold mb-2">{step.title}</h3>
                          <p className="text-foreground/80">
                            {step.description}
                          </p>
                        </div>
                      </div>
                    </GlassCard>
                  ))}
                </div>
              </div>
              {/* Plan Mode Guides */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['planMode.guides.title']}</h2>
                <div className="grid md:grid-cols-3 gap-6">
                  {planModeGuides.map((guide, index) => (
                    <GlassCard key={index} className="p-6 h-full" highlighted>
                      <div className="flex items-start gap-3 mb-3">
                        <div className="mt-1">{guide.icon}</div>
                        <h3 className="text-lg font-semibold">{guide.name}</h3>
                      </div>
                      <p className="text-sm text-foreground/70 leading-relaxed mb-4">{guide.description}</p>
                      <LinkWithArrow href={guide.href} className="text-sm">
                        {index === 0 ? (t['planMode.guides.codex.link'] ?? '') : index === 1 ? (t['planMode.guides.claudeCode.link'] ?? '') : (t['planMode.guides.cursor.link'] ?? '')}
                      </LinkWithArrow>
                    </GlassCard>
                  ))}
                </div>
              </div>
              {/* Technical Details */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['planMode.technical.title']}</h2>
                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6">
                    <AlertCircle className="w-6 h-6 text-primary mb-3" />
                    <h3 className="text-lg font-semibold mb-2">{t['planMode.technical.noTruncation.title']}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['planMode.technical.noTruncation.description']}
                    </p>
                  </GlassCard>
                  <GlassCard className="p-6">
                    <Save className="w-6 h-6 text-primary mb-3" />
                    <h3 className="text-lg font-semibold mb-2">{t['planMode.technical.persistence.title']}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['planMode.technical.persistence.description']}
                    </p>
                  </GlassCard>
                  <GlassCard className="p-6">
                    <Copy className="w-6 h-6 text-primary mb-3" />
                    <h3 className="text-lg font-semibold mb-2">{t['planMode.technical.templates.title']}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['planMode.technical.templates.description']}
                    </p>
                  </GlassCard>
                </div>
              </div>

              {/* Related Features */}
              <RelatedFeatures currentSlug="features/plan-mode" maxItems={3} />

              {/* CTA */}
              <div className="text-center">
                <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">{t['planMode.cta.title']}</h2>
                  <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                    {t['planMode.cta.description']}
                  </p>
                  <PlatformDownloadSection location="features_implementation_plans" />
                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                    <LinkWithArrow href="/features/merge-instructions">
                      {t['planMode.cta.links.mergePlans']}
                    </LinkWithArrow>
                    <span className="hidden sm:inline">•</span>
                    <LinkWithArrow href="/features/integrated-terminal">
                      {t['planMode.cta.links.terminal']}
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
