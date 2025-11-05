import { Metadata } from 'next';
import { loadMessages, type Locale } from '@/lib/i18n';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { buildSolutionBreadcrumbs } from '@/components/breadcrumbs/utils';
import { RelatedSolutions } from '@/components/RelatedContent';
import { AlertTriangle, ListChecks, TerminalSquare, AudioWaveform, FileSearch } from 'lucide-react';
import { cdnUrl } from '@/lib/cdn';
import { locales } from '@/i18n/config';
export const metadata: Metadata = {
  title: 'Resolve hard bugs with reproducible context - PlanToCode',
  description:
    'How PlanToCode captures plan history, terminal logs, and live transcripts so tricky production issues can be reproduced without guesswork.',
  openGraph: {
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
    title: 'Resolve hard bugs with reproducible context - PlanToCode',
    description:
      'Use PlanToCode to capture plan history, persistent terminal output, and searchable transcripts when investigating complex defects.',
    url: 'https://www.plantocode.com/solutions/hard-bugs',
    siteName: 'PlanToCode',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.plantocode.com/solutions/hard-bugs',
    languages: {
      'en-US': 'https://www.plantocode.com/solutions/hard-bugs',
      'en': 'https://www.plantocode.com/solutions/hard-bugs',
    },
  },
};
const sections = [
  { icon: FileSearch, key: 'reproduceSurface', link: '/docs/file-discovery' },
  { icon: ListChecks, key: 'reviewFixes', link: '/docs/implementation-plans' },
  { icon: TerminalSquare, key: 'persistTerminal', link: '/docs/terminal-sessions' },
  { icon: AudioWaveform, key: 'voiceNotes', link: '/docs/voice-transcription' },
];
export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}
export default async function HardBugsPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);
  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />
        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 lg:py-32 px-4">
            <div className="container mx-auto max-w-5xl space-y-16">
              <Breadcrumbs items={buildSolutionBreadcrumbs(t['hardBugs.title'] || 'Hard Bugs')} />
              <header className="text-center space-y-6">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 text-amber-500 text-sm font-medium">
                  <AlertTriangle className="w-4 h-4" />
                  <span>{t['hardBugs.badge'] || 'Production debugging'}</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight text-foreground">
                  {t['hardBugs.title'] || 'Resolve hard bugs with preserved context'}
                </h1>
                <p className="text-lg text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  {t['hardBugs.description'] || 'PlanToCode keeps every plan, terminal session, and spoken note attached to the job you are debugging.'}
                </p>
              </header>
              <div className="grid md:grid-cols-2 gap-6">
                {sections.map(({ icon: Icon, key, link }) => (
                  <GlassCard key={key} className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <Icon className="w-5 h-5 text-primary" />
                      <h2 className="text-xl font-semibold">{t[`hardBugs.sections.${key}.title`] || ''}</h2>
                    </div>
                    <p className="text-foreground/70 leading-relaxed">
                      {t[`hardBugs.sections.${key}.description`] || ''}
                    </p>
                    <LinkWithArrow href={link} className="text-sm mt-4">
                      {t[`hardBugs.sections.${key}.link`] || 'Learn more'}
                    </LinkWithArrow>
                  </GlassCard>
                ))}
              </div>
              <RelatedSolutions currentSlug="solutions/hard-bugs" maxItems={3} />
              <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto text-center" highlighted>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                  {t['hardBugs.cta.title'] || 'Debug Production Issues with Confidence'}
                </h2>
                <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                  {t['hardBugs.cta.description'] || 'Preserve every investigation, reproduce every step, never lose context.'}
                </p>
                <PlatformDownloadSection location="solutions_hard_bugs" />
                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                  <LinkWithArrow href="/features/integrated-terminal">
                    {t['hardBugs.cta.links.terminal'] || 'Explore terminal persistence'}
                  </LinkWithArrow>
                  <span className="hidden sm:inline">•</span>
                  <LinkWithArrow href="/features/voice-transcription">
                    {t['hardBugs.cta.links.voice'] || 'Learn about voice notes'}
                  </LinkWithArrow>
                </div>
              </GlassCard>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
