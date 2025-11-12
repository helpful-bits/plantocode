import type { Metadata } from 'next';
import { DocsArticle } from '@/components/docs/DocsArticle';
import { GlassCard } from '@/components/ui/GlassCard';
import { loadMessages, type Locale } from '@/lib/i18n';
import { locales } from '@/i18n/config';
import { generatePageMetadata } from '@/content/metadata';
export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return generatePageMetadata({
    locale,
    slug: '/docs/terminal-sessions',
    title: t['terminalSessions.meta.title'],
    description: t['terminalSessions.meta.description'],
  });
}
export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}
export default async function TerminalSessionsDocPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);
  return (
    <DocsArticle
      title={t['terminalSessions.title'] ?? ''}
      description={t['terminalSessions.description'] ?? ''}
      date={t['terminalSessions.date'] ?? ''}
      readTime={t['terminalSessions.readTime'] ?? ''}
      category={t['terminalSessions.category'] ?? ''}
    >
      <p className="text-base text-muted-foreground leading-relaxed mb-6">
        {t['terminalSessions.intro']}
      </p>
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['terminalSessions.lifecycle.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['terminalSessions.lifecycle.description']}
          </p>
        </GlassCard>
      </section>
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['terminalSessions.dependencyChecks.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed">
            {t['terminalSessions.dependencyChecks.description']}
          </p>
        </GlassCard>
      </section>
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['terminalSessions.attentionDetection.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['terminalSessions.attentionDetection.intro']}
          </p>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
            <li><strong>{(t['terminalSessions.attentionDetection.level1'] ?? '').split(':')[0]}:</strong> {(t['terminalSessions.attentionDetection.level1'] ?? '').split(':').slice(1).join(':')}</li>
            <li><strong>{(t['terminalSessions.attentionDetection.level2'] ?? '').split(':')[0]}:</strong> {(t['terminalSessions.attentionDetection.level2'] ?? '').split(':').slice(1).join(':')}</li>
          </ul>
          <p className="text-muted-foreground leading-relaxed mt-4">
            {t['terminalSessions.attentionDetection.conclusion']}
          </p>
        </GlassCard>
      </section>
      <section className="space-y-6 mb-12">
        <h2 className="text-2xl font-bold">{t['terminalSessions.voiceRecovery.heading']}</h2>
        <GlassCard className="p-6">
          <p className="text-muted-foreground leading-relaxed mb-4">
            {t['terminalSessions.voiceRecovery.voice']}
          </p>
          <p className="text-muted-foreground leading-relaxed">
            {t['terminalSessions.voiceRecovery.recovery']}
          </p>
        </GlassCard>
      </section>
    </DocsArticle>
  );
}
