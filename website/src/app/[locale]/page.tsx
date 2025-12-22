// PPR only available in Next.js canary versions
// export const experimental_ppr = true;

import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { LOCALES } from '@/i18n/config';
import { StructuredData } from '@/components/seo/StructuredData';
import { Header } from '@/components/landing/Header';
import { HeroSection } from '@/components/landing/HeroSection';
import { cdnUrl } from '@/lib/cdn';
import type { SoftwareApplication, FAQPage, VideoObject, ImageObject, Organization, WebSite } from 'schema-dts';
import { SectionDividerMesh } from '@/components/ui/SectionDivider';
import { HomePageClient } from '@/components/landing/HomePageClient';
import enFaqMessages from '@/messages/en/home.json';
import { loadMessagesFor } from '@/lib/i18n';


const Pricing = dynamic(() => import('@/components/landing/Pricing').then(mod => ({ default: mod.Pricing })), {
  loading: () => <div className="h-[40vh]" />,
});

const FAQ = dynamic(() => import('@/components/landing/FAQ').then(mod => ({ default: mod.FAQ })), {
  loading: () => <div className="h-[50vh]" />,
});

const CallToAction = dynamic(() => import('@/components/landing/CallToAction').then(mod => ({ default: mod.CallToAction })), {
  loading: () => <div className="h-[30vh]" />,
});

const GovernanceSection = dynamic(() => import('@/components/landing/GovernanceSection').then(mod => ({ default: mod.GovernanceSection })), {
  loading: () => <div className="h-[30vh]" />,
});

const SpecificationCaptureSection = dynamic(() => import('@/components/landing/SpecificationCaptureSection').then(mod => ({ default: mod.SpecificationCaptureSection })), {
  loading: () => <div className="h-[30vh]" />,
});

const ProblemsSection = dynamic(() => import('@/components/landing/ProblemsSection').then(mod => ({ default: mod.ProblemsSection })), {
  loading: () => <div className="h-[30vh]" />,
});

