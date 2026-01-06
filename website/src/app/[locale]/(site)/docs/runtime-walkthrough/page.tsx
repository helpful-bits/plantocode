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
    slug: '/docs/runtime-walkthrough',
    title: t['runtimeWalkthrough.meta.title'],
    description: t['runtimeWalkthrough.meta.description'],
  });
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default async function RuntimeWalkthroughDocPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return (
    <DocsArticle
      title={t['runtimeWalkthrough.title']}
      description={t['runtimeWalkthrough.description']}
      date={t['runtimeWalkthrough.date']}
      readTime={t['runtimeWalkthrough.readTime']}
      category={t['runtimeWalkthrough.category']}
    >
      <p className="text-base text-muted-foreground leading-relaxed mb-6">
        {t['runtimeWalkthrough.intro']}
      </p>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['runtimeWalkthrough.timeline.heading']}</h2>
        <GlassCard className="p-6">
          <ul className="space-y-3 text-muted-foreground">
            {(t['runtimeWalkthrough.timeline.steps'] as string[]).map((step, index) => (
              <li key={index} className="flex items-start gap-3">
                <span className="font-semibold text-foreground min-w-[26px]">{index + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </GlassCard>
      </section>

      <DocsMediaBlock
        className="mb-12"
        title={t['runtimeWalkthrough.visuals.timeline.title']}
        description={t['runtimeWalkthrough.visuals.timeline.description']}
        imageSrc={t['runtimeWalkthrough.visuals.timeline.imageSrc']}
        imageAlt={t['runtimeWalkthrough.visuals.timeline.imageAlt']}
        caption={t['runtimeWalkthrough.visuals.timeline.caption']}
      />

      {Array.isArray(t['runtimeWalkthrough.jobMap.items']) ? (
        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">{t['runtimeWalkthrough.jobMap.heading']}</h2>
          <GlassCard className="p-6">
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              {(t['runtimeWalkthrough.jobMap.items'] as string[]).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </GlassCard>
        </section>
      ) : null}

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['runtimeWalkthrough.inputs.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['runtimeWalkthrough.inputs.capture']}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {t['runtimeWalkthrough.inputs.artifacts']}
          </p>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['runtimeWalkthrough.refinement.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['runtimeWalkthrough.refinement.jobs']}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {t['runtimeWalkthrough.refinement.storage']}
          </p>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['runtimeWalkthrough.discovery.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['runtimeWalkthrough.discovery.workflow']}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {t['runtimeWalkthrough.discovery.outputs']}
          </p>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['runtimeWalkthrough.planGeneration.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['runtimeWalkthrough.planGeneration.jobs']}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {t['runtimeWalkthrough.planGeneration.streaming']}
          </p>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['runtimeWalkthrough.merge.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['runtimeWalkthrough.merge.instructions']}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {t['runtimeWalkthrough.merge.outputs']}
          </p>
        </GlassCard>
      </section>

      <DocsMediaBlock
        className="mb-12"
        title={t['runtimeWalkthrough.visuals.walkthroughVideo.title']}
        description={t['runtimeWalkthrough.visuals.walkthroughVideo.description']}
        videoSrc={t['runtimeWalkthrough.visuals.walkthroughVideo.videoSrc']}
        posterSrc={t['runtimeWalkthrough.visuals.walkthroughVideo.posterSrc']}
        caption={t['runtimeWalkthrough.visuals.walkthroughVideo.caption']}
      />

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['runtimeWalkthrough.review.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['runtimeWalkthrough.review.editor']}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {t['runtimeWalkthrough.review.audit']}
          </p>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['runtimeWalkthrough.execution.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['runtimeWalkthrough.execution.terminal']}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {t['runtimeWalkthrough.execution.logging']}
          </p>
        </GlassCard>
      </section>

      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['runtimeWalkthrough.state.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['runtimeWalkthrough.state.jobs']}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {t['runtimeWalkthrough.state.rehydration']}
          </p>
        </GlassCard>
      </section>

      <div className="mt-16">
        <GlassCard className="p-6" highlighted>
          <h2 className="text-xl font-semibold mb-3">{t['runtimeWalkthrough.cta.heading']}</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['runtimeWalkthrough.cta.description']}
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button asChild size="lg">
              <Link href="/docs/architecture">{t['runtimeWalkthrough.cta.links.architecture']}</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/docs/background-jobs">{t['runtimeWalkthrough.cta.links.jobs']}</Link>
            </Button>
          </div>
          <div className="mt-6 flex flex-col sm:flex-row gap-4 text-sm text-muted-foreground">
            <Link href="/docs/data-model">{t['runtimeWalkthrough.cta.links.dataModel']}</Link>
            <Link href="/docs/implementation-plans">{t['runtimeWalkthrough.cta.links.plans']}</Link>
          </div>
        </GlassCard>
      </div>
    </DocsArticle>
  );
}
