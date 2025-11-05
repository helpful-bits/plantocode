import { Metadata } from 'next';
import { loadMessages, type Locale } from '@/lib/i18n';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { StructuredData } from '@/components/seo/StructuredData';
import { FAQ } from '@/components/landing/FAQ';
import { Mic, Settings, Terminal, AlertCircle, Code2, Sparkles, Target } from 'lucide-react';
import type { SoftwareApplication, FAQPage } from 'schema-dts';
import { AccuracySection } from '@/components/voice/AccuracySection';
import { TranscriptionComparison } from '@/components/voice/TranscriptionComparison';
import { cdnUrl } from '@/lib/cdn';
import { locales } from '@/i18n/config';
export const metadata: Metadata = {
  title: 'Voice to text for rapid specification capture',
  description: 'Hands-free specification capture with voice. Accurate transcription inserts text where you work. Configure per project, supports multiple languages.',
  keywords: [
    'voice transcription',
    'specification capture',
    'developer voice input',
    'terminal dictation',
    'project configuration',
  ],
  openGraph: {
    title: 'Voice-to-Text for Developers: Faster Task Input',
    description: 'Rapid specification capture with voice dictation. Speak your requirements naturally, AI transcribes accurately. The first step in creating detailed implementation plans for corporate teams.',
    url: 'https://www.plantocode.com/features/voice-transcription',
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
    canonical: 'https://www.plantocode.com/features/voice-transcription',
    languages: {
      'en-US': 'https://www.plantocode.com/features/voice-transcription',
      'en': 'https://www.plantocode.com/features/voice-transcription',
    },
  },
};
export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}
export default async function VoiceTranscriptionFeaturePage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);
  const softwareApplicationJsonLd: SoftwareApplication = {
    '@type': 'SoftwareApplication',
    name: 'PlanToCode Voice Transcription',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: ['Windows 10+', 'macOS 11.0+'],
    url: 'https://www.plantocode.com/features/voice-transcription',
    description: 'Voice transcription system for developers powered by OpenAI Whisper (GPT-4o-transcribe). Speak task descriptions and terminal commands with language selection, temperature control, real-time audio monitoring, and per-project configuration.',
    offers: {
      '@type': 'Offer',
      price: 0,
      priceCurrency: 'USD',
      description: 'Free desktop app with pay-as-you-go API usage. $5 free credits on signup.',
    },
    featureList: [
      'Hands-free specification capture',
      'Multiple language support',
      'Per-project configuration',
      'Terminal dictation support',
    ],
  };
  const faqJsonLd: FAQPage = {
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'Which languages are supported for voice transcription?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'OpenAI transcription supports multiple languages. You can set a default language per project.',
        },
      },
      {
        '@type': 'Question',
        name: 'Which AI model is used for transcription?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'We use OpenAI transcription for accurate results.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I customize transcription settings per project?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. You can configure language and model settings for each project. Settings are stored in the project configuration and shared across team members.',
        },
      },
      {
        '@type': 'Question',
        name: 'Where can I use voice transcription in the app?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Voice transcription works in two places: (1) Task description panel - dictate implementation requirements, and (2) Terminal modal - dictate commands that are appended to your active shell session.',
        },
      },
      {
        '@type': 'Question',
        name: 'Does voice transcription work offline?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'No, voice transcription requires an internet connection to send audio to OpenAI Whisper API. The transcription happens in real-time with minimal latency.',
        },
      },
    ],
  };
  const painPoints = [
    {
      title: t['voiceTranscription.painPoints.captureIdeas.title'] ?? '',
      description: t['voiceTranscription.painPoints.captureIdeas.description'] ?? '',
      icon: <AlertCircle className="w-6 h-6" />,
    },
    {
      title: t['voiceTranscription.painPoints.handsBusy.title'] ?? '',
      description: t['voiceTranscription.painPoints.handsBusy.description'] ?? '',
      icon: <Code2 className="w-6 h-6" />,
    },
    {
      title: t['voiceTranscription.painPoints.contextSwitching.title'] ?? '',
      description: t['voiceTranscription.painPoints.contextSwitching.description'] ?? '',
      icon: <Terminal className="w-6 h-6" />,
    },
  ];
  const capabilities = [
    {
      title: t['voiceTranscription.capabilities.multiLanguage.title'] ?? '',
      description: t['voiceTranscription.capabilities.multiLanguage.description'] ?? '',
      icon: <Mic className="w-8 h-8" />,
    },
    {
      title: t['voiceTranscription.capabilities.perProject.title'] ?? '',
      description: t['voiceTranscription.capabilities.perProject.description'] ?? '',
      icon: <Settings className="w-8 h-8" />,
    },
    {
      title: t['voiceTranscription.capabilities.terminalDictation.title'] ?? '',
      description: t['voiceTranscription.capabilities.terminalDictation.description'] ?? '',
      icon: <Terminal className="w-8 h-8" />,
    },
  ];
  const useCases = [
    {
      title: t['voiceTranscription.useCases.handsFree.title'] ?? '',
      scenario: t['voiceTranscription.useCases.handsFree.scenario'] ?? '',
      outcome: t['voiceTranscription.useCases.handsFree.outcome'] ?? '',
    },
    {
      title: t['voiceTranscription.useCases.codeReview.title'] ?? '',
      scenario: t['voiceTranscription.useCases.codeReview.scenario'] ?? '',
      outcome: t['voiceTranscription.useCases.codeReview.outcome'] ?? '',
    },
    {
      title: t['voiceTranscription.useCases.fasterEntry.title'] ?? '',
      scenario: t['voiceTranscription.useCases.fasterEntry.scenario'] ?? '',
      outcome: t['voiceTranscription.useCases.fasterEntry.outcome'] ?? '',
    },
    {
      title: t['voiceTranscription.useCases.terminalCommands.title'] ?? '',
      scenario: t['voiceTranscription.useCases.terminalCommands.scenario'] ?? '',
      outcome: t['voiceTranscription.useCases.terminalCommands.outcome'] ?? '',
    },
  ];
  return (
    <>
      <StructuredData data={{ '@graph': [softwareApplicationJsonLd, faqJsonLd] }} />
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />
        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 lg:py-32 px-4">
            <div className="container mx-auto max-w-6xl">
              {/* Hero */}
              <div className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6 text-sm font-medium">
                  <Mic className="w-4 h-4" />
                  <span>{t['voiceTranscription.hero.badge'] ?? ''}</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  {t['voiceTranscription.hero.title'] ?? ''}
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  {t['voiceTranscription.hero.description'] ?? ''}
                </p>
              </div>
              {/* Pain Points */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['voiceTranscription.painPoints.title'] ?? ''}</h2>
                <div className="grid md:grid-cols-3 gap-6">
                  {painPoints.map((point, index) => (
                    <GlassCard key={index} className="p-6">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="text-primary mt-1">{point.icon}</div>
                        <div>
                          <h3 className="font-semibold text-lg mb-2">{point.title}</h3>
                          <p className="text-sm text-foreground/70">{point.description}</p>
                        </div>
                      </div>
                    </GlassCard>
                  ))}
                </div>
              </div>
              {/* Key Capabilities */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['voiceTranscription.capabilities.title'] ?? ''}</h2>
                <div className="grid md:grid-cols-2 gap-8">
                  {capabilities.map((capability, index) => (
                    <GlassCard key={index} className="p-8">
                      <div className="flex items-start gap-4">
                        <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex-shrink-0">
                          {capability.icon}
                        </div>
                        <div>
                          <h3 className="text-xl font-bold mb-3">{capability.title}</h3>
                          <p className="text-foreground/80">{capability.description}</p>
                        </div>
                      </div>
                    </GlassCard>
                  ))}
                </div>
              </div>
              <section className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['voiceTranscription.accuracy.title'] ?? ''}</h2>
                <GlassCard className="p-6 md:p-8">
                  <AccuracySection datasetUrl="/data/transcription/wer-benchmarks.json" />
                  <div className="mt-6 space-y-2 text-sm text-foreground/80">
                    <p className="font-medium">About these models</p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>{t['voiceTranscription.accuracy.models.gpt'] ?? ''}</li>
                      <li>{t['voiceTranscription.accuracy.models.google'] ?? ''}</li>
                      <li>{t['voiceTranscription.accuracy.models.aws'] ?? ''}</li>
                      <li>{t['voiceTranscription.accuracy.models.whisper'] ?? ''}</li>
                    </ul>
                    <p className="mt-3 text-foreground">
                      <strong>{t['voiceTranscription.accuracy.bottomLine'] ?? ''}</strong>
                    </p>
                  </div>
                </GlassCard>
              </section>
              <section className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['voiceTranscription.example.title'] ?? ''}</h2>
                <GlassCard className="p-6 md:p-8">
                  <TranscriptionComparison
                    reference={t['voiceTranscription.example.reference'] ?? ''}
                    gpt={t['voiceTranscription.example.gpt'] ?? ''}
                    competitor={{
                      label: t['voiceTranscription.example.competitor.label'] ?? '',
                      text: t['voiceTranscription.example.competitor.text'] ?? ''
                    }}
                  />
                </GlassCard>
              </section>
              {/* Use Cases */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['voiceTranscription.useCases.title'] ?? ''}</h2>
                <div className="space-y-6 max-w-4xl mx-auto">
                  {useCases.map((useCase, index) => (
                    <GlassCard key={index} className="p-6">
                      <h3 className="text-lg font-semibold mb-3 text-primary">{useCase.title}</h3>
                      <div className="space-y-3">
                        <div>
                          <div className="text-sm font-medium text-foreground/60 mb-1">Scenario:</div>
                          <p className="text-foreground/80">{useCase.scenario}</p>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-foreground/60 mb-1">Outcome:</div>
                          <p className="text-foreground/80 font-medium">{useCase.outcome}</p>
                        </div>
                      </div>
                    </GlassCard>
                  ))}
                </div>
              </div>
              {/* FAQ Section */}
              <FAQ />
              {/* Next Steps Section */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['voiceTranscription.nextSteps.title'] ?? ''}</h2>
                <GlassCard className="p-8 max-w-3xl mx-auto">
                  <p className="text-foreground/80 mb-6">
                    {t['voiceTranscription.nextSteps.description'] ?? ''}
                  </p>
                  <div className="flex flex-col gap-4">
                    <div className="flex items-start gap-3">
                      <Sparkles className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                      <div>
                        <h3 className="font-semibold mb-1">{t['voiceTranscription.nextSteps.textEnhancement.title'] ?? ''}</h3>
                        <p className="text-sm text-foreground/70">
                          {t['voiceTranscription.nextSteps.textEnhancement.description'] ?? ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Target className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                      <div>
                        <h3 className="font-semibold mb-1">{t['voiceTranscription.nextSteps.taskRefinement.title'] ?? ''}</h3>
                        <p className="text-sm text-foreground/70">
                          {t['voiceTranscription.nextSteps.taskRefinement.description'] ?? ''}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-6">
                    <LinkWithArrow href="/features/text-improvement">
                      {t['voiceTranscription.nextSteps.link'] ?? ''}
                    </LinkWithArrow>
                  </div>
                </GlassCard>
              </div>
              {/* CTA */}
              <div className="mt-16">
                <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto text-center" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">{t['voiceTranscription.cta.title'] ?? ''}</h2>
                  <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                    {t['voiceTranscription.cta.description'] ?? ''}
                  </p>
                  <PlatformDownloadSection location="voice_transcription_feature" redirectToDownloadPage />
                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                    <LinkWithArrow href="/features/integrated-terminal">
                      {t['voiceTranscription.cta.links.terminal'] ?? ''}
                    </LinkWithArrow>
                    <span className="hidden sm:inline">•</span>
                    <LinkWithArrow href="/features/text-improvement">
                      {t['voiceTranscription.cta.links.textImprovement'] ?? ''}
                    </LinkWithArrow>
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
