import { Metadata } from 'next';
import { Link } from '@/i18n/navigation';

import { Header } from '@/components/landing/Header';
import { GlassCard } from '@/components/ui/GlassCard';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { buildHubBreadcrumbs } from '@/components/breadcrumbs/utils';
import { getPagesByCategory } from '@/data/pseo';
import { loadMessagesFor, type Locale } from '@/lib/i18n';
import { Layers, GitCompare } from 'lucide-react';
import { locales } from '@/i18n/config';

export const metadata: Metadata = {
  title: 'PlanToCode vs Alternatives - Feature Comparisons',
  description: 'Compare PlanToCode with tmux, script, asciinema, Cursor, Claude Code, and other development tools. See how architectural planning improves your workflow.',
  openGraph: {
    title: 'PlanToCode Comparisons - vs tmux, Cursor, Claude Code',
    description: 'Detailed feature comparisons with alternative development tools.',
    url: 'https://www.plantocode.com/comparisons',
  },
  alternates: {
    canonical: 'https://www.plantocode.com/comparisons',
  },
};

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default async function ComparisonsHubPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessagesFor(locale as Locale, ['common', 'pages']);

  const comparisons = getPagesByCategory('comparisons').filter(p => p.publish === true);

  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />

        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 px-4">
            <div className="container mx-auto max-w-6xl">
              <Breadcrumbs items={buildHubBreadcrumbs(t['breadcrumb.comparisons'] || 'Comparisons')} />

              <header className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6 text-sm font-medium">
                  <GitCompare className="w-4 h-4" />
                  <span>{t['comparisons.hub.badge']}</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6 leading-tight">
                  {t['comparisons.hub.title']}
                </h1>
                <p className="text-lg text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  {t['comparisons.hub.description']}
                </p>
              </header>

              {/* Comparison Grid */}
              <div className="grid md:grid-cols-2 gap-6 mb-16">
                {comparisons.map((page) => (
                  <GlassCard key={page.slug} className="p-6 flex flex-col">
                    <div className="mb-3">
                      <span className="inline-block px-3 py-1 rounded-full bg-amber-500/10 text-amber-500 text-xs font-medium">
                        {t['comparisons.hub.card.badge']}
                      </span>
                    </div>

                    <h3 className="font-semibold mb-2 text-xl line-clamp-2">
                      {page.headline}
                    </h3>

                    <p className="text-sm text-foreground/70 mb-4 line-clamp-2">
                      {page.subhead}
                    </p>

                    {/* Key differences */}
                    {page.pain_points && page.pain_points.length > 0 && (
                      <div className="mb-4 flex-grow">
                        <p className="text-xs text-foreground/60 mb-2 font-medium">{t['comparisons.hub.card.whySwitchLabel']}</p>
                        <ul className="text-xs text-foreground/70 space-y-2">
                          {page.pain_points.slice(0, 3).map((pain, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <Layers className="w-3 h-3 text-primary mt-0.5 flex-shrink-0" />
                              <span className="line-clamp-2">{pain.solution}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <LinkWithArrow href={`/${page.slug}`} className="text-sm mt-auto">
                      {t['comparisons.hub.card.viewLink']}
                    </LinkWithArrow>
                  </GlassCard>
                ))}
              </div>

              {/* Cursor Users Note */}
              <div className="mb-12">
                <GlassCard className="p-6 bg-primary/5 border-primary/20">
                  <p className="text-center text-foreground/80">
                    <strong>{t['comparisons.hub.cursorNote.strong']}</strong> {t['comparisons.hub.cursorNote.text']}{' '}
                    <Link href="/cursor-alternative" className="text-primary hover:underline font-medium">
                      {t['comparisons.hub.cursorNote.link']}
                    </Link>
                  </p>
                </GlassCard>
              </div>

              {/* What Makes PlanToCode Different */}
              <div className="mb-16">
                <h2 className="text-2xl font-bold mb-6 text-center">{t['comparisons.hub.whatMakesDifferent.title']}</h2>
                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6">
                    <h3 className="font-semibold mb-3">{t['comparisons.hub.whatMakesDifferent.architectural.title']}</h3>
                    <p className="text-sm text-foreground/70">
                      {t['comparisons.hub.whatMakesDifferent.architectural.description']}
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="font-semibold mb-3">{t['comparisons.hub.whatMakesDifferent.multiModel.title']}</h3>
                    <p className="text-sm text-foreground/70">
                      {t['comparisons.hub.whatMakesDifferent.multiModel.description']}
                    </p>
                  </GlassCard>

                  <GlassCard className="p-6">
                    <h3 className="font-semibold mb-3">{t['comparisons.hub.whatMakesDifferent.humanInLoop.title']}</h3>
                    <p className="text-sm text-foreground/70">
                      {t['comparisons.hub.whatMakesDifferent.humanInLoop.description']}
                    </p>
                  </GlassCard>
                </div>
              </div>

              {/* Bottom CTA */}
              <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto text-center" highlighted>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                  {t['comparisons.hub.cta.title']}
                </h2>
                <p className="text-lg text-foreground/80 mb-8">
                  {t['comparisons.hub.cta.subtitle']}
                </p>
                <LinkWithArrow href="/downloads" className="text-lg">
                  {t['comparisons.hub.cta.button']}
                </LinkWithArrow>
                <p className="text-sm text-foreground/60 mt-4">
                  {t['comparisons.hub.cta.footer']}
                </p>
              </GlassCard>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
