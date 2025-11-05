import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { cdnUrl } from '@/lib/cdn';
import type { Metadata } from 'next';
import { loadMessages, type Locale } from '@/lib/i18n';
import { locales } from '@/i18n/config';
export const metadata: Metadata = {
  title: 'Legacy Code Refactoring - AI Safe Modernization',
  description: 'Refactor legacy code safely with AI planning. Map dependencies, generate migration strategies, and modernize 100K+ line codebases without breaking production.',
  keywords: [
    'legacy code refactoring tools',
    'legacy code refactoring',
    'refactor legacy code',
    'modernize legacy code',
    'ai refactoring',
    'code modernization',
  ],
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: 'https://www.plantocode.com/solutions/legacy-code-refactoring',
    languages: {
      'en-US': 'https://www.plantocode.com/solutions/legacy-code-refactoring',
      'en': 'https://www.plantocode.com/solutions/legacy-code-refactoring',
      'x-default': 'https://www.plantocode.com/solutions/legacy-code-refactoring',
    },
  },
  openGraph: {
    title: 'Legacy Code Refactoring - AI Safe Modernization',
    description: 'Refactor legacy code safely with AI planning. Map dependencies, generate migration strategies without breaking production.',
    url: 'https://www.plantocode.com/solutions/legacy-code-refactoring',
    siteName: 'PlanToCode',
    type: 'article',
    locale: 'en_US',
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - Legacy Code Refactoring',
    }],
  },
};
export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}
export default async function LegacyCodeRefactoringPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main className="container mx-auto px-4 py-16 max-w-4xl">
        <article className="prose prose-invert prose-lg max-w-none">
          <h1 className="text-4xl font-bold mb-6">
            {t['solutions.legacyCodeRefactoring.title'] ?? ''}
          </h1>
          <p className="text-xl text-foreground/80 mb-8">
            {t['solutions.legacyCodeRefactoring.description'] ?? ''}
          </p>
          <GlassCard className="my-8 bg-red-500/10 border-red-500/20">
            <h2 className="text-2xl font-bold mb-4">{t['solutions.legacyCodeRefactoring.challenge.title'] ?? ''}</h2>
            <p className="mb-0">
              {t['solutions.legacyCodeRefactoring.challenge.description'] ?? ''}
            </p>
          </GlassCard>
          <h2 className="text-3xl font-bold mt-12 mb-6">{t['solutions.legacyCodeRefactoring.whyBreaks.title'] ?? ''}</h2>
          <p>{t['solutions.legacyCodeRefactoring.whyBreaks.description'] ?? ''}</p>
          <div className="grid md:grid-cols-2 gap-6 my-8">
            <GlassCard className="bg-foreground/5">
              <h3 className="text-lg font-semibold mb-2">🔗 {t['solutions.legacyCodeRefactoring.whyBreaks.points.hiddenDeps.title'] ?? ''}</h3>
              <p className="text-sm">
                {t['solutions.legacyCodeRefactoring.whyBreaks.points.hiddenDeps.description'] ?? ''}
              </p>
            </GlassCard>
            <GlassCard className="bg-foreground/5">
              <h3 className="text-lg font-semibold mb-2">📄 {t['solutions.legacyCodeRefactoring.whyBreaks.points.poorDocs.title'] ?? ''}</h3>
              <p className="text-sm">
                {t['solutions.legacyCodeRefactoring.whyBreaks.points.poorDocs.description'] ?? ''}
              </p>
            </GlassCard>
            <GlassCard className="bg-foreground/5">
              <h3 className="text-lg font-semibold mb-2">🧪 {t['solutions.legacyCodeRefactoring.whyBreaks.points.insufficientTests.title'] ?? ''}</h3>
              <p className="text-sm">
                {t['solutions.legacyCodeRefactoring.whyBreaks.points.insufficientTests.description'] ?? ''}
              </p>
            </GlassCard>
            <GlassCard className="bg-foreground/5">
              <h3 className="text-lg font-semibold mb-2">⚙️ {t['solutions.legacyCodeRefactoring.whyBreaks.points.outdatedPatterns.title'] ?? ''}</h3>
              <p className="text-sm">
                {t['solutions.legacyCodeRefactoring.whyBreaks.points.outdatedPatterns.description'] ?? ''}
              </p>
            </GlassCard>
          </div>
          <h2 className="text-3xl font-bold mt-12 mb-6">{t['solutions.legacyCodeRefactoring.scenarios.title'] ?? ''}</h2>
          <GlassCard className="my-8">
            <h3 className="text-xl font-semibold mb-4">1. {t['solutions.legacyCodeRefactoring.scenarios.frameworkMigration.title'] ?? ''}</h3>
            <p className="mb-3 text-sm">
              <strong>Challenge:</strong> {t['solutions.legacyCodeRefactoring.scenarios.frameworkMigration.challenge'] ?? ''}
            </p>
            <div className="bg-foreground/5 rounded-lg p-3">
              <p className="text-sm font-semibold mb-2">{t['solutions.legacyCodeRefactoring.scenarios.frameworkMigration.approach'] ?? ''}</p>
              <ul className="text-sm space-y-1 mb-0">
                {((t['solutions.legacyCodeRefactoring.scenarios.frameworkMigration.steps'] ?? []) as string[]).map((step: string, i: number) => (
                  <li key={i}>• {step}</li>
                ))}
              </ul>
            </div>
          </GlassCard>
          <GlassCard className="my-8">
            <h3 className="text-xl font-semibold mb-4">2. {t['solutions.legacyCodeRefactoring.scenarios.monolith.title'] ?? ''}</h3>
            <p className="mb-3 text-sm">
              <strong>Challenge:</strong> {t['solutions.legacyCodeRefactoring.scenarios.monolith.challenge'] ?? ''}
            </p>
            <div className="bg-foreground/5 rounded-lg p-3">
              <p className="text-sm font-semibold mb-2">{t['solutions.legacyCodeRefactoring.scenarios.monolith.approach'] ?? ''}</p>
              <ul className="text-sm space-y-1 mb-0">
                {((t['solutions.legacyCodeRefactoring.scenarios.monolith.steps'] ?? []) as string[]).map((step: string, i: number) => (
                  <li key={i}>• {step}</li>
                ))}
              </ul>
            </div>
          </GlassCard>
          <GlassCard className="my-8">
            <h3 className="text-xl font-semibold mb-4">3. {t['solutions.legacyCodeRefactoring.scenarios.databaseSchema.title'] ?? ''}</h3>
            <p className="mb-3 text-sm">
              <strong>Challenge:</strong> {t['solutions.legacyCodeRefactoring.scenarios.databaseSchema.challenge'] ?? ''}
            </p>
            <div className="bg-foreground/5 rounded-lg p-3">
              <p className="text-sm font-semibold mb-2">{t['solutions.legacyCodeRefactoring.scenarios.databaseSchema.approach'] ?? ''}</p>
              <ul className="text-sm space-y-1 mb-0">
                {((t['solutions.legacyCodeRefactoring.scenarios.databaseSchema.steps'] ?? []) as string[]).map((step: string, i: number) => (
                  <li key={i}>• {step}</li>
                ))}
              </ul>
            </div>
          </GlassCard>
          <h2 className="text-3xl font-bold mt-12 mb-6">{t['solutions.legacyCodeRefactoring.workflow.title'] ?? ''}</h2>
          <GlassCard className="my-8 bg-primary/10 border-primary/20">
            <h3 className="text-xl font-semibold mb-4">{t['solutions.legacyCodeRefactoring.workflow.subtitle'] ?? ''}</h3>
            <ol className="space-y-4 mb-0">
              {((t['solutions.legacyCodeRefactoring.workflow.steps'] ?? []) as Array<{title: string; description: string}>).map((step: {title: string; description: string}, i: number) => (
                <li key={i}>
                  <strong className="text-primary">{i + 1}. {step.title}</strong>
                  <p className="text-sm text-foreground/80">{step.description}</p>
                </li>
              ))}
            </ol>
          </GlassCard>
          <h2 className="text-3xl font-bold mt-12 mb-6">{t['solutions.legacyCodeRefactoring.realExample.title'] ?? ''}</h2>
          <GlassCard className="my-8">
            <h3 className="text-xl font-semibold mb-4">{t['solutions.legacyCodeRefactoring.realExample.scenario'] ?? ''}</h3>
            <p className="mb-4">
              <strong>{t['solutions.legacyCodeRefactoring.realExample.scenario'] ?? ''}:</strong> {t['solutions.legacyCodeRefactoring.realExample.codebase'] ?? ''}
            </p>
            <div className="mb-4">
              <h4 className="font-semibold mb-2">{t['solutions.legacyCodeRefactoring.realExample.without.title'] ?? ''}</h4>
              <div className="bg-red-500/10 rounded-lg p-3">
                <ul className="text-sm space-y-1 mb-0">
                  {((t['solutions.legacyCodeRefactoring.realExample.without.steps'] ?? []) as string[]).map((step: string, i: number) => (
                    <li key={i}>• {step}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div>
              <h4 className="font-semibold mb-2">{t['solutions.legacyCodeRefactoring.realExample.with.title'] ?? ''}</h4>
              <div className="bg-primary/10 rounded-lg p-3">
                <ul className="text-sm space-y-1 mb-0">
                  {((t['solutions.legacyCodeRefactoring.realExample.with.steps'] ?? []) as string[]).map((step: string, i: number) => (
                    <li key={i}>• {step}</li>
                  ))}
                </ul>
              </div>
            </div>
          </GlassCard>
          <h2 className="text-3xl font-bold mt-12 mb-6">{t['solutions.legacyCodeRefactoring.tools.title'] ?? ''}</h2>
          <div className="grid md:grid-cols-2 gap-6 my-8">
            <GlassCard>
              <h3 className="text-xl font-semibold mb-3">🗺️ {t['solutions.legacyCodeRefactoring.tools.dependencyMapping.title'] ?? ''}</h3>
              <p className="text-sm mb-2">
                {t['solutions.legacyCodeRefactoring.tools.dependencyMapping.description'] ?? ''}
              </p>
              <p className="text-xs text-foreground/60">
                {t['solutions.legacyCodeRefactoring.tools.dependencyMapping.tools'] ?? ''}
              </p>
            </GlassCard>
            <GlassCard>
              <h3 className="text-xl font-semibold mb-3">📊 {t['solutions.legacyCodeRefactoring.tools.complexity.title'] ?? ''}</h3>
              <p className="text-sm mb-2">
                {t['solutions.legacyCodeRefactoring.tools.complexity.description'] ?? ''}
              </p>
              <p className="text-xs text-foreground/60">
                {t['solutions.legacyCodeRefactoring.tools.complexity.tools'] ?? ''}
              </p>
            </GlassCard>
            <GlassCard>
              <h3 className="text-xl font-semibold mb-3">🧪 {t['solutions.legacyCodeRefactoring.tools.testCoverage.title'] ?? ''}</h3>
              <p className="text-sm mb-2">
                {t['solutions.legacyCodeRefactoring.tools.testCoverage.description'] ?? ''}
              </p>
              <p className="text-xs text-foreground/60">
                {t['solutions.legacyCodeRefactoring.tools.testCoverage.tools'] ?? ''}
              </p>
            </GlassCard>
            <GlassCard>
              <h3 className="text-xl font-semibold mb-3">🎯 {t['solutions.legacyCodeRefactoring.tools.staticAnalysis.title'] ?? ''}</h3>
              <p className="text-sm mb-2">
                {t['solutions.legacyCodeRefactoring.tools.staticAnalysis.description'] ?? ''}
              </p>
              <p className="text-xs text-foreground/60">
                {t['solutions.legacyCodeRefactoring.tools.staticAnalysis.tools'] ?? ''}
              </p>
            </GlassCard>
          </div>
          <h2 className="text-3xl font-bold mt-12 mb-6">{t['solutions.legacyCodeRefactoring.patterns.title'] ?? ''}</h2>
          <GlassCard className="my-8">
            <h3 className="text-xl font-semibold mb-4">1. {t['solutions.legacyCodeRefactoring.patterns.stranglerFig.title'] ?? ''}</h3>
            <p className="text-sm mb-3">
              <strong>{((t['solutions.legacyCodeRefactoring.patterns.stranglerFig.howItWorks'] as string ?? '') ?? '').split(':')[0]}:</strong> {((t['solutions.legacyCodeRefactoring.patterns.stranglerFig.howItWorks'] as string ?? '') ?? '').split(':')[1]}
            </p>
            <p className="text-sm">
              <strong>{((t['solutions.legacyCodeRefactoring.patterns.stranglerFig.bestFor'] as string ?? '') ?? '').split(':')[0]}:</strong> {((t['solutions.legacyCodeRefactoring.patterns.stranglerFig.bestFor'] as string ?? '') ?? '').split(':')[1]}
            </p>
          </GlassCard>
          <GlassCard className="my-8">
            <h3 className="text-xl font-semibold mb-4">2. {t['solutions.legacyCodeRefactoring.patterns.featureFlag.title'] ?? ''}</h3>
            <p className="text-sm mb-3">
              <strong>{((t['solutions.legacyCodeRefactoring.patterns.featureFlag.howItWorks'] as string ?? '') ?? '').split(':')[0]}:</strong> {((t['solutions.legacyCodeRefactoring.patterns.featureFlag.howItWorks'] as string ?? '') ?? '').split(':')[1]}
            </p>
            <p className="text-sm">
              <strong>{((t['solutions.legacyCodeRefactoring.patterns.featureFlag.bestFor'] as string ?? '') ?? '').split(':')[0]}:</strong> {((t['solutions.legacyCodeRefactoring.patterns.featureFlag.bestFor'] as string ?? '') ?? '').split(':')[1]}
            </p>
          </GlassCard>
          <GlassCard className="my-8">
            <h3 className="text-xl font-semibold mb-4">3. {t['solutions.legacyCodeRefactoring.patterns.parallelRun.title'] ?? ''}</h3>
            <p className="text-sm mb-3">
              <strong>{((t['solutions.legacyCodeRefactoring.patterns.parallelRun.howItWorks'] as string ?? '') ?? '').split(':')[0]}:</strong> {((t['solutions.legacyCodeRefactoring.patterns.parallelRun.howItWorks'] as string ?? '') ?? '').split(':')[1]}
            </p>
            <p className="text-sm">
              <strong>{((t['solutions.legacyCodeRefactoring.patterns.parallelRun.bestFor'] as string ?? '') ?? '').split(':')[0]}:</strong> {((t['solutions.legacyCodeRefactoring.patterns.parallelRun.bestFor'] as string ?? '') ?? '').split(':')[1]}
            </p>
          </GlassCard>
          <h2 className="text-3xl font-bold mt-12 mb-6">{t['solutions.legacyCodeRefactoring.mistakes.title'] ?? ''}</h2>
          <div className="space-y-4 my-8">
            <GlassCard className="bg-red-500/10 border-red-500/20">
              <h3 className="text-lg font-semibold mb-2">❌ {t['solutions.legacyCodeRefactoring.mistakes.bigBang.title'] ?? ''}</h3>
              <p className="text-sm">
                {t['solutions.legacyCodeRefactoring.mistakes.bigBang.problem'] ?? ''}
              </p>
              <p className="text-sm mt-2 font-semibold">✓ {t['solutions.legacyCodeRefactoring.mistakes.bigBang.instead'] ?? ''}</p>
            </GlassCard>
            <GlassCard className="bg-red-500/10 border-red-500/20">
              <h3 className="text-lg font-semibold mb-2">❌ {t['solutions.legacyCodeRefactoring.mistakes.noTests.title'] ?? ''}</h3>
              <p className="text-sm">
                {t['solutions.legacyCodeRefactoring.mistakes.noTests.problem'] ?? ''}
              </p>
              <p className="text-sm mt-2 font-semibold">✓ {t['solutions.legacyCodeRefactoring.mistakes.noTests.instead'] ?? ''}</p>
            </GlassCard>
            <GlassCard className="bg-red-500/10 border-red-500/20">
              <h3 className="text-lg font-semibold mb-2">❌ {t['solutions.legacyCodeRefactoring.mistakes.noRollback.title'] ?? ''}</h3>
              <p className="text-sm">
                {t['solutions.legacyCodeRefactoring.mistakes.noRollback.problem'] ?? ''}
              </p>
              <p className="text-sm mt-2 font-semibold">✓ {t['solutions.legacyCodeRefactoring.mistakes.noRollback.instead'] ?? ''}</p>
            </GlassCard>
          </div>
          <h2 className="text-3xl font-bold mt-12 mb-6">{t['solutions.legacyCodeRefactoring.gettingStarted.title'] ?? ''}</h2>
          <ol className="space-y-4 my-8">
            {((t['solutions.legacyCodeRefactoring.gettingStarted.steps'] ?? []) as Array<{title: string; description: string}>).map((step: {title: string; description: string}, i: number) => (
              <li key={i}>
                <strong>{i + 1}. {step.title}</strong>
                <p className="text-foreground/80 text-sm">
                  {step.description}
                </p>
              </li>
            ))}
          </ol>
          <div className="bg-gradient-to-r from-primary/20 to-primary/10 border border-primary/30 rounded-lg p-8 my-12 text-center">
            <h3 className="text-2xl font-bold mb-4">{t['solutions.legacyCodeRefactoring.cta.title'] ?? ''}</h3>
            <p className="text-foreground/80 mb-6">
              {t['solutions.legacyCodeRefactoring.cta.description'] ?? ''}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <LinkWithArrow
                href="/downloads"
                className="inline-flex items-center"
              >
                {t['solutions.legacyCodeRefactoring.cta.buttons.download'] ?? ''}
              </LinkWithArrow>
              <LinkWithArrow
                href="/docs/file-discovery"
                className="inline-flex items-center"
              >
                {t['solutions.legacyCodeRefactoring.cta.buttons.learnMapping'] ?? ''}
              </LinkWithArrow>
            </div>
          </div>
          <h2 className="text-3xl font-bold mt-12 mb-6">{t['solutions.legacyCodeRefactoring.furtherReading.title'] ?? ''}</h2>
          <ul className="space-y-2">
            <li>
              <LinkWithArrow href="/solutions/safe-refactoring">
                {t['solutions.legacyCodeRefactoring.furtherReading.safeRefactoring'] ?? ''}
              </LinkWithArrow>
            </li>
            <li>
              <LinkWithArrow href="/blog/what-is-ai-code-planning">
                {t['solutions.legacyCodeRefactoring.furtherReading.whatIsPlanning'] ?? ''}
              </LinkWithArrow>
            </li>
            <li>
              <LinkWithArrow href="/blog/ai-code-planning-best-practices">
                {t['solutions.legacyCodeRefactoring.furtherReading.bestPractices'] ?? ''}
              </LinkWithArrow>
            </li>
          </ul>
          <p className="text-sm text-foreground/60 mt-12 border-t border-foreground/10 pt-6">
            <strong>Published:</strong> November 2025 | <strong>Last Updated:</strong> November 2025
          </p>
        </article>
      </main>
    </div>
  );
}
