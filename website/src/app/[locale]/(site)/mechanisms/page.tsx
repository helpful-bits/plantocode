import { Metadata } from 'next';
import { loadMessagesFor, type Locale } from '@/lib/i18n';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import {
  Sparkles, Video, Shield, Search, Mic, Globe, Code2, GitMerge, Zap, History, ArrowUpRight
} from 'lucide-react';
import { locales } from '@/i18n/config';
import { generatePageMetadata, COMMON_KEYWORDS, mergeKeywords } from '@/content/metadata';
import { Link } from '@/i18n/navigation';

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessagesFor(locale, ['common', 'home']);

  return {
    ...generatePageMetadata({
      locale,
      slug: '/mechanisms',
      title: t['features.meta.title'] || 'AI Planning Mechanisms - PlanToCode',
      description: t['features.meta.description'] || 'Explore the core mechanisms powering PlanToCode: file discovery, implementation planning, multimodal analysis, and integrated terminal workflows.',
    }),
    keywords: mergeKeywords(
      [
        'ai planning mechanisms',
        'file discovery workflow',
        'implementation planning',
        'multimodal ai analysis',
        'integrated terminal',
        'plan merging',
        'token guardrails',
        'monaco editor integration',
        'voice transcription',
        'text improvement ai',
      ],
      COMMON_KEYWORDS.core
    ),
  };
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

interface FeatureCard {
  titleKey: string;
  descriptionKey: string;
  icon: React.ReactNode;
  href?: string;
  defaultTitle: string;
  defaultDescription: string;
}

