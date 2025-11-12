import dynamic from 'next/dynamic';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/GlassCard';
import { StructuredData } from '@/components/seo/StructuredData';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Terminal, CheckCircle2 } from 'lucide-react';

// Lazy load heavy components
const VideoButtonOptimized = dynamic(() => import('@/components/ui/VideoButtonOptimized').then(mod => ({ default: mod.VideoButtonOptimized })), {
  loading: () => <Button variant="outline" size="lg" disabled>Loading...</Button>,
});
const FAQOptimized = dynamic(() => import('@/components/landing/FAQOptimized').then(mod => ({ default: mod.FAQOptimized })), {
  loading: () => <div className="py-4 text-center text-foreground/60">Loading FAQ...</div>,
});

export interface PlanIntegrationMeta {
  title: string;
  description: string;
  canonical?: string;
}

export interface PlanIntegrationHero {
  eyebrow?: string;
  h1: string;
  subhead: string;
  supporting?: string;
  ctas?: {
    primaryHref: string;
    primaryLabel: string;
    secondary?: { href: string; label: string } | 'video';
  };
}

export interface PlanIntegrationValueBullet {
  title: string;
  description: string;
}

export interface PlanIntegrationNote {
  title: string;
  description: string;
}

export interface PlanIntegrationQuickstartStep {
  step: string;
  detail: string;
}

export interface PlanIntegrationVerifiedFact {
  claim: string;
  href: string;
  source: 'official' | 'docs' | 'help';
}

export interface PlanIntegrationFAQ {
  q: string;
  a: string;
}

export interface PlanIntegrationContent {
  meta: PlanIntegrationMeta;
  hero: PlanIntegrationHero;
  intro?: string;
  valueBullets: PlanIntegrationValueBullet[];
  integrationNotes: PlanIntegrationNote[];
  quickstart: PlanIntegrationQuickstartStep[];
  verifiedFacts: PlanIntegrationVerifiedFact[];
  faq?: PlanIntegrationFAQ[];
  jsonLd?: unknown;
}

interface PlanIntegrationLayoutProps {
  content: PlanIntegrationContent;
  location: string;
}

export function PlanIntegrationLayout({ content, location }: PlanIntegrationLayoutProps) {
  const { hero, intro, valueBullets, integrationNotes, quickstart, verifiedFacts, faq, jsonLd } = content;

  return (
    <>
      {jsonLd && <StructuredData data={jsonLd} />}
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />

        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 lg:py-32 px-4">
            <div className="container mx-auto max-w-6xl space-y-16">
              {/* Hero */}
              <div className="text-center space-y-6">
                {hero.eyebrow && (
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium">
                    <Terminal className="w-4 h-4" />
                    <span>{hero.eyebrow}</span>
                  </div>
                )}
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  {hero.h1}
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  {hero.subhead}
                </p>
                {hero.supporting && (
                  <p className="text-base sm:text-lg text-foreground/70 max-w-2xl mx-auto">
                    {hero.supporting}
                  </p>
                )}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  {hero.ctas ? (
                    <>
                      <Button variant="cta" size="lg" asChild>
                        <Link href={hero.ctas.primaryHref}>{hero.ctas.primaryLabel}</Link>
                      </Button>
                      {hero.ctas.secondary === 'video' ? (
                        <VideoButtonOptimized />
                      ) : hero.ctas.secondary ? (
                        <Button variant="outline" size="lg" asChild>
                          <Link href={hero.ctas.secondary.href}>{hero.ctas.secondary.label}</Link>
                        </Button>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <Button variant="cta" size="lg" asChild>
                        <Link href="/downloads">Install PlanToCode</Link>
                      </Button>
                      <VideoButtonOptimized />
                    </>
                  )}
                </div>
                <p className="text-sm text-foreground/60">$5 free credits • Pay-as-you-go • Works with all major AI coding tools</p>
              </div>

              {/* Optional intro paragraph for authenticity */}
              {intro && (
                <div className="max-w-3xl mx-auto">
                  <GlassCard className="p-6">
                    <p className="text-foreground/80 leading-relaxed">{intro}</p>
                  </GlassCard>
                </div>
              )}

              {/* Value bullets section */}
              {valueBullets.length > 0 && (
                <div className="space-y-8">
                  <h2 className="text-2xl sm:text-3xl font-bold text-center">What PlanToCode gives you here</h2>
                  <div className="grid md:grid-cols-2 gap-6">
                    {valueBullets.map((item, index) => (
                      <GlassCard key={index} className="p-6 h-full" highlighted>
                        <h3 className="text-lg font-semibold mb-3">{item.title}</h3>
                        <p className="text-sm text-foreground/70 leading-relaxed">{item.description}</p>
                      </GlassCard>
                    ))}
                  </div>
                </div>
              )}

              {/* Integration notes section */}
              {integrationNotes.length > 0 && (
                <div className="space-y-8">
                  <h2 className="text-2xl sm:text-3xl font-bold text-center">How it works with this tool</h2>
                  <div className="grid md:grid-cols-2 gap-6">
                    {integrationNotes.map((item, index) => (
                      <GlassCard key={index} className="p-6 h-full">
                        <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                        <p className="text-sm text-foreground/70 leading-relaxed">{item.description}</p>
                      </GlassCard>
                    ))}
                  </div>
                </div>
              )}

              {/* Quickstart section */}
              {quickstart.length > 0 && (
                <div className="space-y-6">
                  <GlassCard className="p-8" highlighted>
                    <div className="flex items-start gap-4">
                      <div className="mt-1">
                        <CheckCircle2 className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h2 className="text-2xl sm:text-3xl font-bold mb-4">Quickstart</h2>
                        <ol className="space-y-4 text-foreground/80 text-sm sm:text-base">
                          {quickstart.map((item, index) => (
                            <li key={index} className="flex gap-3">
                              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold">
                                {index + 1}
                              </span>
                              <div>
                                <div className="font-semibold text-foreground mb-1">{item.step}</div>
                                <p className="leading-relaxed">{item.detail}</p>
                              </div>
                            </li>
                          ))}
                        </ol>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              )}

              {/* Verified facts section */}
              {verifiedFacts.length > 0 && (
                <div className="space-y-6">
                  <h2 className="text-2xl sm:text-3xl font-bold text-center">Verified from official sources</h2>
                  <GlassCard className="p-6">
                    <div className="space-y-3">
                      {verifiedFacts.map((item, index) => (
                        <div key={index} className="flex items-start gap-3">
                          <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm text-foreground/80 mb-1">{item.claim}</p>
                            <LinkWithArrow href={item.href} external className="text-xs">
                              {item.source === 'official' ? 'Official docs' : item.source === 'docs' ? 'Documentation' : 'Help center'}
                            </LinkWithArrow>
                          </div>
                        </div>
                      ))}
                    </div>
                  </GlassCard>
                </div>
              )}

              {/* FAQ section */}
              {faq && faq.length > 0 && (
                <FAQOptimized />
              )}

              {/* CTA footer */}
              <div>
                <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto text-center" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">Ready to get started?</h2>
                  <p className="text-lg text-foreground/80 mb-8">
                    Plan software changes before you code. Review scope, merge multi-model insights, and execute with full visibility.
                  </p>
                  <PlatformDownloadSection location={location} />
                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                    <LinkWithArrow href="/demo">Watch the interactive demo</LinkWithArrow>
                    <span className="hidden sm:inline">•</span>
                    <LinkWithArrow href="/support#book">Book an architect session</LinkWithArrow>
                  </div>
                </GlassCard>
              </div>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
