import type { Metadata } from 'next';
import { DocsArticle } from '@/components/docs/DocsArticle';
import { DocsMediaBlock } from '@/components/docs/DocsMediaBlock';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { StructuredData } from '@/components/seo/StructuredData';
import { loadMessages, type Locale } from '@/lib/i18n';
import { locales } from '@/i18n/config';
import { generatePageMetadata } from '@/content/metadata';
export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return generatePageMetadata({
    locale,
    slug: '/docs/deep-research',
    title: t['deepResearch.meta.title'],
    description: t['deepResearch.meta.description'],
  });
}
export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}
export default async function DeepResearchDocPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: t['deepResearch.meta.title'],
    description: t['deepResearch.meta.description'],
  };
  return (
    <>
      <StructuredData data={structuredData} />
      <DocsArticle
        title={t['deepResearch.title']}
        description={t['deepResearch.description']}
        date={t['deepResearch.date']}
        readTime={t['deepResearch.readTime']}
        category={t['deepResearch.category']}
      >
        <p className="text-base text-muted-foreground leading-relaxed mb-6">
          {t['deepResearch.intro']}
        </p>
        <DocsMediaBlock
          className="mb-12"
          title={t['deepResearch.visuals.pipeline.title']}
          description={t['deepResearch.visuals.pipeline.description']}
          imageSrc={t['deepResearch.visuals.pipeline.imageSrc']}
          imageAlt={t['deepResearch.visuals.pipeline.imageAlt']}
          caption={t['deepResearch.visuals.pipeline.caption']}
        />
        <GlassCard className="p-6 mb-10">
          <h2 className="text-xl font-semibold mb-3">{t['deepResearch.architecture.heading']}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {t['deepResearch.architecture.description']}
          </p>
        </GlassCard>
        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">{t['deepResearch.workflow.heading']}</h2>
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">{t['deepResearch.workflow.queryGeneration.heading']}</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t['deepResearch.workflow.queryGeneration.description']}
            </p>
            <div className="bg-muted/30 rounded-lg p-4 mt-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">{t['deepResearch.workflow.queryGeneration.typesHeading']}</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• {t['deepResearch.workflow.queryGeneration.api']}</li>
                <li>• {t['deepResearch.workflow.queryGeneration.errors']}</li>
                <li>• {t['deepResearch.workflow.queryGeneration.practices']}</li>
                <li>• {t['deepResearch.workflow.queryGeneration.compatibility']}</li>
                <li>• {t['deepResearch.workflow.queryGeneration.security']}</li>
              </ul>
            </div>
          </GlassCard>
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">{t['deepResearch.workflow.execution.heading']}</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t['deepResearch.workflow.execution.description']}
            </p>
            <div className="bg-muted/30 rounded-lg p-4 mt-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">{t['deepResearch.workflow.execution.sourcesHeading']}</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• {t['deepResearch.workflow.execution.documentation']}</li>
                <li>• {t['deepResearch.workflow.execution.github']}</li>
                <li>• {t['deepResearch.workflow.execution.forums']}</li>
                <li>• {t['deepResearch.workflow.execution.blogs']}</li>
                <li>• {t['deepResearch.workflow.execution.releases']}</li>
              </ul>
            </div>
          </GlassCard>
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">{t['deepResearch.workflow.processing.heading']}</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t['deepResearch.workflow.processing.description']}
            </p>
            <div className="bg-muted/30 rounded-lg p-4 mt-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">{t['deepResearch.workflow.processing.stepsHeading']}</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• {t['deepResearch.workflow.processing.extraction']}</li>
                <li>• {t['deepResearch.workflow.processing.scoring']}</li>
                <li>• {t['deepResearch.workflow.processing.deduplication']}</li>
                <li>• {t['deepResearch.workflow.processing.timestamp']}</li>
                <li>• {t['deepResearch.workflow.processing.snippets']}</li>
              </ul>
            </div>
          </GlassCard>
        </section>
        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">{t['deepResearch.apiIntegration.heading']}</h2>
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">{t['deepResearch.apiIntegration.providerConfig.heading']}</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t['deepResearch.apiIntegration.providerConfig.description']}
            </p>
            <div className="bg-slate-900 rounded-lg p-4 mt-4 border border-slate-700">
              <pre className="text-slate-100 text-sm"><code>{`// Start the web search workflow (Tauri command)
await invoke("start_web_search_workflow", {
  sessionId,
  taskDescription,
  projectDirectory,
  excludedPaths: ["node_modules", "dist"],
  timeoutMs: 300000,
});`}</code></pre>
            </div>
          </GlassCard>
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">{t['deepResearch.apiIntegration.pipeline.heading']}</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t['deepResearch.apiIntegration.pipeline.description']}
            </p>
            <div className="bg-slate-900 rounded-lg p-4 mt-4 border border-slate-700">
              <pre className="text-slate-100 text-sm"><code>{`// WebSearchExecution response (stored in job.response)
{
  "searchResults": [
    { "title": "Research Task 1", "findings": "Summary text..." }
  ],
  "searchResultsCount": 1,
  "summary": "Found 1 research findings"
}`}</code></pre>
            </div>
          </GlassCard>
        </section>
        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">{t['deepResearch.devIntegration.heading']}</h2>
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">{t['deepResearch.devIntegration.contextAware.heading']}</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t['deepResearch.devIntegration.contextAware.description']}
            </p>
          </GlassCard>
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">{t['deepResearch.devIntegration.resultIntegration.heading']}</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t['deepResearch.devIntegration.resultIntegration.description']}
            </p>
          </GlassCard>
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">{t['deepResearch.devIntegration.caching.heading']}</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t['deepResearch.devIntegration.caching.description']}
            </p>
          </GlassCard>
        </section>
        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">{t['deepResearch.configuration.heading']}</h2>
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">{t['deepResearch.configuration.preferences.heading']}</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t['deepResearch.configuration.preferences.description']}
            </p>
            <div className="bg-muted/30 rounded-lg p-4 mt-4">
              <h4 className="text-sm font-semibold text-foreground mb-2">{t['deepResearch.configuration.preferences.optionsHeading']}</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• {t['deepResearch.configuration.preferences.sources']}</li>
                <li>• {t['deepResearch.configuration.preferences.filters']}</li>
                <li>• {t['deepResearch.configuration.preferences.limits']}</li>
                <li>• {t['deepResearch.configuration.preferences.triggers']}</li>
                <li>• {t['deepResearch.configuration.preferences.patterns']}</li>
              </ul>
            </div>
          </GlassCard>
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">{t['deepResearch.configuration.projectSettings.heading']}</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t['deepResearch.configuration.projectSettings.description']}
            </p>
          </GlassCard>
        </section>
        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">{t['deepResearch.costs.heading']}</h2>
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">{t['deepResearch.costs.rateLimiting.heading']}</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t['deepResearch.costs.rateLimiting.description']}
            </p>
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 rounded-lg p-4 mt-4">
              <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">{t['deepResearch.costs.rateLimiting.guidelinesHeading']}</h4>
              <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-1">
                <li>• {t['deepResearch.costs.rateLimiting.personal']}</li>
                <li>• {t['deepResearch.costs.rateLimiting.team']}</li>
                <li>• {t['deepResearch.costs.rateLimiting.throttling']}</li>
                <li>• {t['deepResearch.costs.rateLimiting.cacheFirst']}</li>
              </ul>
            </div>
          </GlassCard>
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">{t['deepResearch.costs.optimization.heading']}</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t['deepResearch.costs.optimization.description']}
            </p>
          </GlassCard>
        </section>
        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">{t['deepResearch.bestPractices.heading']}</h2>
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">{t['deepResearch.bestPractices.strategies.heading']}</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t['deepResearch.bestPractices.strategies.description']}
            </p>
            <div className="space-y-4 mt-4">
              <div className="bg-muted/30 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-foreground mb-2">{t['deepResearch.bestPractices.strategies.queryFormulation.heading']}</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• {t['deepResearch.bestPractices.strategies.queryFormulation.versions']}</li>
                  <li>• {t['deepResearch.bestPractices.strategies.queryFormulation.errors']}</li>
                  <li>• {t['deepResearch.bestPractices.strategies.queryFormulation.practices']}</li>
                  <li>• {t['deepResearch.bestPractices.strategies.queryFormulation.constraints']}</li>
                </ul>
              </div>
              <div className="bg-muted/30 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-foreground mb-2">{t['deepResearch.bestPractices.strategies.resultEvaluation.heading']}</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• {t['deepResearch.bestPractices.strategies.resultEvaluation.official']}</li>
                  <li>• {t['deepResearch.bestPractices.strategies.resultEvaluation.dates']}</li>
                  <li>• {t['deepResearch.bestPractices.strategies.resultEvaluation.verify']}</li>
                  <li>• {t['deepResearch.bestPractices.strategies.resultEvaluation.crossReference']}</li>
                </ul>
              </div>
            </div>
          </GlassCard>
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">{t['deepResearch.bestPractices.examples.heading']}</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t['deepResearch.bestPractices.examples.description']}
            </p>
            <div className="bg-slate-900 rounded-lg p-4 mt-4 border border-slate-700">
              <pre className="text-slate-100 text-sm"><code>{`// Example: API integration research
Search query: "Next.js 14 app router middleware authentication"
Results integrated as:
- Middleware setup code with current best practices
- Authentication flow documentation links
- Common pitfalls and troubleshooting tips
- Compatible library recommendations`}</code></pre>
            </div>
          </GlassCard>
        </section>
        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">{t['deepResearch.troubleshooting.heading']}</h2>
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">{t['deepResearch.troubleshooting.commonIssues.heading']}</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t['deepResearch.troubleshooting.commonIssues.description']}
            </p>
            <div className="space-y-3 mt-4">
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30 rounded-lg p-3">
                <h4 className="text-sm font-semibold text-red-800 dark:text-red-200">{t['deepResearch.troubleshooting.commonIssues.rateLimit']}</h4>
                <p className="text-sm text-red-700 dark:text-red-300">{t['deepResearch.troubleshooting.commonIssues.rateLimitSolution']}</p>
              </div>
              <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800/30 rounded-lg p-3">
                <h4 className="text-sm font-semibold text-yellow-800 dark:text-yellow-200">{t['deepResearch.troubleshooting.commonIssues.noResults']}</h4>
                <p className="text-sm text-yellow-700 dark:text-yellow-300">{t['deepResearch.troubleshooting.commonIssues.noResultsSolution']}</p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/30 rounded-lg p-3">
                <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200">{t['deepResearch.troubleshooting.commonIssues.geographic']}</h4>
                <p className="text-sm text-blue-700 dark:text-blue-300">{t['deepResearch.troubleshooting.commonIssues.geographicSolution']}</p>
              </div>
            </div>
          </GlassCard>
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">{t['deepResearch.troubleshooting.performance.heading']}</h3>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t['deepResearch.troubleshooting.performance.description']}
            </p>
          </GlassCard>
        </section>
        <div className="mt-16">
          <GlassCard className="p-6" highlighted>
            <h2 className="text-xl font-semibold mb-3">{t['deepResearch.cta.heading']}</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t['deepResearch.cta.description']}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button asChild size="lg">
                <Link href="/docs/architecture">{t['deepResearch.cta.links.architecture']}</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/docs/build-your-own">{t['deepResearch.cta.links.buildYourOwn']}</Link>
              </Button>
            </div>
          </GlassCard>
        </div>
      </DocsArticle>
    </>
  );
}
