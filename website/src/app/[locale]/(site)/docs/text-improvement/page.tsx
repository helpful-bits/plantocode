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
    slug: '/docs/text-improvement',
    title: t['textImprovement.meta.title'],
    description: t['textImprovement.meta.description'],
  });
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default async function TextImprovementDocPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: t['textImprovement.meta.title'],
    description: t['textImprovement.meta.description'],
  };

  const providerText = t['textImprovement.selectionPopover.provider'] as string;
  const componentText = t['textImprovement.selectionPopover.component'] as string;
  const actionText = t['textImprovement.triggerImprovement.action'] as string;
  const backendText = t['textImprovement.triggerImprovement.backend'] as string;
  const voiceHookText = t['textImprovement.voiceIntegration.hook'] as string;
  const processorText = t['textImprovement.processorDetails.processor'] as string;

  const providerParts = providerText.split('{code}');
  const componentParts = componentText.split('{code}');
  const actionParts = actionText.split('{code}');
  const backendParts = backendText.split('{code}');
  const voiceHookParts = voiceHookText.split('{code}');
  const processorParts = processorText.split('{code}');

  return (
    <>
      <StructuredData data={structuredData} />
      <DocsArticle
        title={t['textImprovement.title']}
        description={t['textImprovement.description']}
        date={t['textImprovement.date']}
        readTime={t['textImprovement.readTime']}
        category={t['textImprovement.category']}
      >
        <p className="text-base text-muted-foreground leading-relaxed mb-6">
          {t['textImprovement.intro']}
        </p>

        <DocsMediaBlock
          className="mb-12"
          title={t['textImprovement.visuals.popoverFlow.title']}
          description={t['textImprovement.visuals.popoverFlow.description']}
          imageSrc={t['textImprovement.visuals.popoverFlow.imageSrc']}
          imageAlt={t['textImprovement.visuals.popoverFlow.imageAlt']}
          caption={t['textImprovement.visuals.popoverFlow.caption']}
        />

        <GlassCard className="p-6 mb-10">
          <h2 className="text-xl font-semibold mb-3">{t['textImprovement.selectionPopover.heading']}</h2>
          <p className="text-muted-foreground leading-relaxed mb-4">
            {providerParts[0]}
            <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">TextImprovementProvider</code>
            {providerParts.slice(1).join('{code}')}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {componentParts[0]}
            <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">TextImprovementPopover</code>
            {componentParts.slice(1).join('{code}')}
          </p>
        </GlassCard>

        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">{t['textImprovement.triggerImprovement.heading']}</h2>
          <GlassCard className="p-6">
            <p className="text-muted-foreground leading-relaxed mb-4">
              {actionText.includes('{code}')
                ? <>
                    {actionParts[0]}
                    <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">createImproveTextJobAction</code>
                    {actionParts[1]}
                    <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">improve_text_command</code>
                    {actionParts[2]}
                    <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">TextImprovementPayload</code>
                    {actionParts[3]}
                  </>
                : actionText
              }
            </p>
            <p className="text-muted-foreground leading-relaxed mb-4">
              {backendText.includes('{code}')
                ? <>
                    {backendParts[0]}
                    <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">TextImprovementProcessor</code>
                    {backendParts[1]}
                    <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">text_improvement</code>
                    {backendParts[2]}
                    <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">LlmTaskRunner</code>
                    {backendParts[3]}
                  </>
                : backendText
              }
            </p>
            <p className="text-muted-foreground leading-relaxed">
              {t['textImprovement.triggerImprovement.metadata']}
            </p>
          </GlassCard>
        </section>

        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">{t['textImprovement.processorDetails.heading']}</h2>
          <GlassCard className="p-6">
            <p className="text-muted-foreground leading-relaxed mb-4">
              {processorParts[0]}
              <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">TextImprovementProcessor</code>
              {processorParts.slice(1).join('{code}')}
            </p>
            <h3 className="text-lg font-semibold mt-4 mb-2">{t['textImprovement.processorDetails.stepsHeading']}</h3>
            <ol className="space-y-2 text-muted-foreground ml-6 list-decimal">
              {(t['textImprovement.processorDetails.steps'] as string[]).map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
          </GlassCard>
        </section>

        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">{t['textImprovement.inlineRewriting.heading']}</h2>
          <GlassCard className="p-6">
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t['textImprovement.inlineRewriting.description']}
            </p>
            <h3 className="text-lg font-semibold mt-4 mb-2">{t['textImprovement.inlineRewriting.contextsHeading']}</h3>
            <ul className="space-y-2 text-muted-foreground ml-6 list-disc">
              {(t['textImprovement.inlineRewriting.contexts'] as string[]).map((context, index) => (
                <li key={index}>{context}</li>
              ))}
            </ul>
          </GlassCard>
        </section>

        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">{t['textImprovement.modelConfiguration.heading']}</h2>
          <GlassCard className="p-6">
            <p className="text-muted-foreground leading-relaxed mb-4">
              {t['textImprovement.modelConfiguration.description']}
            </p>
            <h3 className="text-lg font-semibold mt-4 mb-2">{t['textImprovement.modelConfiguration.settingsHeading']}</h3>
            <ul className="space-y-2 text-muted-foreground ml-6 list-disc">
              {(t['textImprovement.modelConfiguration.settings'] as string[]).map((setting, index) => (
                <li key={index}>{setting}</li>
              ))}
            </ul>
          </GlassCard>
        </section>

        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">{t['textImprovement.voiceIntegration.heading']}</h2>
          <GlassCard className="p-6">
            <p className="text-muted-foreground leading-relaxed mb-4">
              {voiceHookParts[0]}
              <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">useVoiceTranscription</code>
              {voiceHookParts.slice(1).join('{code}')}
            </p>
            <p className="text-muted-foreground leading-relaxed">
              {t['textImprovement.voiceIntegration.preferences']}
            </p>
          </GlassCard>
        </section>

        <section className="space-y-6 mb-12">
          <h2 className="text-2xl font-bold">{t['textImprovement.keyFiles.heading']}</h2>
          <GlassCard className="p-6">
            <ul className="space-y-2 text-muted-foreground ml-6 list-disc">
              {(t['textImprovement.keyFiles.items'] as string[]).map((file, index) => (
                <li key={index}>
                  <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono">{file}</code>
                </li>
              ))}
            </ul>
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
            <div className="flex flex-col sm:flex-row gap-3">
              <Button asChild size="lg">
                <Link href="/docs/architecture">{t['textImprovement.cta.links.architecture']}</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/docs/build-your-own">{t['textImprovement.cta.links.buildYourOwn']}</Link>
              </Button>
            </div>
          </GlassCard>
        </div>
      </DocsArticle>
    </>
  );
}
