import type { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import { loadMessages, type Locale } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/GlassCard';
import { VideoButton } from '@/components/ui/VideoButton';
import { StructuredData } from '@/components/seo/StructuredData';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { FAQ } from '@/components/landing/FAQ';
import { locales } from '@/i18n/config';
import {
  Sparkles,
  MousePointer2,
  Zap,
  Target,
  FileText,
  Settings,
  CheckCircle2,
  Code2,
} from 'lucide-react';
import type { SoftwareApplication, HowTo, FAQPage } from 'schema-dts';
import { generatePageMetadata, COMMON_KEYWORDS, mergeKeywords } from '@/content/metadata';
export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return {
    ...generatePageMetadata({
      locale,
      slug: '/features/text-improvement',
      title: t['features.textImprovement.meta.title'],
      description: t['features.textImprovement.meta.description'],
    }),
    keywords: mergeKeywords(
      [
    'specification capture mode',
    'text enhancement',
    'task refinement',
    'requirements gathering',
    'corporate specifications',
    'ai requirements analysis',
    'ai text improvement',
    'task description refinement',
    'ai writing assistant developers',
    'claude text improvement',
    'context-aware text refinement',
    'task clarity ai',
    'plantocode text improvement',
  ],
      COMMON_KEYWORDS.core
    ),
  };
}
export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}
export default async function TextImprovementPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);
  const painPoints = [
    {
      title: t['textImprovement.painPoints.vague.title'] ?? '',
      description: t['textImprovement.painPoints.vague.description'] ?? '',
      icon: <Target className="w-5 h-5 text-primary" />,
    },
    {
      title: t['textImprovement.painPoints.rewriting.title'] ?? '',
      description: t['textImprovement.painPoints.rewriting.description'] ?? '',
      icon: <FileText className="w-5 h-5 text-primary" />,
    },
    {
      title: t['textImprovement.painPoints.mentalModels.title'] ?? '',
      description: t['textImprovement.painPoints.mentalModels.description'] ?? '',
      icon: <Sparkles className="w-5 h-5 text-primary" />,
    },
  ];
  const howItWorks = ((t['textImprovement.howItWorks.steps'] ?? []) as Array<{ step: string; description: string }>).map((item: { step: string; description: string }, index: number) => ({
    step: item.step,
    description: item.description,
    icon: [
      <MousePointer2 className="w-5 h-5 text-primary" key="0" />,
      <Sparkles className="w-5 h-5 text-primary" key="1" />,
      <Zap className="w-5 h-5 text-primary" key="2" />,
      <CheckCircle2 className="w-5 h-5 text-primary" key="3" />,
    ][index],
  }));
  const capabilities = [
    {
      title: t['textImprovement.capabilities.contextAware.title'] ?? '',
      description: t['textImprovement.capabilities.contextAware.description'] ?? '',
      icon: <Code2 className="w-8 h-8 text-primary" />,
    },
    {
      title: t['textImprovement.capabilities.customizable.title'] ?? '',
      description: t['textImprovement.capabilities.customizable.description'] ?? '',
      icon: <Settings className="w-8 h-8 text-primary" />,
    },
    {
      title: t['textImprovement.capabilities.mentalModel.title'] ?? '',
      description: t['textImprovement.capabilities.mentalModel.description'] ?? '',
      icon: <Target className="w-8 h-8 text-primary" />,
    },
    {
      title: t['textImprovement.capabilities.instant.title'] ?? '',
      description: t['textImprovement.capabilities.instant.description'] ?? '',
      icon: <Zap className="w-8 h-8 text-primary" />,
    },
  ];
  const useCases = [
    {
      title: t['textImprovement.useCases.clarify.title'] ?? '',
      description: t['textImprovement.useCases.clarify.description'] ?? '',
    },
    {
      title: t['textImprovement.useCases.expand.title'] ?? '',
      description: t['textImprovement.useCases.expand.description'] ?? '',
    },
    {
      title: t['textImprovement.useCases.refine.title'] ?? '',
      description: t['textImprovement.useCases.refine.description'] ?? '',
    },
  ];
  const faqs = [
    {
      question: t['textImprovement.faq.model.question'] ?? '',
      answer: t['textImprovement.faq.model.answer'] ?? '',
    },
    {
      question: t['textImprovement.faq.customize.question'] ?? '',
      answer: t['textImprovement.faq.customize.answer'] ?? '',
    },
    {
      question: t['textImprovement.faq.codeEditor.question'] ?? '',
      answer: t['textImprovement.faq.codeEditor.answer'] ?? '',
    },
    {
      question: t['textImprovement.faq.conflicts.question'] ?? '',
      answer: t['textImprovement.faq.conflicts.answer'] ?? '',
    },
  ];
  const softwareApplicationJsonLd: SoftwareApplication = {
    '@type': 'SoftwareApplication',
    name: 'PlanToCode - Specification Capture Mode',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: ['Windows 10+', 'macOS 11.0+'],
    url: 'https://www.plantocode.com/features/text-improvement',
    description:
      'AI-powered specification capture with two prompt types: Text Enhancement for clarity and grammar, Task Refinement for completeness. Context-aware refinement with customizable prompts.',
    offers: {
      '@type': 'Offer',
      price: 0,
      priceCurrency: 'USD',
      description: 'Free desktop app with pay-as-you-go API usage. $5 free credits on signup.',
    },
  };
  const howToJsonLd: HowTo = {
    '@type': 'HowTo',
    name: 'Improve task descriptions with AI text refinement',
    description: 'Use context-aware AI to refine task descriptions instantly',
    step: howItWorks.map((item, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: item.step,
      text: item.description,
    })),
  };
  const faqJsonLd: FAQPage = {
    '@type': 'FAQPage',
    mainEntity: faqs.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
  const structuredData = {
    '@graph': [softwareApplicationJsonLd, howToJsonLd, faqJsonLd],
  };
  return (
    <>
      <StructuredData data={structuredData} />
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />
        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 lg:py-32 px-4">
            <div className="container mx-auto max-w-6xl space-y-16">
              <div className="text-center space-y-6">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium">
                  <Sparkles className="w-4 h-4" />
                  <span>{t['textImprovement.hero.badge'] ?? ''}</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  {t['textImprovement.hero.title'] ?? ''}
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  {t['textImprovement.hero.description'] ?? ''}
                </p>
                <p className="text-base sm:text-lg text-foreground/70 max-w-2xl mx-auto">
                  {t['textImprovement.hero.subtitle'] ?? ''}
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Button variant="cta" size="lg" asChild>
                    <Link href="/downloads">{t['textImprovement.hero.installButton'] ?? ''}</Link>
                  </Button>
                  <VideoButton />
                </div>
                <p className="text-sm text-foreground/60">{t['textImprovement.hero.credits'] ?? ''}</p>
              </div>
              <div className="space-y-8">
                <h2 className="text-2xl sm:text-3xl font-bold text-center">{t['textImprovement.promptTypes.title'] ?? ''}</h2>
                <div className="grid md:grid-cols-2 gap-6">
                  <GlassCard className="p-6 h-full" highlighted>
                    <div className="flex items-center gap-3 mb-4">
                      <Sparkles className="w-6 h-6 text-primary" />
                      <h3 className="text-xl font-semibold">{t['textImprovement.promptTypes.textEnhancement.title'] ?? ''}</h3>
                    </div>
                    <p className="text-sm text-foreground/70 leading-relaxed mb-4">
                      {t['textImprovement.promptTypes.textEnhancement.description'] ?? ''}
                    </p>
                    <ul className="space-y-2 text-sm text-foreground/70">
                      {((t['textImprovement.promptTypes.textEnhancement.features'] ?? []) as string[]).map((feature: string, index: number) => (
                        <li key={index} className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </GlassCard>
                  <GlassCard className="p-6 h-full" highlighted>
                    <div className="flex items-center gap-3 mb-4">
                      <Target className="w-6 h-6 text-primary" />
                      <h3 className="text-xl font-semibold">{t['textImprovement.promptTypes.taskRefinement.title'] ?? ''}</h3>
                    </div>
                    <p className="text-sm text-foreground/70 leading-relaxed mb-4">
                      {t['textImprovement.promptTypes.taskRefinement.description'] ?? ''}
                    </p>
                    <ul className="space-y-2 text-sm text-foreground/70">
                      {((t['textImprovement.promptTypes.taskRefinement.features'] ?? []) as string[]).map((feature: string, index: number) => (
                        <li key={index} className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </GlassCard>
                </div>
                <p className="text-base text-foreground/70 max-w-4xl mx-auto text-center leading-relaxed">
                  {t['textImprovement.promptTypes.note'] ?? ''}
                </p>
              </div>
              <div className="space-y-8">
                <h2 className="text-2xl sm:text-3xl font-bold text-center">{t['textImprovement.painPoints.title'] ?? ''}</h2>
                <div className="grid md:grid-cols-3 gap-6">
                  {painPoints.map((item, index) => (
                    <GlassCard key={index} className="p-6 h-full">
                      <div className="flex items-start gap-4">
                        <div className="mt-1">{item.icon}</div>
                        <div>
                          <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                          <p className="text-sm text-foreground/70 leading-relaxed">{item.description}</p>
                        </div>
                      </div>
                    </GlassCard>
                  ))}
                </div>
              </div>
              <div className="space-y-8">
                <h2 className="text-2xl sm:text-3xl font-bold text-center">{t['textImprovement.howItWorks.title'] ?? ''}</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {howItWorks.map((item, index) => (
                    <GlassCard key={index} className="p-6 h-full" highlighted>
                      <div className="flex items-center gap-2 mb-3">
                        {item.icon}
                        <span className="font-semibold">{item.step}</span>
                      </div>
                      <p className="text-sm text-foreground/70 leading-relaxed">{item.description}</p>
                    </GlassCard>
                  ))}
                </div>
              </div>
              <div className="space-y-8">
                <h2 className="text-2xl sm:text-3xl font-bold text-center">{t['textImprovement.capabilities.title'] ?? ''}</h2>
                <div className="grid md:grid-cols-2 gap-6">
                  {capabilities.map((item, index) => (
                    <GlassCard key={index} className="p-6 h-full" highlighted>
                      <div className="text-primary mb-4">{item.icon}</div>
                      <h3 className="text-lg font-semibold mb-3">{item.title}</h3>
                      <p className="text-sm text-foreground/70 leading-relaxed">{item.description}</p>
                    </GlassCard>
                  ))}
                </div>
              </div>
              <div className="space-y-8">
                <h2 className="text-2xl sm:text-3xl font-bold text-center">{t['textImprovement.useCases.title'] ?? ''}</h2>
                <div className="grid md:grid-cols-3 gap-6">
                  {useCases.map((item, index) => (
                    <GlassCard key={index} className="p-6 h-full">
                      <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                      <p className="text-sm text-foreground/70 leading-relaxed">{item.description}</p>
                    </GlassCard>
                  ))}
                </div>
              </div>
              <FAQ />
              <div>
                <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto text-center" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">{t['textImprovement.cta.title'] ?? ''}</h2>
                  <p className="text-lg text-foreground/80 mb-8">
                    {t['textImprovement.cta.description'] ?? ''}
                  </p>
                  <PlatformDownloadSection location="features_text_improvement" />
                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                    <LinkWithArrow href="/demo">{t['textImprovement.cta.links.demo'] ?? ''}</LinkWithArrow>
                    <span className="hidden sm:inline">•</span>
                    <LinkWithArrow href="/features/voice-transcription">{t['textImprovement.cta.links.voice'] ?? ''}</LinkWithArrow>
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
