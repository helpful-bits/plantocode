import type { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { Link } from '@/i18n/navigation';
import { cdnUrl } from '@/lib/cdn';
import Image from 'next/image';
import { locales } from '@/i18n/config';
import {
  Code2,
  Terminal,
  Play,
  Edit3,
  CheckCircle2,
  Sparkles,
  Zap,
  Target,
  Video,
  Mic,
  FileText,
  Camera
} from 'lucide-react';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Button } from '@/components/ui/button';
import { loadMessagesFor, type Locale } from '@/lib/i18n';
import { generatePageMetadata } from '@/content/metadata';

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessagesFor(locale, ['common', 'pages']);

  return generatePageMetadata({
    locale,
    slug: '/how-it-works',
    title: t['howItWorks.meta.title'],
    description: t['howItWorks.meta.description'],
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
  });
}

interface WorkflowStep {
  step: number;
  title: string;
  subtitle: string;
  icon: React.ReactElement;
  description: string;
  methods?: Array<{ icon: React.ReactElement; title: string; description: string }>;
  promptTypes?: Array<{ icon: React.ReactElement; title: string; description: string }>;
  features?: string[];
  capabilities?: string[];
  tools?: string[];
  models?: string[];
  examples?: string[];
  learnMoreLinks?: Array<{ href: string; text: string }>;
}
export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}
export default async function HowItWorksPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessagesFor(locale, ['common', 'pages']);
  const workflowSteps: WorkflowStep[] = [
    {
      step: 1,
      title: t['howItWorks.workflow.step1.title'] ?? '',
      subtitle: t['howItWorks.workflow.step1.subtitle'] ?? '',
      icon: <Video className="w-6 h-6" />,
      description: t['howItWorks.workflow.step1.description'] ?? '',
      methods: [
        {
          icon: <Video className="w-5 h-5" />,
          title: t['howItWorks.workflow.step1.meetings.title'] ?? '',
          description: t['howItWorks.workflow.step1.meetings.description'] ?? '',
        },
        {
          icon: <Camera className="w-5 h-5" />,
          title: t['howItWorks.workflow.step1.screen.title'] ?? '',
          description: t['howItWorks.workflow.step1.screen.description'] ?? '',
        },
        {
          icon: <Mic className="w-5 h-5" />,
          title: t['howItWorks.workflow.step1.voice.title'] ?? '',
          description: t['howItWorks.workflow.step1.voice.description'] ?? '',
        }
      ],
      learnMoreLinks: [
        { href: "/features/video-analysis", text: "Learn about meeting analysis" },
        { href: "/features/voice-transcription", text: "Learn about voice transcription" }
      ]
    },
    {
      step: 2,
      title: t['howItWorks.workflow.step2.title'] ?? '',
      subtitle: t['howItWorks.workflow.step2.subtitle'] ?? '',
      icon: <Sparkles className="w-6 h-6" />,
      description: t['howItWorks.workflow.step2.description'] ?? '',
      promptTypes: [
        {
          icon: <Edit3 className="w-5 h-5" />,
          title: t['howItWorks.workflow.step2.textEnhancement.title'] ?? '',
          description: t['howItWorks.workflow.step2.textEnhancement.description'] ?? '',
        },
        {
          icon: <Target className="w-5 h-5" />,
          title: t['howItWorks.workflow.step2.taskRefinement.title'] ?? '',
          description: t['howItWorks.workflow.step2.taskRefinement.description'] ?? '',
        }
      ],
      learnMoreLinks: [
        { href: "/features/text-improvement", text: "Learn about Specification Capture Mode" }
      ]
    },
    {
      step: 3,
      title: t['howItWorks.workflow.step3.title'] ?? '',
      subtitle: t['howItWorks.workflow.step3.subtitle'] ?? '',
      icon: <FileText className="w-6 h-6" />,
      description: t['howItWorks.workflow.step3.description'] ?? '',
      features: [
        t['howItWorks.workflow.step3.features.paths'] ?? '',
        t['howItWorks.workflow.step3.features.ranges'] ?? '',
        t['howItWorks.workflow.step3.features.operations'] ?? '',
        t['howItWorks.workflow.step3.features.dependencies'] ?? '',
        t['howItWorks.workflow.step3.features.multiple'] ?? '',
        t['howItWorks.workflow.step3.features.models'] ?? ''
      ],
      learnMoreLinks: [
        { href: "/features/file-discovery", text: "Learn about AI file discovery" },
        { href: "/features/plan-mode", text: "Learn about plan generation" }
      ]
    },
    {
      step: 4,
      title: t['howItWorks.workflow.step4.title'] ?? '',
      subtitle: t['howItWorks.workflow.step4.subtitle'] ?? '',
      icon: <Code2 className="w-6 h-6" />,
      description: t['howItWorks.workflow.step4.description'] ?? '',
      capabilities: [
        t['howItWorks.workflow.step4.capabilities.editor'] ?? '',
        t['howItWorks.workflow.step4.capabilities.editing'] ?? '',
        t['howItWorks.workflow.step4.capabilities.merge'] ?? '',
        t['howItWorks.workflow.step4.capabilities.modifications'] ?? '',
        t['howItWorks.workflow.step4.capabilities.approve'] ?? '',
        t['howItWorks.workflow.step4.capabilities.visibility'] ?? ''
      ],
      learnMoreLinks: [
        { href: "/features/plan-mode", text: "Learn about human-in-the-loop governance" },
        { href: "/features/merge-instructions", text: "Learn about plan merging" }
      ]
    },
    {
      step: 5,
      title: t['howItWorks.workflow.step5.title'] ?? '',
      subtitle: t['howItWorks.workflow.step5.subtitle'] ?? '',
      icon: <Terminal className="w-6 h-6" />,
      description: t['howItWorks.workflow.step5.description'] ?? '',
      tools: [
        t['howItWorks.workflow.step5.tools.claude'] ?? '',
        t['howItWorks.workflow.step5.tools.cursor'] ?? '',
        t['howItWorks.workflow.step5.tools.codex'] ?? '',
        t['howItWorks.workflow.step5.tools.terminal'] ?? '',
        t['howItWorks.workflow.step5.tools.sessions'] ?? '',
        t['howItWorks.workflow.step5.tools.audit'] ?? ''
      ],
      learnMoreLinks: [
        { href: "/features/integrated-terminal", text: "Learn about terminal integration" },
        { href: "/plan-mode/claude-code", text: "See Claude Code workflow" }
      ]
    }
  ];
  const keyFeatures = [
    {
      icon: <Target className="w-8 h-8" />,
      title: t['howItWorks.keyFeatures.governance.title'] ?? '',
      description: t['howItWorks.keyFeatures.governance.description'] ?? '',
    },
    {
      icon: <Zap className="w-8 h-8" />,
      title: t['howItWorks.keyFeatures.sessions.title'] ?? '',
      description: t['howItWorks.keyFeatures.sessions.description'] ?? '',
    },
    {
      icon: <Sparkles className="w-8 h-8" />,
      title: t['howItWorks.keyFeatures.deploy.title'] ?? '',
      description: t['howItWorks.keyFeatures.deploy.description'] ?? '',
    }
  ];
  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />
        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 lg:py-32 px-4">
            <div className="container mx-auto max-w-6xl">
              {/* Hero */}
              <div className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6 text-sm font-medium">
                  <Play className="w-4 h-4" />
                  <span>{t['howItWorks.hero.badge'] ?? ''}</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  {t['howItWorks.hero.title'] ?? ''}
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-4xl mx-auto leading-relaxed">
                  {t['howItWorks.hero.subtitle'] ?? ''}
                </p>
              </div>

              {/* Hero Image */}
              <div className="mb-20 -mx-4 sm:-mx-6">
                <div className="relative w-full overflow-hidden rounded-2xl">
                  {/* Desktop Image */}
                  <div className="hidden lg:block">
                    <Image
                      src={cdnUrl('/images/hero-workflow-desktop.jpg')}
                      alt="PlanToCode workflow visualization"
                      width={1600}
                      height={800}
                      className="w-full h-auto"
                      priority
                    />
                  </div>
                  {/* Mobile Image */}
                  <div className="lg:hidden">
                    <Image
                      src={cdnUrl('/images/hero-workflow-mobile.jpg')}
                      alt="PlanToCode workflow visualization"
                      width={800}
                      height={1200}
                      className="w-full h-auto"
                      priority
                    />
                  </div>
                </div>
              </div>

              {/* Workflow Steps */}
              <div className="mb-20">
                <h2 className="text-2xl sm:text-3xl font-bold mb-12 text-center">{t['howItWorks.workflow.title'] ?? ''}</h2>
                <div className="space-y-12">
                  {workflowSteps.map((step, index) => (
                    <div key={step.step} className="relative">
                      {/* Connector Line */}
                      {index < workflowSteps.length - 1 && (
                        <div className="absolute left-6 top-20 w-0.5 h-12 bg-gradient-to-b from-primary/50 to-transparent"></div>
                      )}
                      <GlassCard className="p-8">
                        <div className="flex items-start gap-6">
                          {/* Step Number & Icon */}
                          <div className="flex-shrink-0">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center mb-3">
                              {step.icon}
                            </div>
                            <div className="w-12 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                              {step.step}
                            </div>
                          </div>
                          {/* Content */}
                          <div className="flex-1">
                            <h3 className="text-xl sm:text-2xl font-bold mb-2">{step.title}</h3>
                            <p className="text-primary font-medium mb-3">{step.subtitle}</p>
                            <p className="text-foreground/80 mb-6">{step.description}</p>
                            {/* Step-specific content */}
                            {step.methods && (
                              <div className="grid sm:grid-cols-3 gap-4">
                                {step.methods.map((method, idx) => (
                                  <div key={idx} className="p-4 rounded-lg bg-background/50 border border-border/30">
                                    <div className="flex items-center gap-2 mb-2">
                                      <div className="p-1.5 rounded bg-primary/10">
                                        {method.icon}
                                      </div>
                                      <span className="font-semibold text-sm">{method.title}</span>
                                    </div>
                                    <p className="text-xs text-foreground/70">{method.description}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                            {step.features && (
                              <div className="grid sm:grid-cols-2 gap-3">
                                {step.features.map((feature, idx) => (
                                  <div key={idx} className="flex items-center gap-2">
                                    <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                                    <span className="text-sm text-foreground/80">{feature}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {step.models && (
                              <div className="flex flex-wrap gap-3">
                                {step.models.map((model: string, idx: number) => (
                                  <span key={idx} className="px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
                                    {model}
                                  </span>
                                ))}
                              </div>
                            )}
                            {step.capabilities && (
                              <div className="grid sm:grid-cols-2 gap-3">
                                {step.capabilities.map((capability, idx) => (
                                  <div key={idx} className="flex items-center gap-2">
                                    <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                                    <span className="text-sm text-foreground/80">{capability}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {step.examples && (
                              <div className="space-y-2">
                                <p className="font-semibold text-sm text-foreground/80 mb-3">Example merge instructions:</p>
                                {step.examples.map((example: string, idx: number) => (
                                  <div key={idx} className="p-3 rounded bg-background/50 border border-border/30 font-mono text-sm text-foreground/70">
                                    {example}
                                  </div>
                                ))}
                              </div>
                            )}
                            {step.tools && (
                              <div className="grid sm:grid-cols-2 gap-3">
                                {step.tools.map((tool, idx) => (
                                  <div key={idx} className="flex items-center gap-2">
                                    <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                                    <span className="text-sm text-foreground/80">{tool}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {step.promptTypes && (
                              <div className="grid sm:grid-cols-2 gap-4">
                                {step.promptTypes.map((type, idx) => (
                                  <div key={idx} className="p-4 rounded-lg bg-background/50 border border-border/30">
                                    <div className="flex items-center gap-2 mb-2">
                                      <div className="p-1.5 rounded bg-primary/10">
                                        {type.icon}
                                      </div>
                                      <span className="font-semibold text-sm">{type.title}</span>
                                    </div>
                                    <p className="text-xs text-foreground/70">{type.description}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                            {step.learnMoreLinks && (
                              <div className="mt-6 flex flex-wrap gap-3">
                                {step.learnMoreLinks.map((link, idx) => (
                                  <LinkWithArrow key={idx} href={link.href} className="text-sm">
                                    {link.text}
                                  </LinkWithArrow>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </GlassCard>
                    </div>
                  ))}
                </div>
              </div>
              {/* Key Features */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['howItWorks.keyFeatures.title'] ?? ''}</h2>
                <div className="grid md:grid-cols-3 gap-8">
                  {keyFeatures.map((feature, index) => (
                    <GlassCard key={index} className="p-8 text-center">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 inline-block mb-4">
                        {feature.icon}
                      </div>
                      <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                      <p className="text-foreground/80">{feature.description}</p>
                    </GlassCard>
                  ))}
                </div>

                <div className="glass-card p-6 mt-8">
                  <h3 className="text-base font-semibold">{t['howItWorks.keyFeatures.remoteControl.title'] ?? ''}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t['howItWorks.keyFeatures.remoteControl.description'] ?? ''}
                  </p>
                </div>
              </div>
              {/* Use Cases */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">{t['howItWorks.useCases.title'] ?? ''}</h2>
                <div className="grid md:grid-cols-2 gap-8">
                  <GlassCard className="p-8">
                    <h3 className="text-xl font-bold mb-4">{t['howItWorks.useCases.features.title'] ?? ''}</h3>
                    <p className="text-foreground/80 mb-4">
                      {t['howItWorks.useCases.features.description'] ?? ''}
                    </p>
                    <ul className="space-y-2 text-foreground/70">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                        <span>{t['howItWorks.useCases.features.items.cross'] ?? ''}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                        <span>{t['howItWorks.useCases.features.items.api'] ?? ''}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                        <span>{t['howItWorks.useCases.features.items.schema'] ?? ''}</span>
                      </li>
                    </ul>
                  </GlassCard>
                  <GlassCard className="p-8">
                    <h3 className="text-xl font-bold mb-4">{t['howItWorks.useCases.bugs.title'] ?? ''}</h3>
                    <p className="text-foreground/80 mb-4">
                      {t['howItWorks.useCases.bugs.description'] ?? ''}
                    </p>
                    <ul className="space-y-2 text-foreground/70">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                        <span>{t['howItWorks.useCases.bugs.items.visual'] ?? ''}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                        <span>{t['howItWorks.useCases.bugs.items.systematic'] ?? ''}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                        <span>{t['howItWorks.useCases.bugs.items.persistent'] ?? ''}</span>
                      </li>
                    </ul>
                  </GlassCard>
                  <GlassCard className="p-8">
                    <h3 className="text-xl font-bold mb-4">{t['howItWorks.useCases.legacy.title'] ?? ''}</h3>
                    <p className="text-foreground/80 mb-4">
                      {t['howItWorks.useCases.legacy.description'] ?? ''}
                    </p>
                    <ul className="space-y-2 text-foreground/70">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                        <span>{t['howItWorks.useCases.legacy.items.dependency'] ?? ''}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                        <span>{t['howItWorks.useCases.legacy.items.breaking'] ?? ''}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                        <span>{t['howItWorks.useCases.legacy.items.cleanup'] ?? ''}</span>
                      </li>
                    </ul>
                  </GlassCard>
                  <GlassCard className="p-8">
                    <h3 className="text-xl font-bold mb-4">{t['howItWorks.useCases.professional.title'] ?? ''}</h3>
                    <p className="text-foreground/80 mb-4">
                      {t['howItWorks.useCases.professional.description'] ?? ''}
                    </p>
                    <ul className="space-y-2 text-foreground/70">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                        <span>{t['howItWorks.useCases.professional.items.governance'] ?? ''}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                        <span>{t['howItWorks.useCases.professional.items.audit'] ?? ''}</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                        <span>{t['howItWorks.useCases.professional.items.onprem'] ?? ''}</span>
                      </li>
                    </ul>
                  </GlassCard>
                </div>
              </div>
              {/* See It In Action */}
              <div className="mb-16">
                <GlassCard className="p-6 max-w-2xl mx-auto text-center">
                  <div className="flex items-center justify-center gap-3 mb-3">
                    <Play className="w-6 h-6 text-primary" />
                    <h2 className="text-2xl font-bold">{t['howItWorks.demo.title'] ?? ''}</h2>
                  </div>
                  <p className="text-foreground/70 mb-6">
                    {t['howItWorks.demo.description'] ?? ''}
                  </p>
                  <Button variant="cta" size="lg" asChild>
                    <Link href="/demo">
                      {t['howItWorks.demo.button'] ?? ''}
                    </Link>
                  </Button>
                </GlassCard>
              </div>
              {/* CTA */}
              <div className="text-center">
                <GlassCard className="p-8 sm:p-12 max-w-4xl mx-auto" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">{t['howItWorks.cta.title'] ?? ''}</h2>
                  <p className="text-lg text-foreground/80 mb-8 max-w-3xl mx-auto">
                    {t['howItWorks.cta.subtitle'] ?? ''}
                  </p>
                  <PlatformDownloadSection location="how_it_works" />
                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                    <LinkWithArrow href="/demo">
                      {t['howItWorks.cta.links.demo'] ?? ''}
                    </LinkWithArrow>
                    <span className="hidden sm:inline">•</span>
                    <LinkWithArrow href="/features/plan-mode">
                      {t['howItWorks.cta.links.planning'] ?? ''}
                    </LinkWithArrow>
                    <span className="hidden sm:inline">•</span>
                    <LinkWithArrow href="/docs">
                      {t['howItWorks.cta.links.docs'] ?? ''}
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
