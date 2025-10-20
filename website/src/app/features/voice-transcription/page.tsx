import { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { StructuredData } from '@/components/seo/StructuredData';
import { Mic, Settings, Terminal, AudioWaveform, Shield, Languages, Thermometer, CheckCircle2, AlertCircle, Code2 } from 'lucide-react';
import type { SoftwareApplication, HowTo, FAQPage } from 'schema-dts';

export const metadata: Metadata = {
  title: 'Voice to text for developers - faster task input | PlanToCode',
  description: 'Speak your task descriptions. AI transcribes with smart text insertion (prevents word concatenation). 5 languages, customizable per project. Audio level feedback. Used by teams who move fast.',
  keywords: [
    'voice transcription',
    'ai coding voice input',
    'terminal voice dictation',
    'openai whisper',
    'developer voice input',
    'hands-free coding',
    'voice to text developers',
    'transcription settings',
    'monaco editor voice',
    'voice task description',
  ],
  openGraph: {
    title: 'Voice-to-Text for Developers: Faster Task Input',
    description: 'Speak your task descriptions naturally. OpenAI Whisper transcribes with smart text insertion that prevents word concatenation. 5 languages, temperature control, real-time audio monitoring. The voice input system developers actually want.',
    url: 'https://www.plantocode.com/features/voice-transcription',
    siteName: 'PlanToCode',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.plantocode.com/features/voice-transcription',
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
      'OpenAI Whisper GPT-4o-transcribe',
      'Voice to task description with smart text insertion',
      '5 language support (EN, ES, FR, DE, ZH)',
      'Temperature control 0.0-1.0',
      'Real-time audio level meter',
      'Silence detection',
      'Per-project configuration',
      'Terminal dictation support',
    ],
  };

  const howToJsonLd: HowTo = {
    '@type': 'HowTo',
    name: 'How to use voice transcription for task descriptions',
    description: 'Capture task descriptions hands-free with AI-powered voice transcription',
    step: [
      {
        '@type': 'HowToStep',
        position: 1,
        name: 'Click the microphone button',
        text: 'Open your task description panel and click the microphone icon to start recording',
      },
      {
        '@type': 'HowToStep',
        position: 2,
        name: 'Speak your task naturally',
        text: 'Describe your task while watching the real-time audio level meter. The system detects silence automatically.',
      },
      {
        '@type': 'HowToStep',
        position: 3,
        name: 'AI transcribes automatically',
        text: 'OpenAI Whisper processes your audio with the configured language and temperature settings',
      },
      {
        '@type': 'HowToStep',
        position: 4,
        name: 'Text inserted with proper spacing',
        text: 'Transcribed text appears in your Monaco editor or terminal with automatic spacing and formatting',
      },
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
          text: 'PlanToCode supports 5 languages: English (EN), Spanish (ES), French (FR), German (DE), and Chinese (ZH). You can configure the default language per project.',
        },
      },
      {
        '@type': 'Question',
        name: 'Which AI model is used for transcription?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'We use OpenAI Whisper (GPT-4o-transcribe) for all voice transcription. It provides high accuracy with smart text insertion (prevents word concatenation) and punctuation.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can I customize transcription settings per project?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. You can configure language, temperature (0.0-1.0), and model settings for each project. Settings are stored in the project configuration and shared across team members.',
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
      {
        '@type': 'Question',
        name: 'What is the temperature control for?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Temperature (0.0-1.0) controls transcription creativity. Lower values (0.0-0.3) produce more accurate, consistent transcriptions. Higher values allow more variation. Most developers use 0.2-0.5.',
        },
      },
    ],
  };

  const painPoints = [
    {
      title: 'Typing slows down ideation',
      description: 'You think faster than you type. Ideas get lost while your fingers catch up. Voice lets you capture the full thought before it fades.',
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
      title: 'OpenAI Whisper (GPT-4o-transcribe)',
      description: 'State-of-the-art transcription with automatic punctuation and smart text insertion that prevents word concatenation. No manual cleanup needed.',
      icon: <AudioWaveform className="w-8 h-8" />,
    },
    {
      title: '5 Language Support',
      description: 'English, Spanish, French, German, Chinese. Configure per project. Team members in different regions use their native language.',
      icon: <Languages className="w-8 h-8" />,
    },
    {
      title: 'Temperature Control (0.0-1.0)',
      description: 'Fine-tune transcription accuracy vs creativity. Lower values for technical terms, higher for natural language. Adjust per use case.',
      icon: <Thermometer className="w-8 h-8" />,
    },
    {
      title: 'Real-time Audio Level Meter',
      description: 'Visual feedback shows recording strength. Know if you are too quiet or too loud before wasting a take.',
      icon: <AudioWaveform className="w-8 h-8" />,
    },
    {
      title: 'Automatic Silence Detection',
      description: 'Recording stops when you pause. No need to manually click stop. Resume automatically when you start speaking again.',
      icon: <Mic className="w-8 h-8" />,
    },
    {
      title: 'Per-Project Configuration',
      description: 'Language, temperature, and model defaults persist per project. Switch projects, settings follow automatically.',
      icon: <Settings className="w-8 h-8" />,
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
      <StructuredData data={{ '@graph': [softwareApplicationJsonLd, howToJsonLd, faqJsonLd] }} />
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
                  <span>OpenAI Whisper GPT-4o-transcribe</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  Voice to text that works for developers
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  Speak your task or command. PlanToCode transcribes and inserts clean text with proper spacing.
                </p>
              </div>

              {/* Pain Points */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Why Typing Slows You Down</h2>
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

              {/* How It Works */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">How It Works</h2>
                <div className="space-y-4 max-w-3xl mx-auto">
                  <GlassCard className="p-6" highlighted>
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                        1
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">Click the microphone button</h3>
                        <p className="text-foreground/80">
                          Task description panel or terminal modal. Microphone icon starts recording immediately. Visual feedback confirms active state.
                        </p>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-6" highlighted>
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                        2
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">Speak your task naturally</h3>
                        <p className="text-foreground/80">
                          Real-time audio level meter shows recording strength. Automatic silence detection pauses recording. Resume when you continue speaking.
                        </p>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-6" highlighted>
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                        3
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">AI transcribes automatically</h3>
                        <p className="text-foreground/80">
                          OpenAI Whisper (GPT-4o-transcribe) processes audio with your configured language and temperature. High accuracy, minimal latency.
                        </p>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-6" highlighted>
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                        4
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">Text inserted with proper spacing</h3>
                        <p className="text-foreground/80">
                          Transcribed text appears in Monaco editor or terminal buffer with automatic punctuation and smart text insertion. No word concatenation - spacing is intelligently added where needed.
                        </p>
                      </div>
                    </div>
                  </GlassCard>
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

              {/* Technical Details */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Technical Details</h2>
                <div className="grid md:grid-cols-2 gap-8">
                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <AudioWaveform className="w-8 h-8 text-primary flex-shrink-0" />
                      <div>
                        <h3 className="text-xl font-bold mb-3">Transcription Pipeline</h3>
                        <p className="text-foreground/80 mb-4">
                          Audio captured via <code>useVoiceTranscription</code> hook. Streamed to OpenAI Whisper API. Results saved to Monaco editor or terminal buffer with automatic retries.
                        </p>
                        <ul className="space-y-2 text-foreground/70 text-sm">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Real-time audio level feedback during recording</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Automatic retry with helpful error messages</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Configurable silence detection threshold</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <Settings className="w-8 h-8 text-primary flex-shrink-0" />
                      <div>
                        <h3 className="text-xl font-bold mb-3">Configuration</h3>
                        <p className="text-foreground/80 mb-4">
                          Settings stored per project via task settings API. Team members share defaults. Individual overrides supported.
                        </p>
                        <ul className="space-y-2 text-foreground/70 text-sm">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Language: EN, ES, FR, DE, ZH</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Temperature: 0.0 (accurate) to 1.0 (creative)</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Model: GPT-4o-transcribe or GPT-4o-mini-transcribe</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Separate defaults for task vs terminal usage</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <Terminal className="w-8 h-8 text-primary flex-shrink-0" />
                      <div>
                        <h3 className="text-xl font-bold mb-3">Terminal Integration</h3>
                        <p className="text-foreground/80 mb-4">
                          Dictated commands appended to active PTY session. Backpressure-aware writes prevent partial commands. Compatible with claude, cursor, codex, gemini.
                        </p>
                        <ul className="space-y-2 text-foreground/70 text-sm">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Voice controls in terminal modal</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Chunked writes for long commands</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Works with persistent shell sessions</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <div className="flex items-start gap-4">
                      <Shield className="w-8 h-8 text-primary flex-shrink-0" />
                      <div>
                        <h3 className="text-xl font-bold mb-3">Error Handling</h3>
                        <p className="text-foreground/80 mb-4">
                          Clear messages for authentication, network, provider errors. Logs persisted for debugging. Automatic retries respect rate limits.
                        </p>
                        <ul className="space-y-2 text-foreground/70 text-sm">
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Friendly guidance for microphone permissions</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Structured errors from server responses</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                            <span>Local audit trail alongside plan drafts</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </GlassCard>
                </div>
              </div>

              {/* FAQ Section */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Frequently Asked Questions</h2>
                <div className="space-y-4 max-w-3xl mx-auto">
                  {(Array.isArray(faqJsonLd.mainEntity) ? faqJsonLd.mainEntity : []).map((item, index) => (
                    <GlassCard key={index} className="p-6">
                      <h3 className="font-semibold text-lg mb-3 text-primary">{item.name}</h3>
                      <p className="text-foreground/80">{item.acceptedAnswer?.text}</p>
                    </GlassCard>
                  ))}
                </div>
              </div>

              {/* CTA */}
              <div className="mt-16">
                <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto text-center" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">Unlock Hands-Free Development</h2>
                  <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                    From voice to code, seamlessly capture ideas and execute commands.
                    This is how voice input should work - natural, integrated, powerful.
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
