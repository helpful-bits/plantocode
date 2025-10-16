import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/GlassCard';
import { VideoButton } from '@/components/ui/VideoButton';
import { StructuredData } from '@/components/seo/StructuredData';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
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

export const metadata: Metadata = {
  title: 'AI Text Improvement: Instant Task Description Refinement | Vibe Manager',
  description:
    'Select any text, click to improve. AI refines task descriptions with full project context. Customizable prompts capture your mental model accurately. Used by teams who ship fast.',
  keywords: [
    'ai text improvement',
    'task description refinement',
    'ai writing assistant developers',
    'claude text improvement',
    'context-aware text refinement',
    'task clarity ai',
    'vibe manager text improvement',
  ],
  openGraph: {
    title: 'AI Text Improvement: Instant Task Description Refinement',
    description:
      'Select text, click improve. AI refines with project context. Capture mental models accurately.',
    url: 'https://www.vibemanager.app/features/text-improvement',
    siteName: 'Vibe Manager',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.vibemanager.app/features/text-improvement',
  },
};

export default function TextImprovementPage() {
  const painPoints = [
    {
      title: 'Vague requirements lead to wrong implementations',
      description:
        'AI generates code based on unclear task descriptions, missing critical constraints and edge cases.',
      icon: <Target className="w-5 h-5 text-primary" />,
    },
    {
      title: 'Rewriting task descriptions wastes time',
      description:
        'Manual refinement of ambiguous descriptions slows down planning and creates misalignment.',
      icon: <FileText className="w-5 h-5 text-primary" />,
    },
    {
      title: 'Mental models get lost in translation',
      description:
        'What you envision doesn\'t match what gets written down, leading to implementation drift.',
      icon: <Sparkles className="w-5 h-5 text-primary" />,
    },
  ];

  const howItWorks = [
    {
      step: 'Select text in task description',
      description:
        'Highlight any text in your task description or code editor. A popover appears instantly.',
      icon: <MousePointer2 className="w-5 h-5 text-primary" />,
    },
    {
      step: 'Choose "Improve" or "Refine Task"',
      description:
        'Improve: Quick style/clarity fixes. Refine Task: Deep contextual enhancement with project files.',
      icon: <Sparkles className="w-5 h-5 text-primary" />,
    },
    {
      step: 'AI processes with full context',
      description:
        'Claude Sonnet 3.5 analyzes with project files, directory structure, and customizable prompts.',
      icon: <Zap className="w-5 h-5 text-primary" />,
    },
    {
      step: 'Refined text applied inline',
      description:
        'Improved text replaces selection automatically. Preserves formatting and cursor position.',
      icon: <CheckCircle2 className="w-5 h-5 text-primary" />,
    },
  ];

  const capabilities = [
    {
      title: 'Context-aware refinement',
      description:
        'AI understands your project structure, included files, and custom instructions when refining text.',
      icon: <Code2 className="w-8 h-8 text-primary" />,
    },
    {
      title: 'Customizable system prompts',
      description:
        'Define per-project prompts with placeholders for file contents, directory tree, and custom instructions.',
      icon: <Settings className="w-8 h-8 text-primary" />,
    },
    {
      title: 'Mental model capture',
      description:
        'Iterative refinement helps AI understand your intent. Select → refine → refine again until perfect.',
      icon: <Target className="w-8 h-8 text-primary" />,
    },
    {
      title: 'Instant application',
      description:
        'Non-streaming processing for speed. Results applied directly with conflict detection to protect your edits.',
      icon: <Zap className="w-8 h-8 text-primary" />,
    },
  ];

  const useCases = [
    {
      title: 'Clarify vague requirements before planning',
      description:
        'Turn "fix the auth bug" into specific steps with edge cases, affected services, and validation checks.',
    },
    {
      title: 'Expand abbreviated notes into full context',
      description:
        'Convert shorthand like "refactor user svc" into detailed task with constraints, dependencies, and rollback plan.',
    },
    {
      title: 'Refine task descriptions for team alignment',
      description:
        'Ensure task descriptions are clear for reviewers and downstream implementation.',
    },
  ];

  const faqs = [
    {
      question: 'Which AI model does text improvement use?',
      answer:
        'Default: Claude Sonnet 3.5 via OpenRouter. You can configure different models per project in settings.',
    },
    {
      question: 'Can I customize the improvement prompts?',
      answer:
        'Yes. Define per-project system prompts with placeholders for file contents, directory tree, custom instructions, and more.',
    },
    {
      question: 'Does it work in code editors?',
      answer:
        'Yes. Works in task description fields and Monaco code editors. Select text → popover appears → choose action.',
    },
    {
      question: 'What if I edit text while improvement is running?',
      answer:
        'Conflict detection prevents overwriting your edits. If text changed during processing, the improvement is skipped with a warning.',
    },
  ];

  const softwareApplicationJsonLd: SoftwareApplication = {
    '@type': 'SoftwareApplication',
    name: 'Vibe Manager - Text Improvement',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: ['Windows 10+', 'macOS 11.0+'],
    url: 'https://www.vibemanager.app/features/text-improvement',
    description:
      'AI-powered text improvement for task descriptions. Select text, click improve. Context-aware refinement with customizable prompts.',
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
                  <span>AI Text Improvement • Context-Aware Refinement</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  Instant AI Text Improvement
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  Select any text. Click improve. AI refines with full project context. Capture your mental model accurately without rewriting.
                </p>
                <p className="text-base sm:text-lg text-foreground/70 max-w-2xl mx-auto">
                  Context-aware refinement with customizable prompts. Works in task descriptions and code editors. Used by teams who ship fast.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Button variant="cta" size="lg" asChild>
                    <Link href="/downloads">Install Vibe Manager</Link>
                  </Button>
                  <VideoButton />
                </div>
                <p className="text-sm text-foreground/60">$5 free credits • Pay-as-you-go • Works on macOS and Windows</p>
              </div>

              <div className="space-y-8">
                <h2 className="text-2xl sm:text-3xl font-bold text-center">Why teams use AI text improvement</h2>
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
                <h2 className="text-2xl sm:text-3xl font-bold text-center">How it works</h2>
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
                <h2 className="text-2xl sm:text-3xl font-bold text-center">Key capabilities</h2>
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
                <h2 className="text-2xl sm:text-3xl font-bold text-center">Common use cases</h2>
                <div className="grid md:grid-cols-3 gap-6">
                  {useCases.map((item, index) => (
                    <GlassCard key={index} className="p-6 h-full">
                      <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                      <p className="text-sm text-foreground/70 leading-relaxed">{item.description}</p>
                    </GlassCard>
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                <h2 className="text-2xl sm:text-3xl font-bold text-center">Frequently asked</h2>
                <div className="grid md:grid-cols-2 gap-6">
                  {faqs.map((item, index) => (
                    <GlassCard key={index} className="p-6 h-full">
                      <h3 className="text-lg font-semibold mb-3">{item.question}</h3>
                      <p className="text-sm text-foreground/70 leading-relaxed">{item.answer}</p>
                    </GlassCard>
                  ))}
                </div>
              </div>

              <div>
                <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto text-center" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">Refine task descriptions instantly with AI</h2>
                  <p className="text-lg text-foreground/80 mb-8">
                    Stop rewriting. Select text, click improve, get refined descriptions that capture your mental model accurately.
                  </p>
                  <PlatformDownloadSection location="features_text_improvement" />
                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                    <LinkWithArrow href="/demo">Watch the demo</LinkWithArrow>
                    <span className="hidden sm:inline">•</span>
                    <LinkWithArrow href="/features/voice-transcription">See voice features</LinkWithArrow>
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
