// PPR only available in Next.js canary versions
// export const experimental_ppr = true;

import type { Metadata } from 'next';
import { LOCALES } from '@/i18n/config';
import { StructuredData } from '@/components/seo/StructuredData';
import { Header } from '@/components/landing/Header';
import { GovernanceSection } from '@/components/landing/GovernanceSection';
import { IntegrationsSection } from '@/components/landing/IntegrationsSection';
import { FAQ } from '@/components/landing/FAQ';
import { Footer } from '@/components/landing/Footer';
import { cdnUrl } from '@/lib/cdn';
import type { SoftwareApplication, VideoObject, ImageObject, Organization, WebSite } from 'schema-dts';
import { SectionDividerMesh } from '@/components/ui/SectionDivider';
import { HomePageClient } from '@/components/landing/HomePageClient';
import { loadMessagesFor } from '@/lib/i18n';
import { ScreenshotGallery } from '@/components/demo/ScreenshotGallery';
import { GlassCard } from '@/components/ui/GlassCard';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }>}): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessagesFor(locale as any, ['common', 'pages']);
  const title = t['home.meta.title'];
  const description = t['home.meta.description'];

  // Determine OpenGraph locale values based on current locale
  const ogLocale = locale === 'de' ? 'de_DE' : locale === 'fr' ? 'fr_FR' : locale === 'es' ? 'es_ES' : locale === 'ko' ? 'ko_KR' : locale === 'ja' ? 'ja_JP' : 'en_US';
  // Include all other locales as alternates (excluding current locale)
  const allOgLocales = ['en_US', 'de_DE', 'fr_FR', 'es_ES', 'ko_KR', 'ja_JP'];
  const ogAlternateLocale = allOgLocales.filter(l => l !== ogLocale);

  // Build canonical URL based on locale
  const siteUrl = 'https://www.plantocode.com';
  const canonicalPath = locale === 'en' ? '' : `/${locale}`;
  const canonicalUrl = `${siteUrl}${canonicalPath}`;

  return {
    title,
    description,
    keywords: [
      'tauri desktop architecture',
      'rust workflow orchestrator',
      'sqlite persistence layer',
      'pty terminal sessions',
      'llm orchestration pipeline',
      'implementation plan processor',
      'multi-model planning',
      'file discovery workflow',
      'plan merge processor',
      'ai development workspace',
      'llm streaming api',
      'background job processors',
      'prompt configuration',
      'local-first ai tooling',
    ],
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: 'PlanToCode',
      images: [{
        url: cdnUrl('/images/og-image.png'),
        width: 1200,
        height: 630,
        alt: 'PlanToCode - Review plans before agents run',
        type: 'image/png',
      }],
      locale: ogLocale,
      alternateLocale: ogAlternateLocale,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [{
        url: cdnUrl('/images/og-image.png'),
        alt: 'PlanToCode - Review plans before agents run',
        width: 1200,
        height: 630,
      }],
    },
    alternates: {
      canonical: canonicalUrl,
      languages: {
        en: `${siteUrl}`,
        de: `${siteUrl}/de`,
        es: `${siteUrl}/es`,
        fr: `${siteUrl}/fr`,
        ja: `${siteUrl}/ja`,
        ko: `${siteUrl}/ko`,
        'x-default': `${siteUrl}`,
      },
    },
  };
}

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await loadMessagesFor(locale as any, ['home', 'common']);
  const heroTitle = typeof t['technicalLanding.title'] === 'string'
    ? t['technicalLanding.title']
    : '';
  const heroDescription = typeof t['technicalLanding.description'] === 'string'
    ? t['technicalLanding.description']
    : '';
  const heroNote = typeof t['technicalLanding.note'] === 'string'
    ? t['technicalLanding.note']
    : '';
  const heroNoteLink = typeof t['technicalLanding.noteLink'] === 'string'
    ? t['technicalLanding.noteLink']
    : '';
  const walkthroughTitle = typeof t['gallery.video.title'] === 'string'
    ? t['gallery.video.title']
    : '';
  const walkthroughDescription = typeof t['gallery.video.description'] === 'string'
    ? t['gallery.video.description']
    : '';
  const badgeLabel = (typeof t['nav.architecture'] === 'string' ? t['nav.architecture'] : '')
    || (typeof t['footer.architecture'] === 'string' ? t['footer.architecture'] : '');
  const heroPrimaryCta = typeof t['hero.cta.viewDemo'] === 'string'
    ? t['hero.cta.viewDemo']
    : '';
  const heroSecondaryCta = typeof t['hero.cta.howItWorks'] === 'string'
    ? t['hero.cta.howItWorks']
    : '';
  const titleParts = heroTitle.split(':');
  const titleLead = titleParts[0]?.trim();
  const titleRest = titleParts.slice(1).join(':').trim();
  const walkthroughBullets = Array.isArray(t['gallery.video.bullets'])
    ? (t['gallery.video.bullets'] as string[])
    : [];

  const organizationJsonLd: Organization = {
    '@type': 'Organization',
    name: 'PlanToCode',
    url: 'https://www.plantocode.com',
    logo: {
      '@type': 'ImageObject',
      url: 'https://www.plantocode.com/images/icon.webp',
      width: '512',
      height: '512'
    },
    description: 'AI-assisted development workspace focused on planning, review, and execution handoff.',
    foundingDate: '2024',
    sameAs: [
      'https://github.com/plantocode',
      'https://twitter.com/helpfulbits_com',
      'https://x.com/helpfulbits_com'
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'Customer Support',
      url: 'https://www.plantocode.com/support',
      availableLanguage: ['English', 'German', 'French', 'Spanish', 'Japanese', 'Korean']
    },
    // @ts-ignore - address is valid but optional in schema.org
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'US'
    }
  };

  const websiteJsonLd: WebSite = {
    '@type': 'WebSite',
    name: 'PlanToCode',
    url: 'https://www.plantocode.com',
    description: 'Plan-first workspace for reviewing, merging, and handing off implementation plans before agents run.',
    inLanguage: 'en-US',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: 'https://www.plantocode.com/docs?q={search_term_string}',
      },
      // @ts-ignore - query-input is a valid schema.org property but not in the TypeScript types
      'query-input': 'required name=search_term_string',
    },
  };

  const softwareApplicationJsonLd: SoftwareApplication = {
    '@type': 'SoftwareApplication',
    name: 'PlanToCode',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: ['Windows 10+', 'macOS 11.0+'],
    url: 'https://www.plantocode.com',
    description: 'Desktop planning workspace with multi-model plans, review gates, and execution handoff.',
    offers: {
      '@type': 'Offer',
      price: 0,
      priceCurrency: 'USD',
      description: 'Hosted app uses managed providers; self-hosting supports bring-your-own-key.',
    },
    downloadUrl: 'https://www.plantocode.com/downloads',
    softwareVersion: '1.0.23',
    // Note: aggregateRating and review should be added when visible on the page
  };

  // Video structured data for better indexing
  const videoStructuredData: VideoObject[] = [
    {
      '@type': 'VideoObject',
      name: 'File Discovery Pipeline Walkthrough',
      description: 'Walkthrough of the staged file finder workflow generating search patterns, relevance scoring, and prioritized selections before they are applied to a session.',
      thumbnailUrl: cdnUrl('/assets/images/step-2-poster.jpg'),
      contentUrl: cdnUrl('/assets/videos/step-2-find.mp4'),
      uploadDate: '2025-09-20T00:00:00Z',
      duration: 'PT50S',
      embedUrl: 'https://www.plantocode.com/#walkthrough',
    },
    {
      '@type': 'VideoObject',
      name: 'Multi-Model Plan Generation and Merge',
      description: 'Demonstrates generating implementation plans from configured models and merging them into a single draft with structured prompts.',
      thumbnailUrl: cdnUrl('/assets/images/step-4-poster.jpg'),
      contentUrl: cdnUrl('/assets/videos/step-4-merge.mp4'),
      uploadDate: '2025-09-20T00:00:00Z',
      duration: 'PT60S',
      embedUrl: 'https://www.plantocode.com/#walkthrough',
    },
    {
      '@type': 'VideoObject',
      name: 'Deep Research and Context Analysis',
      description: 'Shows background jobs collecting additional context and impact analysis before implementation planning begins.',
      thumbnailUrl: cdnUrl('/assets/images/step-3-poster.jpg'),
      contentUrl: cdnUrl('/assets/videos/step-3-generate.mp4'),
      uploadDate: '2025-09-20T00:00:00Z',
      duration: 'PT55S',
      embedUrl: 'https://www.plantocode.com/#walkthrough',
    },
    {
      '@type': 'VideoObject',
      name: 'AI Text Enhancement',
      description: 'Illustrates using the text improvement tools to enrich task descriptions with goals, constraints, and affected areas before planning.',
      thumbnailUrl: cdnUrl('/assets/images/step-1-text-poster.jpg'),
      contentUrl: cdnUrl('/assets/videos/step-1-text.mp4'),
      uploadDate: '2025-09-20T00:00:00Z',
      duration: 'PT45S',
      embedUrl: 'https://www.plantocode.com/#walkthrough',
    },
    {
      '@type': 'VideoObject',
      name: 'Voice Dictation Pipeline',
      description: 'Highlights the voice transcription pipeline that turns spoken input into task descriptions or terminal commands.',
      thumbnailUrl: cdnUrl('/assets/images/step-1-voice-poster.jpg'),
      contentUrl: cdnUrl('/assets/videos/step-1-voice.mp4'),
      uploadDate: '2025-09-20T00:00:00Z',
      duration: 'PT30S',
      embedUrl: 'https://www.plantocode.com/#walkthrough',
    },
    {
      '@type': 'VideoObject',
      name: 'Screen Recording Analysis',
      description: 'Captures how screen recordings are analyzed to extract technical details into implementation plans.',
      thumbnailUrl: cdnUrl('/assets/images/step-1-video-poster.jpg'),
      contentUrl: cdnUrl('/assets/videos/step-1-video.mp4'),
      uploadDate: '2025-09-20T00:00:00Z',
      duration: 'PT40S',
      embedUrl: 'https://www.plantocode.com/#walkthrough',
    },
    {
      '@type': 'VideoObject',
      name: 'Settings and Prompt Customization',
      description: 'Covers configuring models, editing system prompts, and adjusting project defaults for the planning pipeline.',
      thumbnailUrl: cdnUrl('/assets/images/step-5-poster.jpg'),
      contentUrl: cdnUrl('/assets/videos/step-5-customize.mp4'),
      uploadDate: '2025-09-20T00:00:00Z',
      duration: 'PT45S',
      embedUrl: 'https://www.plantocode.com/#walkthrough',
    },
  ];

  // Image structured data for better indexing
  const imageStructuredData: ImageObject[] = [
    {
      '@type': 'ImageObject',
      name: 'PlanToCode App Icon',
      description: 'PlanToCode logo featuring a compass navigation symbol in a white circle with mountain silhouettes at the bottom, on a teal-blue gradient background',
      contentUrl: 'https://www.plantocode.com/images/icon.webp',
      thumbnailUrl: 'https://www.plantocode.com/images/icon.webp',
      width: '512',
      height: '512',
    },
    {
      '@type': 'ImageObject',
      name: 'File Discovery Pipeline',
      description: 'Screenshot showing the file discovery interface with generated search patterns and relevance ranking.',
      contentUrl: cdnUrl('/assets/images/demo-file-finder.jpg'),
      thumbnailUrl: cdnUrl('/assets/images/demo-file-finder.jpg'),
    },
    {
      '@type': 'ImageObject',
      name: 'Multi-Model Implementation Plans',
      description: 'Interface showing implementation plans from multiple configured models merged into a single draft.',
      contentUrl: cdnUrl('/assets/images/demo-implementation-plans.jpg'),
      thumbnailUrl: cdnUrl('/assets/images/demo-implementation-plans.jpg'),
    },
    {
      '@type': 'ImageObject',
      name: 'Video Analysis Feature',
      description: 'Screen recording analysis interface showing technical detail extraction from visual context',
      contentUrl: cdnUrl('/assets/images/demo-video-analysis.jpg'),
      thumbnailUrl: cdnUrl('/assets/images/demo-video-analysis.jpg'),
    },
    {
      '@type': 'ImageObject',
      name: 'Settings and Prompt Customization',
      description: 'Configuration interface for AI models, system prompts, and workflow customization for plan generation.',
      contentUrl: cdnUrl('/assets/images/demo-settings-prompts.jpg'),
      thumbnailUrl: cdnUrl('/assets/images/demo-settings-prompts.jpg'),
    },
  ];

  return (
    <>
      <StructuredData data={organizationJsonLd} />
      <StructuredData data={websiteJsonLd} />
      <StructuredData data={softwareApplicationJsonLd} />
      {videoStructuredData.map((video, index) => (
        <StructuredData key={`video-${index}`} data={video} />
      ))}
      {imageStructuredData.map((image, index) => (
        <StructuredData key={`image-${index}`} data={image} />
      ))}
      <HomePageClient>
        {/* Background gradient */}
        <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
        {/* Page content */}
        <div className="relative z-0 bg-transparent">
          <Header />

          <main className="flex-grow">
            <section className="relative overflow-hidden border-b border-border/40 py-16">
              <div className="pointer-events-none absolute inset-0 -z-10">
                <div
                  className="absolute -top-28 left-1/2 h-72 w-[1100px] -translate-x-1/2 rounded-full opacity-70 blur-3xl"
                  style={{
                    background: 'radial-gradient(circle, oklch(0.68 0.085 195 / 0.16), transparent 60%)',
                  }}
                />
                <div
                  className="absolute inset-0 opacity-40"
                  style={{
                    backgroundImage: `
                      linear-gradient(90deg, oklch(0.68 0.085 195 / 0.08) 1px, transparent 1px),
                      linear-gradient(180deg, oklch(0.68 0.085 195 / 0.08) 1px, transparent 1px)
                    `,
                    backgroundSize: '48px 48px',
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/30 to-background/80" />
              </div>

              <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-24 pb-16 sm:pt-28 sm:pb-20 lg:pt-32 lg:pb-24">
                <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] items-center">
                  <div className="space-y-6">
                    {badgeLabel ? (
                      <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                        {badgeLabel}
                      </div>
                    ) : null}
                    <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl text-hero-title">
                      {titleRest ? (
                        <>
                          <span className="text-hero-title-gradient">{titleLead}</span>
                          <span className="block">{titleRest}</span>
                        </>
                      ) : (
                        <span className="text-hero-title-gradient">{heroTitle}</span>
                      )}
                    </h1>
                    <p className="text-lg text-foreground/80 sm:text-xl max-w-2xl">
                      {heroDescription}
                    </p>
                    {(heroPrimaryCta || heroSecondaryCta) ? (
                      <div className="flex flex-wrap items-center gap-3">
                        {heroPrimaryCta ? (
                          <Button asChild size="lg" variant="cta">
                            <Link href="/downloads">{heroPrimaryCta}</Link>
                          </Button>
                        ) : null}
                        {heroSecondaryCta ? (
                          <Button asChild size="lg" variant="outline">
                            <Link href="/docs/implementation-plans">{heroSecondaryCta}</Link>
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                    {(heroNote && heroNoteLink) ? (
                      <div className="text-xs text-muted-foreground">
                        <span>{heroNote} </span>
                        <Link href="/docs/server-setup" className="underline decoration-dashed underline-offset-4 hover:text-foreground">
                          {heroNoteLink}
                        </Link>
                      </div>
                    ) : null}
                    {Array.isArray(t['technicalLanding.tags']) ? (
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {(t['technicalLanding.tags'] as string[]).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-border/60 bg-background/80 px-3 py-1"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <GlassCard highlighted className="p-6 lg:p-8">
                    <div className="space-y-4">
                      {walkthroughTitle ? (
                        <h2 className="text-lg font-semibold text-foreground sm:text-xl">
                          {walkthroughTitle}
                        </h2>
                      ) : null}
                      {walkthroughDescription ? (
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {walkthroughDescription}
                        </p>
                      ) : null}
                      {walkthroughBullets.length ? (
                        <ul className="space-y-3 pt-2">
                          {walkthroughBullets.map((bullet) => (
                            <li key={bullet} className="flex items-start gap-3 text-sm text-muted-foreground">
                              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary/70" />
                              <span>{bullet}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  </GlassCard>
                </div>
              </div>
            </section>
            <SectionDividerMesh />

            <section className="py-12 lg:py-16">
              <GovernanceSection />
            </section>
            <SectionDividerMesh />

            <section id="walkthrough" className="py-12 lg:py-16">
              <div className="container mx-auto max-w-6xl">
                <ScreenshotGallery />
              </div>
            </section>
            <SectionDividerMesh />

            <IntegrationsSection />
            <SectionDividerMesh />

            <FAQ />
          </main>
          <Footer />
        </div>
      </HomePageClient>
    </>
  );
}
