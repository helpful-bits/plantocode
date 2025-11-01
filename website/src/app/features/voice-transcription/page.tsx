import { Metadata } from 'next';
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

export const metadata: Metadata = {
  title: 'Voice to text for rapid specification capture | PlanToCode',
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

export default function VoiceTranscriptionFeaturePage() {
  const softwareApplicationJsonLd: SoftwareApplication = {
    '@type': 'SoftwareApplication',
    name: 'PlanToCode Voice Transcription',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: ['Windows 10+', 'macOS 11.0+'],
    url: 'https://www.plantocode.com/features/voice-transcription',
    description: 'Voice transcription system for developers powered by OpenAI Whisper (GPT-4o-transcribe). Speak task descriptions and terminal commands with language selection, temperature control, real-time audio monitoring, and per-project configuration.',
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
      title: 'Capture ideas before they fade',
      description: 'Stakeholders think faster than they type. Requirements and context get lost while fingers catch up. Voice lets you capture the complete specification before critical details fade.',
      icon: <AlertCircle className="w-6 h-6" />,
    },
    {
      title: 'Hard to describe while hands are busy',
      description: 'Reviewing code? Debugging? Drawing architecture diagrams? Your hands are occupied but you need to log the task. Voice transcription keeps you in flow.',
      icon: <Code2 className="w-6 h-6" />,
    },
    {
      title: 'Context switching kills momentum',
      description: 'Stop what you are doing to open a note app, type, then return. Every switch breaks concentration. Voice stays in the same workspace.',
      icon: <Terminal className="w-6 h-6" />,
    },
  ];

  const capabilities = [
    {
      title: 'Multiple Language Support',
      description: 'OpenAI transcription supports multiple languages.',
      icon: <Mic className="w-8 h-8" />,
    },
    {
      title: 'Per-Project Configuration',
      description: 'Set project defaults. Your team shares sensible defaults.',
      icon: <Settings className="w-8 h-8" />,
    },
    {
      title: 'Terminal Dictation',
      description: 'Dictate commands directly to your terminal session.',
      icon: <Terminal className="w-8 h-8" />,
    },
  ];

  const useCases = [
    {
      title: 'Capture ideas hands-free',
      scenario: 'You are deep in a debugging session. You spot three related issues that need fixing. Speak them into the voice recorder without leaving your terminal.',
      outcome: 'Ideas logged instantly. Return to debugging without breaking flow.',
    },
    {
      title: 'Dictate while reviewing code',
      scenario: 'Code review reveals a refactoring opportunity. Your hands are on the diff, eyes on the screen. Voice captures the task description.',
      outcome: 'Task created with full context, zero typing, no context switch.',
    },
    {
      title: 'Faster task entry for repetitive work',
      scenario: 'You have 10 similar bugs to log after QA testing. Typing each one takes 2 minutes. Voice transcription takes 20 seconds.',
      outcome: '10x faster task entry. QA feedback processed in minutes instead of hours.',
    },
    {
      title: 'Terminal commands without memorizing syntax',
      scenario: 'Need a complex git command with flags you always forget. Dictate it naturally, let transcription handle the syntax.',
      outcome: 'Commands entered correctly, faster than looking up documentation.',
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
                  <span>Voice transcription for developers</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  Rapid specification capture with voice
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  Speak your requirements and ideas naturally. This is the first step in your specification workflow: capture ideas quickly with voice, then refine them manually with AI-powered prompts. The fastest way to capture initial specifications before refinement.
                </p>
              </div>

              {/* Pain Points */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Why Voice Accelerates Specification Capture</h2>
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
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Key Capabilities</h2>
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
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Accuracy Benchmarks</h2>
                <GlassCard className="p-6 md:p-8">
                  <AccuracySection datasetUrl="/data/transcription/wer-benchmarks.json" />
                  <div className="mt-6 space-y-2 text-sm text-foreground/80">
                    <p className="font-medium">About these models</p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>OpenAI gpt-4o-transcribe — advanced multilingual speech model optimized for accuracy and latency.</li>
                      <li>Google Speech-to-Text v2 — cloud speech recognition by Google.</li>
                      <li>AWS Transcribe — managed speech recognition by Amazon Web Services.</li>
                      <li>Whisper large-v2 — open-source large-model baseline for comparison.</li>
                    </ul>
                    <p className="mt-3 text-foreground">
                      <strong>Bottom line:</strong> Fewer errors mean fewer ambiguous tickets and less rework. gpt-4o-transcribe helps teams capture precise, implementation-ready specifications on the first try.
                    </p>
                  </div>
                </GlassCard>
              </section>

              <section className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Illustrative Example: Capturing Specifications</h2>
                <GlassCard className="p-6 md:p-8">
                  <TranscriptionComparison
                    reference="Create a Postgres read-replica in us-east-1 with 2 vCPU, 8GB RAM, and enable logical replication; set wal_level=logical and max_wal_senders=10."
                    gpt="Create a Postgres read-replica in us-east-1 with 2 vCPU, 8 GB RAM, and enable logical replication; set wal_level=logical and max_wal_senders=10."
                    competitor={{
                      label: 'Competitor Model',
                      text: 'Create a Postgres replica in us-east with 2 CPUs, 8GB RAM, and enable replication; set wal level logical and max senders equals ten.'
                    }}
                  />
                </GlassCard>
              </section>

              {/* Use Cases */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Real Use Cases</h2>
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
              <FAQ items={(Array.isArray(faqJsonLd.mainEntity) ? faqJsonLd.mainEntity : []).map((item) => ({
                question: item.name || '',
                answer: item.acceptedAnswer?.text || '',
              }))} />

              {/* Next Steps Section */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Refine Your Captured Specifications</h2>
                <GlassCard className="p-8 max-w-3xl mx-auto">
                  <p className="text-foreground/80 mb-6">
                    Voice transcription is the first step in our Specification Capture workflow. Once you've captured your requirements, use AI-powered prompts to transform rough transcripts into clear, implementation-ready specifications.
                  </p>
                  <div className="flex flex-col gap-4">
                    <div className="flex items-start gap-3">
                      <Sparkles className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                      <div>
                        <h3 className="font-semibold mb-1">Text Enhancement</h3>
                        <p className="text-sm text-foreground/70">
                          Polish grammar, improve clarity, and enhance readability while preserving your original intent.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Target className="w-5 h-5 text-primary flex-shrink-0 mt-1" />
                      <div>
                        <h3 className="font-semibold mb-1">Task Refinement</h3>
                        <p className="text-sm text-foreground/70">
                          Expand descriptions with implied requirements, edge cases, and technical considerations.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-6">
                    <LinkWithArrow href="/features/text-improvement">
                      Learn about Specification Capture Mode
                    </LinkWithArrow>
                  </div>
                </GlassCard>
              </div>

              {/* CTA */}
              <div className="mt-16">
                <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto text-center" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">Start Capturing Specifications with Voice</h2>
                  <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                    From voice to refined specifications, seamlessly. Capture requirements hands-free, then refine with AI prompts. This is how corporate teams should capture and clarify requirements.
                  </p>
                  <PlatformDownloadSection location="voice_transcription_feature" redirectToDownloadPage />
                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                    <LinkWithArrow href="/features/integrated-terminal">
                      See terminal integration
                    </LinkWithArrow>
                    <span className="hidden sm:inline">•</span>
                    <LinkWithArrow href="/features/text-improvement">
                      Explore text enhancement
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
