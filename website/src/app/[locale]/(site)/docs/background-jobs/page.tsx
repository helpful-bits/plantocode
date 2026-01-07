import type { Metadata } from 'next';
import { DocsArticle } from '@/components/docs/DocsArticle';
import { DocsMediaBlock } from '@/components/docs/DocsMediaBlock';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { loadMessages, type Locale } from '@/lib/i18n';
import { locales } from '@/i18n/config';
import { generatePageMetadata } from '@/content/metadata';

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return generatePageMetadata({
    locale,
    slug: '/docs/background-jobs',
    title: t['backgroundJobs.meta.title'],
    description: t['backgroundJobs.meta.description'],
  });
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default async function BackgroundJobsDocPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return (
    <DocsArticle
      title={t['backgroundJobs.title']}
      description={t['backgroundJobs.description']}
      date={t['backgroundJobs.date']}
      readTime={t['backgroundJobs.readTime']}
      category={t['backgroundJobs.category']}
    >
      <p className="text-base text-muted-foreground leading-relaxed mb-6">
        {t['backgroundJobs.intro']}
      </p>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['backgroundJobs.jobRecord.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['backgroundJobs.jobRecord.description']}
          </p>
          <ul className="space-y-2 text-muted-foreground ml-6 list-disc">
            {(t['backgroundJobs.jobRecord.fields'] as string[]).map((field, index) => (
              <li key={index}>{field}</li>
            ))}
          </ul>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['backgroundJobs.orchestrator.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['backgroundJobs.orchestrator.description']}
          </p>
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['backgroundJobs.orchestrator.dataFlow']}
          </p>
          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <h4 className="text-sm font-semibold mb-2 text-foreground">Orchestrator components:</h4>
            <ul className="space-y-1 font-mono text-xs text-muted-foreground">
              <li>workflow_lifecycle_manager.rs - Workflow state machine</li>
              <li>stage_scheduler.rs - Stage ordering and dependencies</li>
              <li>stage_job_manager.rs - Per-stage job tracking</li>
              <li>event_emitter.rs - Progress event broadcasting</li>
              <li>data_extraction.rs - Intermediate data handling</li>
              <li>failure_handler.rs - Error recovery</li>
              <li>retry_handler.rs - Retry logic</li>
            </ul>
          </div>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['backgroundJobs.processors.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['backgroundJobs.processors.description']}
          </p>
          <ul className="space-y-2 text-muted-foreground ml-6 list-disc">
            {(t['backgroundJobs.processors.implementations'] as string[]).map((example, index) => (
              <li key={index} className="font-mono text-sm">{example}</li>
            ))}
          </ul>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['backgroundJobs.statusValues.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['backgroundJobs.statusValues.description']}
          </p>
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['backgroundJobs.statusValues.transitions']}
          </p>
          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <h4 className="text-sm font-semibold mb-2 text-foreground">Job status values:</h4>
            <ul className="space-y-1 font-mono text-xs text-muted-foreground">
              <li>idle, created, queued - Initial states</li>
              <li>acknowledged_by_worker - Claimed by worker</li>
              <li>preparing, preparing_input - Setup phase</li>
              <li>running, generating_stream, processing_stream - Execution</li>
              <li>completed, completed_by_tag - Success states</li>
              <li>failed, canceled - Terminal failure states</li>
            </ul>
          </div>
        </GlassCard>
      </section>

      <DocsMediaBlock
        className="mb-12"
        title={t['backgroundJobs.visuals.stateMachine.title']}
        description={t['backgroundJobs.visuals.stateMachine.description']}
        imageSrc={t['backgroundJobs.visuals.stateMachine.imageSrc']}
        imageAlt={t['backgroundJobs.visuals.stateMachine.imageAlt']}
        caption={t['backgroundJobs.visuals.stateMachine.caption']}
      />

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['backgroundJobs.events.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['backgroundJobs.events.description']}
          </p>
          <ul className="space-y-2 text-muted-foreground ml-6 list-disc">
            {(t['backgroundJobs.events.eventTypes'] as string[]).map((payload, index) => (
              <li key={index} className="font-mono text-sm">{payload}</li>
            ))}
          </ul>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['backgroundJobs.retry.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['backgroundJobs.retry.description']}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {t['backgroundJobs.retry.cancellation']}
          </p>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['backgroundJobs.artifacts.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['backgroundJobs.artifacts.description']}
          </p>
          <ul className="space-y-2 text-muted-foreground ml-6 list-disc">
            {(t['backgroundJobs.artifacts.stored'] as string[]).map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">Key source files</h2>
        <GlassCard className="p-6">
          <ul className="space-y-2 font-mono text-sm text-muted-foreground ml-6 list-disc">
            <li>desktop/src-tauri/src/jobs/mod.rs - Job system entry point</li>
            <li>desktop/src-tauri/src/jobs/queue.rs - Priority queue (8 workers)</li>
            <li>desktop/src-tauri/src/jobs/dispatcher.rs - Job execution</li>
            <li>desktop/src-tauri/src/jobs/types.rs - Job and payload types</li>
            <li>desktop/src-tauri/src/jobs/processors/ - All processor implementations</li>
            <li>desktop/src-tauri/src/jobs/workflow_orchestrator/ - Multi-stage workflows</li>
            <li>desktop/src-tauri/src/jobs/streaming_handler.rs - LLM stream handling</li>
          </ul>
        </GlassCard>
      </section>

      <div className="mt-16">
        <GlassCard className="p-6" highlighted>
          <h2 className="text-xl font-semibold mb-3">{t['backgroundJobs.cta.heading']}</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['backgroundJobs.cta.description']}
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button asChild size="lg">
              <Link href="/docs/data-model">{t['backgroundJobs.cta.links.dataModel']}</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/docs/runtime-walkthrough">{t['backgroundJobs.cta.links.runtime']}</Link>
            </Button>
          </div>
        </GlassCard>
      </div>
    </DocsArticle>
  );
}