export default async function MechanismsPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessagesFor(locale, ['common', 'home']);

  const featureCards: FeatureCard[] = [
    {
      titleKey: 'features.cards.specification.title',
      descriptionKey: 'features.cards.specification.description',
      icon: <Sparkles className="w-8 h-8" />,
      href: '/features/text-improvement',
      defaultTitle: 'Specification Capture',
      defaultDescription: 'Transform rough ideas into detailed requirements with AI-powered text enhancement.',
    },
    {
      titleKey: 'features.cards.meeting.title',
      descriptionKey: 'features.cards.meeting.description',
      icon: <Video className="w-8 h-8" />,
      href: '/features/meeting-ingestion',
      defaultTitle: 'Meeting Analysis',
      defaultDescription: 'Extract actionable insights from Microsoft Teams meetings and screen recordings.',
    },
    {
      titleKey: 'features.cards.implementation.title',
      descriptionKey: 'features.cards.implementation.description',
      icon: <Shield className="w-8 h-8" />,
      href: '/docs',
      defaultTitle: 'Human-in-the-Loop Planning',
      defaultDescription: 'Review and approve AI-generated plans before execution with full governance controls.',
    },
    {
      titleKey: 'features.cards.fileDiscovery.title',
      descriptionKey: 'features.cards.fileDiscovery.description',
      icon: <Search className="w-8 h-8" />,
      href: '/features/file-discovery',
      defaultTitle: 'AI File Discovery',
      defaultDescription: 'Automatically find relevant files using AI-generated search patterns and relevance scoring.',
    },
    {
      titleKey: 'features.cards.voiceTranscription.title',
      descriptionKey: 'features.cards.voiceTranscription.description',
      icon: <Mic className="w-8 h-8" />,
      href: '/features/voice-transcription',
      defaultTitle: 'Voice Transcription',
      defaultDescription: 'Speak your requirements and have them transcribed into implementation tasks.',
    },
    {
      titleKey: 'features.cards.textImprovement.title',
      descriptionKey: 'features.cards.textImprovement.description',
      icon: <Sparkles className="w-8 h-8" />,
      href: '/features/text-improvement',
      defaultTitle: 'Text Enhancement',
      defaultDescription: 'Refine task descriptions with AI suggestions for clarity and completeness.',
    },
    {
      titleKey: 'features.cards.modelConfiguration.title',
      descriptionKey: 'features.cards.modelConfiguration.description',
      icon: <Globe className="w-8 h-8" />,
      href: '/docs/model-configuration',
      defaultTitle: 'Multi-Model Support',
      defaultDescription: 'Configure and switch between Claude, GPT, Gemini, and other leading AI models.',
    },
    {
      titleKey: 'features.cards.tokenGuardrails.title',
      descriptionKey: 'features.cards.tokenGuardrails.description',
      icon: <Shield className="w-8 h-8" />,
      defaultTitle: 'Token Guardrails',
      defaultDescription: 'Built-in cost controls and token limits to prevent unexpected API charges.',
    },
    {
      titleKey: 'features.cards.monacoEditor.title',
      descriptionKey: 'features.cards.monacoEditor.description',
      icon: <Code2 className="w-8 h-8" />,
      href: '/features/plan-mode',
      defaultTitle: 'Monaco Editor Integration',
      defaultDescription: 'Edit implementation plans with the same editor powering VS Code.',
    },
    {
      titleKey: 'features.cards.mergePlans.title',
      descriptionKey: 'features.cards.mergePlans.description',
      icon: <GitMerge className="w-8 h-8" />,
      href: '/features/merge-instructions',
      defaultTitle: 'Plan Merging',
      defaultDescription: 'Combine plans from multiple AI models into a unified implementation strategy.',
    },
    {
      titleKey: 'features.cards.integratedTerminal.title',
      descriptionKey: 'features.cards.integratedTerminal.description',
      icon: <Zap className="w-8 h-8" />,
      href: '/features/integrated-terminal',
      defaultTitle: 'Integrated Terminal',
      defaultDescription: 'Run Claude Code, Cursor, or other CLI tools directly within PlanToCode.',
    },
    {
      titleKey: 'features.cards.persistentSessions.title',
      descriptionKey: 'features.cards.persistentSessions.description',
      icon: <History className="w-8 h-8" />,
      href: '/docs/terminal-sessions',
      defaultTitle: 'Persistent Sessions',
      defaultDescription: 'Keep your terminal sessions and context alive across app restarts.',
    },
  ];

  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />

        <main className="flex-grow">
          {/* Hero Section */}
          <section className="py-16 sm:py-20 md:py-24 px-4">
            <div className="container mx-auto max-w-6xl">
              <div className="text-center mb-12">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6 text-sm font-medium">
                  <Zap className="w-4 h-4" />
                  <span>{t['features.badge'] || 'Core Mechanisms'}</span>
                </div>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6">
                  {t['features.title'] || 'Mechanisms'}
                </h1>
                <p className="text-lg sm:text-xl text-foreground/80 max-w-3xl mx-auto mb-8">
                  {t['features.subtitle'] || 'Built for developers tackling large & legacy codebases. If you use Claude Code, Cursor, or Aider - this is your planning layer.'}
                </p>
              </div>
            </div>
          </section>

          {/* Features Grid */}
          <section className="py-12 px-4">
            <div className="container mx-auto max-w-7xl">
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                {featureCards.map((feature, index) => (
                  <GlassCard key={index} className="h-full p-6 sm:p-8 flex flex-col">
                    {/* Icon container */}
                    <div className="flex mx-auto mb-4 w-16 h-16 rounded-2xl items-center justify-center bg-gradient-to-br from-primary/10 to-primary/20 ring-1 ring-primary/20">
                      <div className="text-primary/80">
                        {feature.icon}
                      </div>
                    </div>

                    <h3 className="text-xl font-semibold text-center mb-3 text-foreground">
                      {t[feature.titleKey] || feature.defaultTitle}
                    </h3>

                    <p className="text-center text-sm leading-relaxed text-foreground/80 flex-grow mb-4">
                      {t[feature.descriptionKey] || feature.defaultDescription}
                    </p>

                    {feature.href && (
                      <div className="mt-auto text-center">
                        <Link
                          href={feature.href}
                          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                        >
                          {t['features.linkText'] || 'Learn more'}
                          <ArrowUpRight className="w-4 h-4" />
                        </Link>
                      </div>
                    )}
                  </GlassCard>
                ))}
              </div>
            </div>
          </section>

          {/* Why These Mechanisms Matter */}
          <section className="py-16 px-4 bg-gradient-to-br from-background via-background to-accent/5">
            <div className="container mx-auto max-w-4xl">
              <h2 className="text-3xl font-bold text-center mb-8">
                {t['features.whyItMatters.title'] || 'Why These Mechanisms Matter'}
              </h2>
              <div className="space-y-6">
                <GlassCard className="p-6">
                  <h3 className="text-xl font-semibold mb-3">
                    {t['features.whyItMatters.governance.title'] || 'Control Before Execution'}
                  </h3>
                  <p className="text-foreground/70">
                    {t['features.whyItMatters.governance.description'] || 'Review and approve AI-generated plans before any code changes are made. Understand scope, prevent duplicates, and maintain governance over your codebase.'}
                  </p>
                </GlassCard>

                <GlassCard className="p-6">
                  <h3 className="text-xl font-semibold mb-3">
                    {t['features.whyItMatters.context.title'] || 'Full Context Awareness'}
                  </h3>
                  <p className="text-foreground/70">
                    {t['features.whyItMatters.context.description'] || 'AI file discovery ensures you include all relevant files. Multimodal analysis captures requirements from meetings, recordings, and documentation.'}
                  </p>
                </GlassCard>

                <GlassCard className="p-6">
                  <h3 className="text-xl font-semibold mb-3">
                    {t['features.whyItMatters.flexibility.title'] || 'Model Flexibility'}
                  </h3>
                  <p className="text-foreground/70">
                    {t['features.whyItMatters.flexibility.description'] || 'Not locked into a single AI provider. Use Claude for planning, Gemini for video analysis, and GPT for code generation - all in one workflow.'}
                  </p>
                </GlassCard>
              </div>
            </div>
          </section>

          {/* CTA Section */}
          <section className="py-16 px-4">
            <div className="container mx-auto max-w-4xl">
              <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto text-center" highlighted>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                  {t['features.cta.title'] || 'Experience the Full Planning Workflow'}
                </h2>
                <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                  {t['features.cta.description'] || 'From file discovery to terminal execution - see how all mechanisms work together.'}
                </p>
                <PlatformDownloadSection location="mechanisms_page" />
                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                  <LinkWithArrow href="/features">
                    {t['features.cta.links.features'] || 'Browse features'}
                  </LinkWithArrow>
                  <span className="hidden sm:inline">•</span>
                  <LinkWithArrow href="/how-it-works">
                    {t['features.cta.links.howItWorks'] || 'See how it works'}
                  </LinkWithArrow>
                </div>
              </GlassCard>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