const IntegrationsSection = dynamic(() => import('@/components/landing/IntegrationsSection').then(mod => ({ default: mod.IntegrationsSection })), {
  loading: () => <div className="h-[30vh]" />,
});

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }>}): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessagesFor(locale as any, ['common', 'pages']);

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
    title: t['home.meta.title'],
    description: t['home.meta.description'],
    keywords: [
      'ai code planning',
      'implementation planning tool',
      'prevent duplicate files ai',
      'ai code review',
      'cursor alternative',
      'safe refactoring tool',
      'legacy code planning',
      'human-in-the-loop ai',
      'corporate ai governance',
      'file-by-file implementation plans',
      'legacy codebase planning',
      'ai plan approval workflow',
      'ai plan editor',
      'monaco editor plans',
      'merge ai plans',
      'implementation plan editor',
      'merge instructions ai',
      'edit ai generated code',
      'integrated terminal claude code',
      'run claude code in app',
      'codex cli terminal',
      'cursor cli',
      'gemini cli',
      'multi model planning',
      'gpt-5 planning',
      'claude sonnet 4',
      'gemini 2.5 pro',
      'grok 4',
      'deepseek r1',
      'kimi k2',
      'file discovery workflow',
      'voice transcription coding',
      'token estimates',
      'desktop ai planning',
    ],
    openGraph: {
      title: 'PlanToCode - plan and ship code changes',
      description: 'Find impacted files, generate and merge AI plans, run in a persistent terminal.',
      url: canonicalUrl,
      siteName: 'PlanToCode',
      images: [{
        url: cdnUrl('/images/og-image.png'),
        width: 1200,
        height: 630,
        alt: 'PlanToCode - AI Architect Studio with Integrated Terminal',
        type: 'image/png',
      }],
      locale: ogLocale,
      alternateLocale: ogAlternateLocale,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'PlanToCode - plan and ship code changes',
      description: 'Find impacted files, generate and merge AI plans, run in a persistent terminal.',
      images: [{
        url: cdnUrl('/images/og-image.png'),
        alt: 'PlanToCode - AI Architect Studio with Integrated Terminal',
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

export default function Home() {
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
    description: 'Plan and ship code changes - find files, generate and merge AI plans, run them in a persistent terminal.',
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
    description: 'Plan and ship code changes - find files, generate and merge AI plans from multiple models, run them in a persistent terminal.',
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
    description: 'Plan and ship code changes. Find the right files, generate and merge implementation plans from multiple AI models, then run them in a persistent terminal. Available for Windows and macOS.',
    offers: {
      '@type': 'Offer',
      price: 0,
      priceCurrency: 'USD',
      description: 'Pay-as-you-go API usage. No subscriptions or seat licenses.',
    },
    downloadUrl: 'https://www.plantocode.com/downloads',
    softwareVersion: '1.0.23',
    // @ts-ignore - isRelatedTo is a valid schema.org property but not in the TypeScript types
    isRelatedTo: [
      {
        '@type': 'SoftwareApplication',
        name: 'Claude Code',
        applicationCategory: 'DeveloperApplication',
        creator: {
          '@type': 'Organization',
          name: 'Anthropic'
        }
      },
      {
        '@type': 'SoftwareApplication',
        name: 'Cursor',
        applicationCategory: 'DeveloperApplication'
      },
      {
        '@type': 'SoftwareApplication',
        name: 'OpenAI Codex',
        applicationCategory: 'DeveloperApplication',
        creator: {
          '@type': 'Organization',
          name: 'OpenAI'
        }
      }
    ],
    // Note: aggregateRating and review should be added when visible on the page
  };

  // FAQ structured data (using English for SEO)
  const FAQ_KEYS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10', 'q11', 'q12', 'q13'] as const;

  const faqPageJsonLd: FAQPage = {
    '@type': 'FAQPage',
    mainEntity: FAQ_KEYS.map(key => ({
      '@type': 'Question',
      name: enFaqMessages.faq.items[key].q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: enFaqMessages.faq.items[key].a,
      },
    })),
  };

  // Video structured data for better indexing
  const videoStructuredData: VideoObject[] = [
    {
      '@type': 'VideoObject',
      name: 'File Discovery & Search in Your Codebase',
      description: 'Walkthrough of the staged file finder workflow generating search patterns, relevance scoring, and prioritized selections before they are applied to a session.',
      thumbnailUrl: cdnUrl('/assets/images/step-2-poster.jpg'),
      contentUrl: cdnUrl('/assets/videos/step-2-find.mp4'),
      uploadDate: '2025-09-20T00:00:00Z',
      duration: 'PT50S',
      embedUrl: 'https://www.plantocode.com/demo#file-discovery',
    },
    {
      '@type': 'VideoObject',
      name: 'Plan Creation & Merge from Multiple AI Models',
      description: 'Demonstrates generating implementation plans from configured models such as Gemini 3 Pro, GPT-5.2, and Claude 4.5 Sonnet, then merging the preferred steps into a single draft.',
      thumbnailUrl: cdnUrl('/assets/images/step-4-poster.jpg'),
      contentUrl: cdnUrl('/assets/videos/step-4-merge.mp4'),
      uploadDate: '2025-09-20T00:00:00Z',
      duration: 'PT60S',
      embedUrl: 'https://www.plantocode.com/demo#plan-merge',
    },
    {
      '@type': 'VideoObject',
      name: 'Deep Research & Context Analysis',
      description: 'Shows background jobs collecting additional context and impact analysis before implementation planning begins.',
      thumbnailUrl: cdnUrl('/assets/images/step-3-poster.jpg'),
      contentUrl: cdnUrl('/assets/videos/step-3-generate.mp4'),
      uploadDate: '2025-09-20T00:00:00Z',
      duration: 'PT55S',
      embedUrl: 'https://www.plantocode.com/demo#deep-research',
    },
    {
      '@type': 'VideoObject',
      name: 'AI Text Enhancement - Task Description',
      description: 'Illustrates using the text improvement tools to enrich task descriptions with goals, constraints, and affected areas before planning.',
      thumbnailUrl: cdnUrl('/assets/images/step-1-text-poster.jpg'),
      contentUrl: cdnUrl('/assets/videos/step-1-text.mp4'),
      uploadDate: '2025-09-20T00:00:00Z',
      duration: 'PT45S',
      embedUrl: 'https://www.plantocode.com/demo#text-improvement',
    },
    {
      '@type': 'VideoObject',
      name: 'Voice Dictation - Faster Input',
      description: 'Highlights the voice transcription pipeline that turns spoken input into task descriptions or terminal commands.',
      thumbnailUrl: cdnUrl('/assets/images/step-1-voice-poster.jpg'),
      contentUrl: cdnUrl('/assets/videos/step-1-voice.mp4'),
      uploadDate: '2025-09-20T00:00:00Z',
      duration: 'PT30S',
      embedUrl: 'https://www.plantocode.com/demo#voice-transcription',
    },
    {
      '@type': 'VideoObject',
      name: 'Screen Recording - Instant Error Capture',
      description: 'Captures how screen recordings are analysed so you can pull technical details into implementation plans.',
      thumbnailUrl: cdnUrl('/assets/images/step-1-video-poster.jpg'),
      contentUrl: cdnUrl('/assets/videos/step-1-video.mp4'),
      uploadDate: '2025-09-20T00:00:00Z',
      duration: 'PT40S',
      embedUrl: 'https://www.plantocode.com/demo#video-analysis',
    },
    {
      '@type': 'VideoObject',
      name: 'Settings & Prompt Customization',
      description: 'Covers configuring models, editing system prompts, and adjusting project defaults for the integrated terminal and planning tasks.',
      thumbnailUrl: cdnUrl('/assets/images/step-5-poster.jpg'),
      contentUrl: cdnUrl('/assets/videos/step-5-customize.mp4'),
      uploadDate: '2025-09-20T00:00:00Z',
      duration: 'PT45S',
      embedUrl: 'https://www.plantocode.com/demo#settings',
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
      name: 'PlanToCode File Discovery Screenshot',
      description: 'Screenshot showing the AI-powered file discovery interface with generated search patterns and relevance ranking.',
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
      description: 'Screen recording analysis interface showing Gemini 3 Pro extracting technical details from visual context',
      contentUrl: cdnUrl('/assets/images/demo-video-analysis.jpg'),
      thumbnailUrl: cdnUrl('/assets/images/demo-video-analysis.jpg'),
    },
    {
      '@type': 'ImageObject',
      name: 'Settings and Prompt Customization',
      description: 'Configuration interface for AI models, system prompts, and workflow customization for Claude Code, Cursor, and OpenAI Codex',
      contentUrl: cdnUrl('/assets/images/demo-settings-prompts.jpg'),
      thumbnailUrl: cdnUrl('/assets/images/demo-settings-prompts.jpg'),
    },
  ];


  return (
    <>
      <StructuredData data={organizationJsonLd} />
      <StructuredData data={websiteJsonLd} />
      <StructuredData data={softwareApplicationJsonLd} />
      <StructuredData data={faqPageJsonLd} />
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
            {/* SR-only content for better Google snippets */}
            <div className="sr-only">
              <h1>Plan software changes before you code</h1>
              <p>PlanToCode helps you find the right files, generate and merge implementation plans, then run them in a persistent terminal. You see scope before you run anything. Plans are editable and traceable.</p>
            </div>
            <section className="mb-0">
              <HeroSection />
            </section>
            <SectionDividerMesh />

            {/* Solve Complex Development Challenges - Internal Linking */}
            <ProblemsSection />
            <SectionDividerMesh />

            {/* Specification Capture Mode */}
            <SpecificationCaptureSection />
            <SectionDividerMesh />

            {/* Human-in-the-loop Implementation Planning */}
            <GovernanceSection />
            <SectionDividerMesh />

            {/* Tool Integrations Section */}
            <IntegrationsSection />
            <SectionDividerMesh />

            <section id="pricing">
              <Pricing />
            </section>
            <SectionDividerMesh />


            <section id="faq" className="pt-8">
              <FAQ />
            </section>
            <SectionDividerMesh />

            <section id="cta" className="pt-8">
              <CallToAction />
            </section>
          </main>
        </div>
      </HomePageClient>
    </>
  );
}