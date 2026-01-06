import type { Metadata } from 'next';
import { DocsArticle } from '@/components/docs/DocsArticle';
import { DocsMediaBlock } from '@/components/docs/DocsMediaBlock';
import { GlassCard } from '@/components/ui/GlassCard';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
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
    slug: '/docs/implementation-plans',
    title: t['implementationPlans.meta.title'],
    description: t['implementationPlans.meta.description'],
  });
}
export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}
export default async function ImplementationPlansDocPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: t['implementationPlans.meta.title'],
    description: t['implementationPlans.meta.description'],
  };
  const plansOrigin = t['implementationPlans.plansOrigin.description'] as string;
  const plansOriginParts = plansOrigin.split('{code}');
  const reviewingPlans = t['implementationPlans.reviewingPlans.description'] as string;
  const reviewingParts = reviewingPlans.split('{code}');
  const schemaFields = Array.isArray(t['implementationPlans.schema.fields'])
    ? (t['implementationPlans.schema.fields'] as string[])
    : [];
  const schemaHeading = t['implementationPlans.schema.heading'];

  return (
    <>
      <StructuredData data={structuredData} />
      <DocsArticle
        title={t['implementationPlans.title']}
        description={t['implementationPlans.description']}
        date={t['implementationPlans.date']}
        readTime={t['implementationPlans.readTime']}
        category={t['implementationPlans.category']}
      >
        <p className="text-base text-muted-foreground leading-relaxed mb-6">
          {t['implementationPlans.intro']}
        </p>
        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">{t['implementationPlans.hitl.heading']}</h2>
          <GlassCard className="p-6">
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t['implementationPlans.hitl.intro']}
            </p>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t['implementationPlans.hitl.workflow']}
            </p>
            <ul className="space-y-3 text-muted-foreground">
              <li className="flex items-start gap-3">
                <span className="font-semibold text-foreground min-w-[100px]">{t['implementationPlans.hitl.review']}</span>
                <span>{t['implementationPlans.hitl.reviewDesc']}</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="font-semibold text-foreground min-w-[100px]">{t['implementationPlans.hitl.edit']}</span>
                <span>{t['implementationPlans.hitl.editDesc']}</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="font-semibold text-foreground min-w-[100px]">{t['implementationPlans.hitl.requestChanges']}</span>
                <span>{t['implementationPlans.hitl.requestChangesDesc']}</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="font-semibold text-foreground min-w-[100px]">{t['implementationPlans.hitl.approve']}</span>
                <span>{t['implementationPlans.hitl.approveDesc']}</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="font-semibold text-foreground min-w-[100px]">{t['implementationPlans.hitl.reject']}</span>
                <span>{t['implementationPlans.hitl.rejectDesc']}</span>
              </li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              {t['implementationPlans.hitl.conclusion']}
            </p>
          </GlassCard>
        </section>
        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">{t['implementationPlans.fileGranularity.heading']}</h2>
          <GlassCard className="p-6">
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t['implementationPlans.fileGranularity.intro']}
            </p>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t['implementationPlans.fileGranularity.declaredFiles']}
            </p>
            <ul className="space-y-2 text-muted-foreground ml-6 list-disc">
              <li>{t['implementationPlans.fileGranularity.modified']}</li>
              <li>{t['implementationPlans.fileGranularity.created']}</li>
              <li>{t['implementationPlans.fileGranularity.deleted']}</li>
              <li>{t['implementationPlans.fileGranularity.referenced']}</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4 mb-4">
              {t['implementationPlans.fileGranularity.impact']}
            </p>
            <p className="text-muted-foreground leading-relaxed">
              {t['implementationPlans.fileGranularity.transmission']}
            </p>
          </GlassCard>
        </section>
        {schemaHeading ? (
          <section className="space-y-6 mb-12">
            <h2 className="text-2xl font-bold">{schemaHeading}</h2>
            <GlassCard className="p-6 space-y-4">
              <p className="text-muted-foreground leading-relaxed">
                {t['implementationPlans.schema.description']}
              </p>
              {schemaFields.length ? (
                <div>
                  <h3 className="text-sm font-semibold mb-2">{t['implementationPlans.schema.fieldsHeading']}</h3>
                  <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
                    {schemaFields.map((item: string) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {t['implementationPlans.schema.example'] ? (
                <div>
                  <h3 className="text-sm font-semibold mb-2">{t['implementationPlans.schema.exampleHeading']}</h3>
                  <pre className="rounded-lg bg-slate-950 p-4 text-sm text-slate-100 overflow-x-auto">
                    <code>{t['implementationPlans.schema.example']}</code>
                  </pre>
                </div>
              ) : null}
            </GlassCard>
          </section>
        ) : null}
        <DocsMediaBlock
          className="mb-12"
          title={t['implementationPlans.visuals.planEditor.title']}
          description={t['implementationPlans.visuals.planEditor.description']}
          imageSrc={t['implementationPlans.visuals.planEditor.imageSrc']}
          imageAlt={t['implementationPlans.visuals.planEditor.imageAlt']}
          caption={t['implementationPlans.visuals.planEditor.caption']}
        />
        <GlassCard className="p-6 mb-10">
          <h2 className="text-xl font-semibold mb-3">{t['implementationPlans.plansOrigin.heading']}</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            {plansOriginParts[0]}
            <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">useImplementationPlansLogic</code>
            {plansOriginParts[1]}
          </p>
          <div className="bg-muted/30 rounded-lg p-4 space-y-3">
            <p className="text-sm text-muted-foreground">{t['implementationPlans.plansOrigin.processor']}</p>
            <p className="text-sm text-muted-foreground">{t['implementationPlans.plansOrigin.storage']}</p>
            <p className="text-sm text-muted-foreground">{t['implementationPlans.plansOrigin.streaming']}</p>
          </div>
        </GlassCard>
        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">{t['implementationPlans.planProcessor.heading']}</h2>
          <GlassCard className="p-6">
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t['implementationPlans.planProcessor.description']}
            </p>
            <div className="bg-muted/30 rounded-lg p-4 space-y-3">
              <p className="text-sm text-muted-foreground"><strong>Inputs:</strong> {t['implementationPlans.planProcessor.inputs']}</p>
              <p className="text-sm text-muted-foreground"><strong>Prompt assembly:</strong> {t['implementationPlans.planProcessor.prompt']}</p>
              <p className="text-sm text-muted-foreground"><strong>Output:</strong> {t['implementationPlans.planProcessor.output']}</p>
              <p className="text-sm text-muted-foreground"><strong>Display:</strong> {t['implementationPlans.planProcessor.display']}</p>
            </div>
          </GlassCard>
        </section>
        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">{t['implementationPlans.reviewingPlans.heading']}</h2>
          <GlassCard className="p-6">
            <p className="text-muted-foreground leading-relaxed mb-4">
              {reviewingParts[0]}
              <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">VirtualizedCodeViewer</code>
              {reviewingParts[1]}
            </p>
            <p className="text-muted-foreground leading-relaxed">
              {t['implementationPlans.reviewingPlans.opening']}
            </p>
          </GlassCard>
        </section>
        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">{t['implementationPlans.context.heading']}</h2>
          <GlassCard className="p-6">
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t['implementationPlans.context.storage']}
            </p>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t['implementationPlans.context.tokenEstimation']}
            </p>
            <p className="text-muted-foreground leading-relaxed">
              {t['implementationPlans.context.audit']}
            </p>
          </GlassCard>
        </section>
        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">{t['implementationPlans.multiplePlans.heading']}</h2>
          <GlassCard className="p-6">
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t['implementationPlans.multiplePlans.description']}
            </p>
          </GlassCard>
        </section>
        <div className="mt-16">
          <GlassCard className="p-6" highlighted>
            <h2 className="text-xl font-semibold mb-3">{t['implementationPlans.cta.heading']}</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t['implementationPlans.cta.description']}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button asChild size="lg">
                <Link href="/docs/architecture">{t['implementationPlans.cta.links.architecture']}</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/docs/decisions-tradeoffs">{t['implementationPlans.cta.links.decisions']}</Link>
              </Button>
            </div>
            <div className="mt-6 flex flex-col sm:flex-row gap-4 text-sm text-muted-foreground">
              <LinkWithArrow href="/docs/build-your-own">
                {t['implementationPlans.cta.links.buildYourOwn']}
              </LinkWithArrow>
              <LinkWithArrow href="/docs/file-discovery">
                {t['implementationPlans.cta.links.fileDiscovery']}
              </LinkWithArrow>
            </div>
          </GlassCard>
        </div>
      </DocsArticle>
    </>
  );
}
