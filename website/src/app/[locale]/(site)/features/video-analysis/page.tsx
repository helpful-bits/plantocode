import React from 'react';
import { Metadata } from 'next';
import { loadMessages, type Locale } from '@/lib/i18n';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { FAQ } from '@/components/landing/FAQ';
import { Video, Upload, Eye, Settings, Zap, Target, CheckCircle2, Clock, Sparkles, FileText, Users, Mic } from 'lucide-react';
import { cdnUrl } from '@/lib/cdn';
import { locales } from '@/i18n/config';
export const metadata: Metadata = {
  title: 'Meeting Analysis - Multimodal AI',
  description: 'Capture Teams meetings and screen recordings. AI analyzes audio and visuals to extract requirements for corporate teams.',
  keywords: [
    'meeting analysis',
    'teams meeting capture',
    'multimodal analysis',
    'requirements extraction',
    'corporate meeting analysis',
    'visual content analysis',
  ],
  openGraph: {
    title: 'AI Meeting & Recording Analysis: Requirements Extraction',
    description: 'Capture Microsoft Teams meetings and screen recordings. Multimodal AI analyzes audio transcripts and visual content to extract actionable requirements for corporate teams.',
    url: 'https://www.plantocode.com/features/video-analysis',
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
    canonical: 'https://www.plantocode.com/features/video-analysis',
    languages: {
      'en-US': 'https://www.plantocode.com/features/video-analysis',
      'en': 'https://www.plantocode.com/features/video-analysis',
    },
  },
};
export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}
export default async function VideoAnalysisPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);
  const howToSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "name": "How to Use AI Video Analysis for Bug Capture",
    "description": "Step-by-step guide to recording and analyzing screen videos with Gemini Vision AI",
    "step": ((t['videoAnalysis.howItWorks.steps'] ?? []) as Array<{ title: string; description: string }>).map((step: { title: string; description: string }, index: number) => ({
      "@type": "HowToStep",
      "name": step.title,
      "text": step.description,
      "position": index + 1
    }))
  };
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": t['videoAnalysis.faq.formats.question'] ?? '',
        "acceptedAnswer": {
          "@type": "Answer",
          "text": t['videoAnalysis.faq.formats.answer'] ?? ''
        }
      },
      {
        "@type": "Question",
        "name": t['videoAnalysis.faq.model.question'] ?? '',
        "acceptedAnswer": {
          "@type": "Answer",
          "text": t['videoAnalysis.faq.model.answer'] ?? ''
        }
      },
      {
        "@type": "Question",
        "name": t['videoAnalysis.faq.fps.question'] ?? '',
        "acceptedAnswer": {
          "@type": "Answer",
          "text": t['videoAnalysis.faq.fps.answer'] ?? ''
        }
      },
      {
        "@type": "Question",
        "name": t['videoAnalysis.faq.optimization.question'] ?? '',
        "acceptedAnswer": {
          "@type": "Answer",
          "text": t['videoAnalysis.faq.optimization.answer'] ?? ''
        }
      }
    ]
  };
  const softwareSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "PlanToCode Video Analysis",
    "applicationCategory": "DeveloperApplication",
    "operatingSystem": "Windows, macOS, Linux",
    "offers": {
      "@type": "Offer",
      "price": 0,
      "priceCurrency": "USD"
    },
    "featureList": [
      "Screen recording with built-in capture",
      "Video file upload (MP4, WebM, MOV, AVI)",
      "Gemini Vision AI analysis (2.5 Pro/Flash)",
      "Configurable FPS control (1-10 FPS)",
      "Automatic error extraction",
      "UI state detection",
      "Pattern recognition",
      "Auto-attach results to task descriptions",
      "Cost optimization controls",
      "Development workflow integration"
    ]
  };
  return (
    <React.Fragment>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }}
      />
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />
        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 lg:py-32 px-4">
            <div className="container mx-auto max-w-6xl">
              {/* Hero */}
              <div className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6 text-sm font-medium">
                  <Video className="w-4 h-4" />
                  <span>{t['videoAnalysis.hero.badge'] ?? ''}</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  {t['videoAnalysis.hero.title'] ?? ''}
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  {t['videoAnalysis.hero.description'] ?? ''}
                </p>
              </div>
              {/* Pain Points */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['videoAnalysis.painPoints.title'] ?? ''}</h2>
                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6">
                    <div className="text-red-500 mb-3">
                      <Users className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t['videoAnalysis.painPoints.requirementsLost.title'] ?? ''}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['videoAnalysis.painPoints.requirementsLost.description'] ?? ''}
                    </p>
                  </GlassCard>
                  <GlassCard className="p-6">
                    <div className="text-yellow-500 mb-3">
                      <FileText className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t['videoAnalysis.painPoints.incompleteNotes.title'] ?? ''}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['videoAnalysis.painPoints.incompleteNotes.description'] ?? ''}
                    </p>
                  </GlassCard>
                  <GlassCard className="p-6">
                    <div className="text-orange-500 mb-3">
                      <Clock className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t['videoAnalysis.painPoints.reviewTime.title'] ?? ''}</h3>
                    <p className="text-foreground/80 text-sm">
                      {t['videoAnalysis.painPoints.reviewTime.description'] ?? ''}
                    </p>
                  </GlassCard>
                </div>
              </div>
              {/* Multimodal Analysis */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['videoAnalysis.multimodal.title'] ?? ''}</h2>
                <div className="grid md:grid-cols-2 gap-8">
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Mic className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['videoAnalysis.multimodal.audioTranscript.title'] ?? ''}</h3>
                        <p className="text-foreground/80 mb-4">
                          {t['videoAnalysis.multimodal.audioTranscript.description'] ?? ''}
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          {((t['videoAnalysis.multimodal.audioTranscript.features'] ?? []) as string[]).map((feature: string, index: number) => (
                            <li key={index} className="flex items-start gap-2">
                              <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Eye className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['videoAnalysis.multimodal.visualContent.title'] ?? ''}</h3>
                        <p className="text-foreground/80 mb-4">
                          {t['videoAnalysis.multimodal.visualContent.description'] ?? ''}
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          {((t['videoAnalysis.multimodal.visualContent.features'] ?? []) as string[]).map((feature: string, index: number) => (
                            <li key={index} className="flex items-start gap-2">
                              <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>
              {/* Extracting Actionable Insights */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['videoAnalysis.insights.title'] ?? ''}</h2>
                <GlassCard className="p-8 max-w-4xl mx-auto">
                  <p className="text-foreground/80 mb-6">
                    {t['videoAnalysis.insights.description'] ?? ''}
                  </p>
                  <div className="grid md:grid-cols-3 gap-6">
                    <div className="text-center">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center mx-auto mb-3">
                        <FileText className="w-6 h-6 text-primary" />
                      </div>
                      <h4 className="font-semibold mb-2">{t['videoAnalysis.insights.decisions.title'] ?? ''}</h4>
                      <p className="text-sm text-foreground/70">
                        {t['videoAnalysis.insights.decisions.description'] ?? ''}
                      </p>
                    </div>
                    <div className="text-center">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center mx-auto mb-3">
                        <CheckCircle2 className="w-6 h-6 text-primary" />
                      </div>
                      <h4 className="font-semibold mb-2">{t['videoAnalysis.insights.actionItems.title'] ?? ''}</h4>
                      <p className="text-sm text-foreground/70">
                        {t['videoAnalysis.insights.actionItems.description'] ?? ''}
                      </p>
                    </div>
                    <div className="text-center">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center mx-auto mb-3">
                        <Target className="w-6 h-6 text-primary" />
                      </div>
                      <h4 className="font-semibold mb-2">{t['videoAnalysis.insights.discussionPoints.title'] ?? ''}</h4>
                      <p className="text-sm text-foreground/70">
                        {t['videoAnalysis.insights.discussionPoints.description'] ?? ''}
                      </p>
                    </div>
                  </div>
                </GlassCard>
              </div>
              {/* How It Works */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['videoAnalysis.howItWorks.title'] ?? ''}</h2>
                <div className="space-y-4 max-w-3xl mx-auto">
                  {((t['videoAnalysis.howItWorks.steps'] ?? []) as Array<{ title: string; description: string }>).map((step: { title: string; description: string }, index: number) => (
                    <GlassCard key={index} className="p-6">
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                          {index + 1}
                        </div>
                        <div>
                          <h3 className="font-semibold mb-2">{step.title}</h3>
                          <p className="text-foreground/80">
                            {step.description}
                          </p>
                        </div>
                      </div>
                    </GlassCard>
                  ))}
                </div>
              </div>
              {/* Key Capabilities */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['videoAnalysis.capabilities.title'] ?? ''}</h2>
                <div className="grid md:grid-cols-2 gap-8">
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Video className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['videoAnalysis.capabilities.screenRecording.title'] ?? ''}</h3>
                        <p className="text-foreground/80 mb-4">
                          {t['videoAnalysis.capabilities.screenRecording.description'] ?? ''}
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          {((t['videoAnalysis.capabilities.screenRecording.features'] ?? []) as string[]).map((feature: string, index: number) => (
                            <li key={index} className="flex items-start gap-2">
                              <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Upload className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['videoAnalysis.capabilities.fileUpload.title'] ?? ''}</h3>
                        <p className="text-foreground/80 mb-4">
                          {t['videoAnalysis.capabilities.fileUpload.description'] ?? ''}
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          {((t['videoAnalysis.capabilities.fileUpload.features'] ?? []) as string[]).map((feature: string, index: number) => (
                            <li key={index} className="flex items-start gap-2">
                              <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Settings className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['videoAnalysis.capabilities.fpsControl.title'] ?? ''}</h3>
                        <p className="text-foreground/80 mb-4">
                          {t['videoAnalysis.capabilities.fpsControl.description'] ?? ''}
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          {((t['videoAnalysis.capabilities.fpsControl.features'] ?? []) as string[]).map((feature: string, index: number) => (
                            <li key={index} className="flex items-start gap-2">
                              <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Eye className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['videoAnalysis.capabilities.gemini.title'] ?? ''}</h3>
                        <p className="text-foreground/80 mb-4">
                          {t['videoAnalysis.capabilities.gemini.description'] ?? ''}
                        </p>
                        <ul className="space-y-2 text-foreground/70">
                          {((t['videoAnalysis.capabilities.gemini.features'] ?? []) as string[]).map((feature: string, index: number) => (
                            <li key={index} className="flex items-start gap-2">
                              <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>
              {/* Use Cases */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['videoAnalysis.useCases.title'] ?? ''}</h2>
                <div className="grid md:grid-cols-3 gap-6">
                  <GlassCard className="p-6 bg-gray-900/50 dark:bg-black/50">
                    <div className="text-primary mb-3">
                      <Target className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-3">{t['videoAnalysis.useCases.bugCapture.title'] ?? ''}</h3>
                    <p className="text-foreground/80 text-sm mb-4">
                      {t['videoAnalysis.useCases.bugCapture.description'] ?? ''}
                    </p>
                    <div className="bg-black/70 dark:bg-black/50 rounded-lg p-4 font-mono text-xs space-y-1">
                      <div className="text-green-400">Record interaction flow</div>
                      <div className="text-yellow-400">AI identifies error state</div>
                      <div className="text-red-400">Extracts error messages</div>
                      <div className="text-cyan-400">Suggests potential fixes</div>
                    </div>
                  </GlassCard>
                  <GlassCard className="p-6 bg-gray-900/50 dark:bg-black/50">
                    <div className="text-primary mb-3">
                      <Sparkles className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-3">{t['videoAnalysis.useCases.uiDemo.title'] ?? ''}</h3>
                    <p className="text-foreground/80 text-sm mb-4">
                      {t['videoAnalysis.useCases.uiDemo.description'] ?? ''}
                    </p>
                    <div className="bg-black/70 dark:bg-black/50 rounded-lg p-4 font-mono text-xs space-y-1">
                      <div className="text-green-400">Upload demo recording</div>
                      <div className="text-yellow-400">Track UI state changes</div>
                      <div className="text-purple-400">Identify user patterns</div>
                      <div className="text-cyan-400">Extract UX insights</div>
                    </div>
                  </GlassCard>
                  <GlassCard className="p-6 bg-gray-900/50 dark:bg-black/50">
                    <div className="text-primary mb-3">
                      <FileText className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold mb-3">{t['videoAnalysis.useCases.onboarding.title'] ?? ''}</h3>
                    <p className="text-foreground/80 text-sm mb-4">
                      {t['videoAnalysis.useCases.onboarding.description'] ?? ''}
                    </p>
                    <div className="bg-black/70 dark:bg-black/50 rounded-lg p-4 font-mono text-xs space-y-1">
                      <div className="text-green-400">Record feature walkthrough</div>
                      <div className="text-yellow-400">Extract key steps</div>
                      <div className="text-orange-400">Generate descriptions</div>
                      <div className="text-cyan-400">Create documentation</div>
                    </div>
                  </GlassCard>
                </div>
              </div>
              {/* Model Selection */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['videoAnalysis.models.title'] ?? ''}</h2>
                <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                  <GlassCard className="p-8" highlighted>
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Zap className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['videoAnalysis.models.flash.title'] ?? ''}</h3>
                        <p className="text-foreground/80 mb-4">
                          {t['videoAnalysis.models.flash.description'] ?? ''}
                        </p>
                        <ul className="space-y-2 text-foreground/70 text-sm">
                          {((t['videoAnalysis.models.flash.features'] ?? []) as string[]).map((feature: string, index: number) => (
                            <li key={index} className="flex items-start gap-2">
                              <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                  <GlassCard className="p-8" highlighted>
                    <div className="flex items-start gap-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                        <Sparkles className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold mb-3">{t['videoAnalysis.models.pro.title'] ?? ''}</h3>
                        <p className="text-foreground/80 mb-4">
                          {t['videoAnalysis.models.pro.description'] ?? ''}
                        </p>
                        <ul className="space-y-2 text-foreground/70 text-sm">
                          {((t['videoAnalysis.models.pro.features'] ?? []) as string[]).map((feature: string, index: number) => (
                            <li key={index} className="flex items-start gap-2">
                              <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>
              {/* FAQ */}
              <FAQ />
              {/* CTA */}
              <div className="text-center">
                <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">{t['videoAnalysis.cta.title'] ?? ''}</h2>
                  <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                    {t['videoAnalysis.cta.description'] ?? ''}
                  </p>
                  <PlatformDownloadSection location="features_video_analysis" />
                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                    <LinkWithArrow href="/features/deep-research">
                      {t['videoAnalysis.cta.links.research'] ?? ''}
                    </LinkWithArrow>
                    <span className="hidden sm:inline">•</span>
                    <LinkWithArrow href="/features/file-discovery">
                      {t['videoAnalysis.cta.links.fileDiscovery'] ?? ''}
                    </LinkWithArrow>
                  </div>
                </GlassCard>
              </div>
            </div>
          </section>
        </main>
      </div>
    </React.Fragment>
  );
}
