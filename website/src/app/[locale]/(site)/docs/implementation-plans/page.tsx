import type { Metadata } from 'next';
import { DocsArticle } from '@/components/docs/DocsArticle';
import { GlassCard } from '@/components/ui/GlassCard';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { StructuredData } from '@/components/seo/StructuredData';
import { cdnUrl } from '@/lib/cdn';
import { loadMessages, type Locale } from '@/lib/i18n';
import { buildAlternates } from '@/content/metadata';
import { locales } from '@/i18n/config';
export const metadata: Metadata = {
  title: 'Implementation Plans - Review AI Changes',
  description:
    'Guide to AI implementation planning. Generate, review, and approve file-by-file plans before execution. Prevent duplicates and wrong paths.',
  alternates: {
    canonical: 'https://www.plantocode.com/docs/implementation-plans',
    languages: buildAlternates('/docs/implementation-plans'),
  },
  openGraph: {
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
    
    title: 'Human-in-the-Loop Implementation Plans in PlanToCode',
    description:
      'Understand how human-in-the-loop governance and file-by-file review workflows ensure safe AI development with complete control over code modifications.',
    url: 'https://www.plantocode.com/docs/implementation-plans',
    siteName: 'PlanToCode',
    type: 'article',
  },
};
const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Human-in-the-Loop Implementation Plans in PlanToCode',
  description:
    'How PlanToCode ensures safe AI development through human-in-the-loop governance, file-by-file granularity, and complete review workflows before code modifications.',
};
export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}
export default async function ImplementationPlansDocPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);
  return (
    <>
      <StructuredData data={structuredData} />
      <DocsArticle
        title={t['implementationPlans.title'] ?? ''}
        description={t['implementationPlans.description'] ?? ''}
        date={t['implementationPlans.date'] ?? ''}
        readTime={t['implementationPlans.readTime'] ?? ''}
        category={t['implementationPlans.category'] ?? ''}
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
        <GlassCard className="p-6 mb-10">
          <h2 className="text-xl font-semibold mb-3">{t['implementationPlans.plansOrigin.heading']}</h2>
          <p className="text-muted-foreground leading-relaxed">
            {(t['implementationPlans.plansOrigin.description'] ?? '').replace('{code}', '')}
            <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">useImplementationPlansLogic</code>
            {(t['implementationPlans.plansOrigin.description'] ?? '').includes('und der') ? ' und der umgebenden Panel-Komponente.' : ''}
          </p>
        </GlassCard>
        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">{t['implementationPlans.reviewingPlans.heading']}</h2>
          <GlassCard className="p-6">
            <p className="text-muted-foreground leading-relaxed mb-4">
              {(t['implementationPlans.reviewingPlans.description'] ?? '').split('{code}')[0]}
              <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">VirtualizedCodeViewer</code>
              {(t['implementationPlans.reviewingPlans.description'] ?? '').split('{code}')[1] || ''}
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
            <PlatformDownloadSection location="docs_implementation_plans" />
            <div className="mt-6 flex flex-col sm:flex-row gap-4 text-sm text-muted-foreground">
              <LinkWithArrow href="/plan-mode/codex">
                {t['implementationPlans.cta.codexLink']}
              </LinkWithArrow>
              <LinkWithArrow href="/plan-mode/claude-code">
                {t['implementationPlans.cta.claudeCodeLink']}
              </LinkWithArrow>
              <LinkWithArrow href="/plan-mode/cursor">
                {t['implementationPlans.cta.cursorLink']}
              </LinkWithArrow>
            </div>
          </GlassCard>
        </div>
      </DocsArticle>
    </>
  );
}
