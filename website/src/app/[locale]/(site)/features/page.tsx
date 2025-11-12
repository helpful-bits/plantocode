import { Metadata } from 'next';
import { loadMessagesFor, type Locale } from '@/lib/i18n';
import { Header } from '@/components/landing/Header';
import { GlassCard } from '@/components/ui/GlassCard';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { buildHubBreadcrumbs } from '@/components/breadcrumbs/utils';
import { locales } from '@/i18n/config';
import {
  FileSearch, Brain, Mic, Video, Copy, GitMerge, MessageSquare, Terminal, Zap
} from 'lucide-react';
import { generatePageMetadata } from '@/content/metadata';

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessagesFor(locale, ['common', 'features']);

  return generatePageMetadata({
    locale,
    slug: '/features',
    title: t['hub.meta.title'],
    description: t['hub.meta.description'],
  });
}
const iconMap: Record<string, any> = {
  fileDiscovery: FileSearch,
  planMode: Brain,
  voiceTranscription: Mic,
  videoAnalysis: Video,
  textImprovement: MessageSquare,
  mergeInstructions: GitMerge,
  deepResearch: Zap,
  integratedTerminal: Terminal,
  copyButtons: Copy,
};
const colorMap: Record<string, { text: string; bg: string }> = {
  fileDiscovery: { text: 'text-blue-500', bg: 'bg-blue-500/10' },
  planMode: { text: 'text-purple-500', bg: 'bg-purple-500/10' },
  voiceTranscription: { text: 'text-green-500', bg: 'bg-green-500/10' },
  videoAnalysis: { text: 'text-red-500', bg: 'bg-red-500/10' },
  textImprovement: { text: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  mergeInstructions: { text: 'text-indigo-500', bg: 'bg-indigo-500/10' },
  deepResearch: { text: 'text-orange-500', bg: 'bg-orange-500/10' },
  integratedTerminal: { text: 'text-cyan-500', bg: 'bg-cyan-500/10' },
  copyButtons: { text: 'text-pink-500', bg: 'bg-pink-500/10' },
};
export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}
export default async function FeaturesHubPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessagesFor(locale, ['common', 'features']);
  const featureKeys = [
    'fileDiscovery',
    'planMode',
    'voiceTranscription',
    'videoAnalysis',
    'textImprovement',
    'mergeInstructions',
    'deepResearch',
    'integratedTerminal',
    'copyButtons'
  ];
  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />
        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 px-4">
            <div className="container mx-auto max-w-6xl">
              <Breadcrumbs items={buildHubBreadcrumbs(t['breadcrumb.features'] || 'Features')} />
              <header className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6 text-sm font-medium">
                  <Zap className="w-4 h-4" />
                  <span>{t['hub.badge'] ?? ''}</span>
                </div>
                <h1 className="text-4xl sm:text-5xl font-bold mb-6">
                  {t['hub.title'] || 'AI Development Planning Features'}
                </h1>
                <p className="text-lg text-foreground/80 max-w-3xl mx-auto">
                  {t['hub.description'] ?? ''}
                </p>
              </header>
              {/* Features Grid */}
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
                {featureKeys.map((featureKey) => {
                  const Icon = iconMap[featureKey];
                  const colors = colorMap[featureKey];
                  const title = t[`features.${featureKey}.title`] ?? '';
                  const description = t[`features.${featureKey}.description`] ?? '';
                  const slug = t[`features.${featureKey}.slug`] ?? '';
                  return (
                    <GlassCard key={featureKey} className="p-6 flex flex-col hover:shadow-lg transition-shadow">
                      <div className={`w-12 h-12 rounded-lg ${colors?.bg} flex items-center justify-center mb-4`}>
                        <Icon className={`w-6 h-6 ${colors?.text}`} />
                      </div>
                      <h3 className="font-semibold mb-2 text-lg">
                        {title}
                      </h3>
                      <p className="text-sm text-foreground/70 mb-4 flex-grow">
                        {description}
                      </p>
                      <LinkWithArrow href={slug} className="text-sm mt-auto">
                        {t['hub.learnMore'] ?? ''}
                      </LinkWithArrow>
                    </GlassCard>
                  );
                })}
              </div>
              {/* Bottom CTA */}
              <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto text-center" highlighted>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                  {t['hub.cta.title'] ?? ''}
                </h2>
                <p className="text-lg text-foreground/80 mb-8">
                  {t['hub.cta.description'] ?? ''}
                </p>
                <LinkWithArrow href="/downloads" className="text-lg">
                  {t['hub.cta.button'] ?? ''}
                </LinkWithArrow>
              </GlassCard>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
