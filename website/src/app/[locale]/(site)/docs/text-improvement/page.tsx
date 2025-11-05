import type { Metadata } from 'next';
import { DocsArticle } from '@/components/docs/DocsArticle';
import { GlassCard } from '@/components/ui/GlassCard';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { StructuredData } from '@/components/seo/StructuredData';
import { cdnUrl } from '@/lib/cdn';
import { loadMessages, type Locale } from '@/lib/i18n';
import { locales } from '@/i18n/config';
export const metadata: Metadata = {
  title: 'Text improvement - PlanToCode',
  description:
    'How the desktop workspace rewrites highlighted text, preserves formatting, and links the feature to voice and video inputs.',
  alternates: {
    canonical: 'https://www.plantocode.com/docs/text-improvement',
    languages: {
      'en-US': 'https://www.plantocode.com/docs/text-improvement',
      'en': 'https://www.plantocode.com/docs/text-improvement',
    },
  },
  openGraph: {
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
    title: 'Text improvement - PlanToCode',
    description:
      'Understand the selection popover, job queue, model configuration, and integrations that power text improvement.',
    url: 'https://www.plantocode.com/docs/text-improvement',
    siteName: 'PlanToCode',
    type: 'article',
  },
};
const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Text improvement - PlanToCode',
  description:
    'Documentation for the selection-driven text improvement workflow, including model selection, Monaco integration, and voice/video inputs.',
};
export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}
export default async function TextImprovementDocPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);
  return (
    <>
      <StructuredData data={structuredData} />
      <DocsArticle
        title={t['textImprovement.title'] ?? ''}
        description={t['textImprovement.description'] ?? ''}
        date={t['textImprovement.date'] ?? ''}
        readTime={t['textImprovement.readTime'] ?? ''}
        category={t['textImprovement.category'] ?? ''}
      >
        <p className="text-base text-muted-foreground leading-relaxed mb-6">
          {t['textImprovement.intro']}
        </p>
        <GlassCard className="p-6 mb-10">
          <h2 className="text-xl font-semibold mb-3">{t['textImprovement.selectionPopover.heading']}</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            {(t['textImprovement.selectionPopover.provider'] ?? '').split('{code}')[0]}
            <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">TextImprovementProvider</code>
            {(t['textImprovement.selectionPopover.provider'] ?? '').split('{code}').slice(1).join('{code}')}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {(t['textImprovement.selectionPopover.component'] ?? '').split('{code}')[0]}
            <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">TextImprovementPopover</code>
            {(t['textImprovement.selectionPopover.component'] ?? '').split('{code}').slice(1).join('{code}')}
          </p>
        </GlassCard>
        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">{t['textImprovement.triggerImprovement.heading']}</h2>
          <GlassCard className="p-6">
            <p className="text-muted-foreground leading-relaxed mb-4">
              {(t['textImprovement.triggerImprovement.action'] ?? '').includes('{code}')
                ? <>
                    {(t['textImprovement.triggerImprovement.action'] ?? '').split('{code}')[0]}
                    <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">createImproveTextJobAction</code>
                    {(t['textImprovement.triggerImprovement.action'] ?? '').split('{code}')[1]?.split('{code}')[0]}
                    <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">improve_text_command</code>
                    {(t['textImprovement.triggerImprovement.action'] ?? '').split('{code}')[2]?.split('{code}')[0]}
                    <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">TextImprovementPayload</code>
                    {(t['textImprovement.triggerImprovement.action'] ?? '').split('{code}').slice(-1)[0]}
                  </>
                : t['textImprovement.triggerImprovement.action']
              }
            </p>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {(t['textImprovement.triggerImprovement.backend'] ?? '').includes('{code}')
                ? <>
                    {(t['textImprovement.triggerImprovement.backend'] ?? '').split('{code}')[0]}
                    <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">TextImprovementProcessor</code>
                    {(t['textImprovement.triggerImprovement.backend'] ?? '').split('{code}')[1]?.split('{code}')[0]}
                    <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">text_improvement</code>
                    {(t['textImprovement.triggerImprovement.backend'] ?? '').split('{code}')[2]?.split('{code}')[0]}
                    <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">LlmTaskRunner</code>
                    {(t['textImprovement.triggerImprovement.backend'] ?? '').split('{code}').slice(-1)[0]}
                  </>
                : t['textImprovement.triggerImprovement.backend']
              }
            </p>
            <p className="text-muted-foreground leading-relaxed">
              {t['textImprovement.triggerImprovement.metadata']}
            </p>
          </GlassCard>
        </section>
        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">{t['textImprovement.voiceIntegration.heading']}</h2>
          <GlassCard className="p-6">
            <p className="text-muted-foreground leading-relaxed mb-4">
              {(t['textImprovement.voiceIntegration.hook'] ?? '').split('{code}')[0]}
              <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">useVoiceTranscription</code>
              {(t['textImprovement.voiceIntegration.hook'] ?? '').split('{code}').slice(1).join('{code}')}
            </p>
            <p className="text-muted-foreground leading-relaxed">
              {t['textImprovement.voiceIntegration.preferences']}
            </p>
          </GlassCard>
        </section>
        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">{t['textImprovement.videoCapture.heading']}</h2>
          <GlassCard className="p-6">
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t['textImprovement.videoCapture.dialog']}
            </p>
            <p className="text-muted-foreground leading-relaxed">
              {t['textImprovement.videoCapture.features']}
            </p>
          </GlassCard>
        </section>
        <div className="mt-16">
          <GlassCard className="p-6" highlighted>
            <h2 className="text-xl font-semibold mb-3">{t['textImprovement.cta.heading']}</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t['textImprovement.cta.description']}
            </p>
            <PlatformDownloadSection location="docs_text_improvement" />
          </GlassCard>
        </div>
      </DocsArticle>
    </>
  );
}
