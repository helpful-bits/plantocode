import type { Metadata } from 'next';
import { loadMessages, type Locale } from '@/lib/i18n';
import { DocsArticle } from '@/components/docs/DocsArticle';
import { GlassCard } from '@/components/ui/GlassCard';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { locales } from '@/i18n/config';
import { generatePageMetadata } from '@/content/metadata';
export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return generatePageMetadata({
    locale,
    slug: '/docs/file-discovery',
    title: t['fileDiscovery.meta.title'],
    description: t['fileDiscovery.meta.description'],
  });
}
export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}
export default async function FileDiscoveryDocPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);
  return (
    <DocsArticle
      title={t['fileDiscovery.title'] ?? ''}
      description={t['fileDiscovery.description'] ?? ''}
      date={t['fileDiscovery.date'] ?? ''}
      readTime={t['fileDiscovery.readTime'] ?? ''}
      category={t['fileDiscovery.category'] ?? ''}
    >
      <p className="text-base text-muted-foreground leading-relaxed mb-6">
        {t['fileDiscovery.intro']}
      </p>
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['fileDiscovery.architecture.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['fileDiscovery.architecture.overview']}
          </p>
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['fileDiscovery.architecture.distributed']}
          </p>
          <div className="bg-muted/50 rounded-lg p-4 mt-4">
            <h4 className="text-sm font-semibold mb-2">{t['fileDiscovery.architecture.featuresHeading']}</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• {t['fileDiscovery.architecture.eventDriven']}</li>
              <li>• {t['fileDiscovery.architecture.errorHandling']}</li>
              <li>• {t['fileDiscovery.architecture.costTracking']}</li>
              <li>• {t['fileDiscovery.architecture.caching']}</li>
              <li>• {t['fileDiscovery.architecture.gitIntegration']}</li>
            </ul>
          </div>
        </GlassCard>
      </section>
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['fileDiscovery.stages.heading']}</h2>
        <div className="space-y-6">
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">{t['fileDiscovery.stages.stage1.heading']}</h3>
            <p className="text-muted-foreground leading-relaxed mb-3">
              {t['fileDiscovery.stages.stage1.description']}
            </p>
            <div className="bg-muted/30 rounded-lg p-3 text-sm">
              {t['fileDiscovery.stages.stage1.technical']}
            </div>
          </GlassCard>
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">{t['fileDiscovery.stages.stage2.heading']}</h3>
            <p className="text-muted-foreground leading-relaxed mb-3">
              {t['fileDiscovery.stages.stage2.description']}
            </p>
            <div className="bg-muted/30 rounded-lg p-3 text-sm mb-3">
              {t['fileDiscovery.stages.stage2.gitIntegration']}
            </div>
            <div className="bg-muted/30 rounded-lg p-3 text-sm">
              {t['fileDiscovery.stages.stage2.binaryDetection']}
            </div>
          </GlassCard>
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">{t['fileDiscovery.stages.stage3.heading']}</h3>
            <p className="text-muted-foreground leading-relaxed mb-3">
              {t['fileDiscovery.stages.stage3.description']}
            </p>
            <div className="bg-muted/30 rounded-lg p-3 text-sm">
              {t['fileDiscovery.stages.stage3.aiProcessing']}
            </div>
          </GlassCard>
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">{t['fileDiscovery.stages.stage4.heading']}</h3>
            <p className="text-muted-foreground leading-relaxed mb-3">
              {t['fileDiscovery.stages.stage4.description']}
            </p>
            <div className="bg-muted/30 rounded-lg p-3 text-sm">
              {t['fileDiscovery.stages.stage4.relationship']}
            </div>
          </GlassCard>
          <GlassCard className="p-6">
            <h3 className="text-lg font-semibold mb-3">{t['fileDiscovery.stages.stage5.heading']}</h3>
            <p className="text-muted-foreground leading-relaxed mb-3">
              {t['fileDiscovery.stages.stage5.description']}
            </p>
            <div className="bg-muted/30 rounded-lg p-3 text-sm">
              {t['fileDiscovery.stages.stage5.validation']}
            </div>
          </GlassCard>
        </div>
      </section>
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['fileDiscovery.configuration.heading']}</h2>
        <GlassCard className="p-6">
          <h3 className="text-lg font-semibold mb-3">{t['fileDiscovery.configuration.workflowConfig']}</h3>
          <div className="space-y-4">
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold mb-2">{t['fileDiscovery.configuration.timeout.heading']}</h4>
              <p className="text-sm text-muted-foreground mb-2">
                {t['fileDiscovery.configuration.timeout.description']}
              </p>
              <code className="text-xs bg-muted/50 px-2 py-1 rounded">
                timeoutMs: 300000 // 5 minutes default
              </code>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold mb-2">{t['fileDiscovery.configuration.exclusion.heading']}</h4>
              <p className="text-sm text-muted-foreground mb-2">
                {t['fileDiscovery.configuration.exclusion.description']}
              </p>
              <code className="text-xs bg-muted/50 px-2 py-1 rounded">
                excludedPaths: ["node_modules", ".git", "dist", "build"]
              </code>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold mb-2">{t['fileDiscovery.configuration.retry.heading']}</h4>
              <p className="text-sm text-muted-foreground mb-2">
                {t['fileDiscovery.configuration.retry.description']}
              </p>
              <code className="text-xs bg-muted/50 px-2 py-1 rounded">
                maxRetries: 3 // Per stage retry limit
              </code>
            </div>
          </div>
        </GlassCard>
      </section>
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['fileDiscovery.apiUsage.heading']}</h2>
        <GlassCard className="p-6">
          <h3 className="text-lg font-semibold mb-3">{t['fileDiscovery.apiUsage.starting']}</h3>
          <div className="bg-muted/50 rounded-lg p-4 mb-4">
            <pre className="text-sm text-muted-foreground overflow-x-auto">
{`const tracker = await WorkflowTracker.startWorkflow(
  sessionId,
  "Add user authentication to the login page",
  "/path/to/project",
  ["node_modules", "dist"],
  { timeoutMs: 300000 }
);`}
            </pre>
          </div>
          <h3 className="text-lg font-semibold mb-3 mt-6">{t['fileDiscovery.apiUsage.monitoring']}</h3>
          <div className="bg-muted/50 rounded-lg p-4 mb-4">
            <pre className="text-sm text-muted-foreground overflow-x-auto">
{`tracker.onProgress((state) => {
  console.log(\`Stage: \${state.currentStage}\`);
  console.log(\`Progress: \${state.progressPercentage}%\`);
});
tracker.onComplete((results) => {
  console.log(\`Selected \${results.selectedFiles.length} files\`);
});`}
            </pre>
          </div>
          <h3 className="text-lg font-semibold mb-3 mt-6">{t['fileDiscovery.apiUsage.retrieving']}</h3>
          <div className="bg-muted/50 rounded-lg p-4">
            <pre className="text-sm text-muted-foreground overflow-x-auto">
{`const results = await tracker.getResults();
const selectedFiles = results.selectedFiles;
const intermediateData = results.intermediateData;
const totalCost = results.totalActualCost;`}
            </pre>
          </div>
        </GlassCard>
      </section>
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['fileDiscovery.performance.heading']}</h2>
        <GlassCard className="p-6">
          <div className="space-y-4">
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold mb-2">{t['fileDiscovery.performance.memory.heading']}</h4>
              <p className="text-sm text-muted-foreground">
                {t['fileDiscovery.performance.memory.description']}
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold mb-2">{t['fileDiscovery.performance.costOptimization.heading']}</h4>
              <p className="text-sm text-muted-foreground">
                {t['fileDiscovery.performance.costOptimization.description']}
              </p>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold mb-2">{t['fileDiscovery.performance.monitoring.heading']}</h4>
              <p className="text-sm text-muted-foreground">
                {t['fileDiscovery.performance.monitoring.description']}
              </p>
            </div>
          </div>
        </GlassCard>
      </section>
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['fileDiscovery.integration.heading']}</h2>
        <GlassCard className="p-6">
          <h3 className="text-lg font-semibold mb-3">{t['fileDiscovery.integration.desktop.heading']}</h3>
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['fileDiscovery.integration.desktop.description']}
          </p>
          <h3 className="text-lg font-semibold mb-3 mt-6">{t['fileDiscovery.integration.implementationPlans.heading']}</h3>
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['fileDiscovery.integration.implementationPlans.description']}
          </p>
          <h3 className="text-lg font-semibold mb-3 mt-6">{t['fileDiscovery.integration.sessionManagement.heading']}</h3>
          <p className="text-muted-foreground leading-relaxed">
            {t['fileDiscovery.integration.sessionManagement.description']}
          </p>
        </GlassCard>
      </section>
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['fileDiscovery.errorHandling.heading']}</h2>
        <GlassCard className="p-6">
          <div className="space-y-4">
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold mb-2">{t['fileDiscovery.errorHandling.commonIssues.heading']}</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• {t['fileDiscovery.errorHandling.commonIssues.gitNotFound']}</li>
                <li>• {t['fileDiscovery.errorHandling.commonIssues.binaryDetection']}</li>
                <li>• {t['fileDiscovery.errorHandling.commonIssues.tokenLimit']}</li>
                <li>• {t['fileDiscovery.errorHandling.commonIssues.networkTimeout']}</li>
              </ul>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold mb-2">{t['fileDiscovery.errorHandling.errorCategories.heading']}</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• {t['fileDiscovery.errorHandling.errorCategories.validation']}</li>
                <li>• {t['fileDiscovery.errorHandling.errorCategories.workflow']}</li>
                <li>• {t['fileDiscovery.errorHandling.errorCategories.billing']}</li>
                <li>• {t['fileDiscovery.errorHandling.errorCategories.system']}</li>
              </ul>
            </div>
            <div className="bg-muted/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold mb-2">{t['fileDiscovery.errorHandling.debugging.heading']}</h4>
              <p className="text-sm text-muted-foreground">
                {t['fileDiscovery.errorHandling.debugging.description']}
              </p>
            </div>
          </div>
        </GlassCard>
      </section>
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['fileDiscovery.stateManagement.heading']}</h2>
        <GlassCard className="p-6">
          <h3 className="text-lg font-semibold mb-3">{t['fileDiscovery.stateManagement.transitions.heading']}</h3>
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['fileDiscovery.stateManagement.transitions.description']}
          </p>
          <h3 className="text-lg font-semibold mb-3 mt-6">{t['fileDiscovery.stateManagement.intermediateData.heading']}</h3>
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['fileDiscovery.stateManagement.intermediateData.description']}
          </p>
          <h3 className="text-lg font-semibold mb-3 mt-6">{t['fileDiscovery.stateManagement.eventDriven.heading']}</h3>
          <p className="text-muted-foreground leading-relaxed">
            {t['fileDiscovery.stateManagement.eventDriven.description']}
          </p>
        </GlassCard>
      </section>
      <div className="mt-16">
        <GlassCard className="p-6" highlighted>
          <h2 className="text-xl font-semibold mb-3">{t['fileDiscovery.cta.heading']}</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['fileDiscovery.cta.description']}
          </p>
          <PlatformDownloadSection location="docs_file_discovery" />
        </GlassCard>
      </div>
    </DocsArticle>
  );
}
