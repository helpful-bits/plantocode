import type { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { MacDownloadButton } from '@/components/ui/MacDownloadButton';
import { WindowsStoreButton } from '@/components/ui/WindowsStoreButton';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { CheckCircle2, Shield, Smartphone, Tablet } from 'lucide-react';
import { Header } from '@/components/landing/Header';
import { cdnUrl } from '@/lib/cdn';

import { loadMessages, type Locale } from '@/lib/i18n';
import { locales } from '@/i18n/config';

export const metadata: Metadata = {
  title: 'Download PlanToCode - macOS & Windows | Free Trial',
  description: 'Download PlanToCode for macOS and Windows. Free $5 credits. Plan multi-file changes with AI, review before execution. No credit card required.',
  keywords: [
    'plantocode download',
    'ai architect studio',
    'integrated terminal download',
    'claude terminal',
    'codex integration',
    'microsoft store',
    'macos developer tools',
    'heavy coding agent users',
    'implementation planning tool',
    'ai code planning',
    'cursor alternative',
  ],
  openGraph: {
    title: 'Download PlanToCode',
    description: 'Download PlanToCode for Windows and macOS. Multi-model planning with an integrated terminal for claude, cursor, codex, and gemini. Available on Microsoft Store.',
    url: 'https://www.plantocode.com/downloads',
    siteName: 'PlanToCode',
    type: 'website',
    locale: 'en_US',
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
  },
  alternates: {
    canonical: 'https://www.plantocode.com/downloads',
    languages: {
      'en-US': 'https://www.plantocode.com/downloads',
      'en': 'https://www.plantocode.com/downloads',
    },
  },
};

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default async function DownloadPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return (
    <>
      {/* Background gradient */}
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />

      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />

        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 lg:py-32 px-4">
            <div className="container mx-auto max-w-4xl">
              <div className="text-center mb-12">
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  {t['downloads.hero.title']}
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl mb-8 text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  {t['downloads.hero.subtitle']}
                </p>
              </div>

              <div className="grid gap-8 md:gap-12">
                {/* macOS Section */}
                <GlassCard>
                    <div className="p-8 sm:p-12">
                      <div className="flex items-center gap-4 mb-6">
                        <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-gradient-to-br from-primary via-primary/90 to-accent">
                          <svg
                            width="32"
                            height="32"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            className="w-8 h-8 text-primary-foreground"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                          </svg>
                        </div>
                        <div>
                          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">{t['downloads.macos.title']}</h2>
                          <p className="text-foreground/60">{t['downloads.macos.subtitle']}</p>
                        </div>
                      </div>

                      <div className="mb-8">
                        <h3 className="text-lg font-semibold mb-4 text-foreground">{t['downloads.macos.requirements.title']}</h3>
                        <ul className="space-y-2 text-foreground/80">
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-primary/70 flex-shrink-0" />
                            <span>{t['downloads.macos.requirements.os']}</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-primary/70 flex-shrink-0" />
                            <span>{t['downloads.macos.requirements.processor']}</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-primary/70 flex-shrink-0" />
                            <span>{t['downloads.macos.requirements.ram']}</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-primary/70 flex-shrink-0" />
                            <span>{t['downloads.macos.requirements.internet']}</span>
                          </li>
                        </ul>
                      </div>

                      <div className="mb-8">
                        <GlassCard className="bg-primary/5 border-primary/20">
                          <div className="p-4 flex items-start gap-3">
                            <Shield className="w-5 h-5 text-primary/70 flex-shrink-0 mt-0.5" />
                            <div>
                              <h4 className="font-semibold text-foreground mb-1">{t['downloads.macos.professional.title']}</h4>
                              <p className="text-sm text-foreground/80 leading-relaxed">
                                {t['downloads.macos.professional.description']}
                              </p>
                            </div>
                          </div>
                        </GlassCard>
                      </div>

                      <div className="flex justify-center">
                        <MacDownloadButton
                          location="download_page_mac"
                          size="lg"
                          className="min-w-[200px]"
                        />
                      </div>
                    </div>
                </GlassCard>

                {/* Windows Section */}
                <GlassCard>
                    <div className="p-8 sm:p-12">
                      <div className="flex items-center gap-4 mb-6">
                        <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700">
                          <svg
                            width="32"
                            height="32"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            className="w-8 h-8 text-white"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-13.051-1.351"/>
                          </svg>
                        </div>
                        <div>
                          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">{t['downloads.windows.title']}</h2>
                          <p className="text-foreground/60">{t['downloads.windows.subtitle']}</p>
                        </div>
                      </div>

                      <div className="mb-8">
                        <h3 className="text-lg font-semibold mb-4 text-foreground">{t['downloads.windows.requirements.title']}</h3>
                        <ul className="space-y-2 text-foreground/80">
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-primary/70 flex-shrink-0" />
                            <span>{t['downloads.windows.requirements.os1']}</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-primary/70 flex-shrink-0" />
                            <span>{t['downloads.windows.requirements.os2']}</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-primary/70 flex-shrink-0" />
                            <span>{t['downloads.windows.requirements.processor']}</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-primary/70 flex-shrink-0" />
                            <span>{t['downloads.windows.requirements.ram']}</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-primary/70 flex-shrink-0" />
                            <span>{t['downloads.windows.requirements.internet']}</span>
                          </li>
                        </ul>
                      </div>

                      <div className="mb-8">
                        <GlassCard className="bg-primary/5 border-primary/20">
                          <div className="p-4 flex items-start gap-3">
                            <Shield className="w-5 h-5 text-primary/70 flex-shrink-0 mt-0.5" />
                            <div>
                              <h4 className="font-semibold text-foreground mb-1">{t['downloads.windows.integration.title']}</h4>
                              <p className="text-sm text-foreground/80 leading-relaxed">
                                {t['downloads.windows.integration.description']}
                              </p>
                            </div>
                          </div>
                        </GlassCard>
                      </div>

                      <div className="flex justify-center">
                        <WindowsStoreButton size="large" />
                      </div>
                    </div>
                </GlassCard>

                {/* Mobile App Coming Soon */}
                <GlassCard>
                    <div className="p-8 sm:p-12">
                      <div className="flex items-center gap-4 mb-6">
                        <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-gradient-to-br from-gray-500 via-gray-600 to-gray-700">
                          <div className="flex gap-2">
                            <Smartphone className="w-6 h-6 text-white" />
                            <Tablet className="w-6 h-6 text-white" />
                          </div>
                        </div>
                        <div>
                          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">{t['downloads.mobile.title']}</h2>
                          <p className="text-foreground/60">{t['downloads.mobile.subtitle']}</p>
                        </div>
                      </div>

                      <div className="mb-8">
                        <h3 className="text-lg font-semibold mb-4 text-foreground">{t['downloads.mobile.features.title']}</h3>
                        <ul className="space-y-2 text-foreground/80">
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-primary/70 flex-shrink-0" />
                            <span>{t['downloads.mobile.features.review']}</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-primary/70 flex-shrink-0" />
                            <span>{t['downloads.mobile.features.voice']}</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-primary/70 flex-shrink-0" />
                            <span>{t['downloads.mobile.features.monitor']}</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-primary/70 flex-shrink-0" />
                            <span>{t['downloads.mobile.features.sync']}</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-primary/70 flex-shrink-0" />
                            <span>{t['downloads.mobile.features.design']}</span>
                          </li>
                        </ul>
                      </div>

                      <div className="mb-8">
                        <GlassCard className="bg-primary/5 border-primary/20">
                          <div className="p-4 flex items-start gap-3">
                            <Shield className="w-5 h-5 text-primary/70 flex-shrink-0 mt-0.5" />
                            <div>
                              <h4 className="font-semibold text-foreground mb-1">{t['downloads.mobile.connected.title']}</h4>
                              <p className="text-sm text-foreground/80 leading-relaxed">
                                {t['downloads.mobile.connected.description']}
                              </p>
                            </div>
                          </div>
                        </GlassCard>
                      </div>

                      <div className="flex justify-center">
                        <button
                          disabled
                          className="px-8 py-3 bg-gray-500 text-white font-semibold rounded-lg opacity-50 cursor-not-allowed"
                        >
                          {t['downloads.mobile.button']}
                        </button>
                      </div>
                    </div>
                </GlassCard>

                {/* Trust Indicators */}
                <GlassCard highlighted>
                    <div className="p-8 sm:p-12">
                      <h3 className="text-2xl font-bold text-center mb-8">{t['downloads.trust.title']}</h3>
                      <div className="grid sm:grid-cols-2 gap-6">
                        <div>
                          <h4 className="font-semibold mb-2">{t['downloads.trust.terminal.title']}</h4>
                          <p className="text-foreground/80 text-sm">
                            {t['downloads.trust.terminal.description']}
                          </p>
                        </div>
                        <div>
                          <h4 className="font-semibold mb-2">{t['downloads.trust.planning.title']}</h4>
                          <p className="text-foreground/80 text-sm">
                            {t['downloads.trust.planning.description']}
                          </p>
                        </div>
                        <div>
                          <h4 className="font-semibold mb-2">{t['downloads.trust.professional.title']}</h4>
                          <p className="text-foreground/80 text-sm">
                            {t['downloads.trust.professional.description']}
                          </p>
                        </div>
                        <div>
                          <h4 className="font-semibold mb-2">{t['downloads.trust.pricing.title']}</h4>
                          <p className="text-foreground/80 text-sm">
                            {t['downloads.trust.pricing.description']}
                          </p>
                        </div>
                      </div>
                    </div>
                </GlassCard>

                {/* Additional CTAs */}
                <div className="text-center">
                    <h3 className="text-xl font-semibold mb-4 text-foreground">{t['downloads.cta.title']}</h3>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
                      <LinkWithArrow href="/schedule" className="font-semibold">{t['downloads.cta.architect']}</LinkWithArrow>
                      <span className="hidden sm:inline text-foreground/40">•</span>
                      <LinkWithArrow href="/schedule" className="font-semibold">{t['downloads.cta.professional']}</LinkWithArrow>
                      <span className="hidden sm:inline text-foreground/40">•</span>
                      <LinkWithArrow href="/docs/terminal-sessions" className="font-semibold">{t['downloads.cta.docs']}</LinkWithArrow>
                    </div>
                    <p className="text-sm text-foreground/60">
                      {t['downloads.cta.footer']}
                    </p>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}