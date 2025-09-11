import type { Metadata } from 'next';
import { Header } from '@/components/landing/Header';
import { StructuredData } from '@/components/seo/StructuredData';
import type { SoftwareApplication, FAQPage, BreadcrumbList } from 'schema-dts';
import Reveal from '@/components/motion/Reveal';
import { Button } from '@/components/ui/button';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import { GlassCard } from '@/components/ui/GlassCard';
import Link from 'next/link';
import { Sparkles, FileSearch, GitMerge, Zap, CheckCircle, Code2, Wrench, Shield } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Vibe Code Cleanup Specialist - Multi-Model Implementation Planning',
  description: 'Generate superior implementation plans by synthesizing strategies from multiple AI models. Vibe Manager analyzes your codebase, creates detailed step-by-step plans with file operations, and provides copy maps for external example integration.',
  keywords: [
    'vibe code cleanup specialist',
    'vibe code cleanup',
    'implementation planning',
    'multi-model synthesis',
    'code architecture analysis',
    'implementation plan merge',
    'external example integration',
    'copy map generation',
    'file operation planning',
    'architectural decisions',
  ],
  alternates: {
    canonical: 'https://www.vibemanager.app/vibe-code-cleanup-specialist',
  },
  openGraph: {
    title: 'Vibe Code Cleanup Specialist - Multi-Model AI Planning',
    description: 'Generate intelligent cleanup plans from multiple AI models. Works with Claude Code, Cursor, and OpenAI Codex. Free Mac app.',
    url: 'https://www.vibemanager.app/vibe-code-cleanup-specialist',
    type: 'article',
  },
};

const softwareApplicationJsonLd: SoftwareApplication = {
  '@type': 'SoftwareApplication',
  name: 'Vibe Manager - Implementation Planning Specialist',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'macOS',
  url: 'https://www.vibemanager.app/vibe-code-cleanup-specialist',
  description: 'Advanced implementation planning through multi-model synthesis. Creates detailed file operations, copy maps for external examples, and architectural decision documentation.',
  offers: {
    '@type': 'Offer',
    price: 0,
  },
};

const faqItems = [
  {
    question: 'What is the Vibe Code Cleanup Specialist?',
    answer: 'A sophisticated implementation planning system that generates detailed, step-by-step plans with exact file operations. It synthesizes insights from multiple AI models to create superior architectural strategies with source traceability and validation checkpoints.',
  },
  {
    question: 'How does the multi-model synthesis work?',
    answer: 'Each AI model analyzes your codebase and creates an implementation plan. These plans are then merged using architectural analysis, conflict resolution protocols, and quality assessment to produce a synthesized plan that transcends individual strategies.',
  },
  {
    question: 'What are copy maps and external example integration?',
    answer: 'When referencing external code examples, Vibe Manager creates precise copy maps with source paths, selectors (symbols, line ranges, regex anchors), target locations, required transformations, and dependency tracking for reliable code integration.',
  },
  {
    question: 'How detailed are the implementation plans?',
    answer: 'Plans include exact file paths, specific functions/components to modify, bash commands for exploration, validation steps after each operation, confidence levels for decisions, and synthesis notes explaining architectural choices.',
  },
  {
    question: 'What makes this different from regular AI coding assistants?',
    answer: 'Instead of direct code generation, it focuses on architectural planning with rigorous analysis. Plans include traceability markers, validation gates, micro-steps for complex integrations, and explicit conflict resolution when approaches differ.',
  },
];

const faqPageJsonLd: FAQPage = {
  '@type': 'FAQPage',
  mainEntity: faqItems.map(item => ({
    '@type': 'Question',
    name: item.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: item.answer,
    },
  })),
};

export default function VibeCodeCleanupSpecialistPage() {
  const breadcrumbJsonLd: BreadcrumbList = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://www.vibemanager.app'
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Vibe Code Cleanup Specialist',
        item: 'https://www.vibemanager.app/vibe-code-cleanup-specialist'
      }
    ]
  };

  return (
    <>
      <StructuredData data={softwareApplicationJsonLd} />
      <StructuredData data={faqPageJsonLd} />
      <StructuredData data={breadcrumbJsonLd} />
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent">
        <Header />
        
        <main className="flex-grow">
          <section className="relative py-12 sm:py-16 md:py-20 lg:py-24 px-4 overflow-hidden">
            <div className="max-w-6xl mx-auto relative z-10">
              <div className="text-center mb-12 sm:mb-16">
                <Reveal as="div" className="text-center">
                  <div className="mt-1 w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/30 ring-1 ring-primary/30 flex items-center justify-center">
                    <Sparkles className="w-8 h-8 text-primary flex-shrink-0" />
                  </div>
                  <h1 className="text-3xl sm:text-4xl lg:text-5xl mb-6 text-primary-emphasis font-bold text-shadow-subtle">
                    Vibe Code Cleanup Specialist
                  </h1>
                  <p className="text-lg sm:text-xl max-w-3xl mx-auto leading-relaxed font-medium text-foreground/85 dark:text-foreground/90">
                    Generate superior implementation plans through multi-model synthesis. 
                    Create detailed file operations with external example integration and architectural decision documentation.
                  </p>
                </Reveal>
              </div>

              <div className="grid md:grid-cols-3 gap-6 mb-16 max-w-5xl mx-auto">
                <Reveal className="feature-card group" delay={0.1}>
                  <GlassCard className="h-full">
                    <div className="content-spacing text-safe-padding">
                      <div className="flex mx-auto mb-4 w-16 h-16 rounded-2xl items-center justify-center bg-gradient-to-br from-primary/10 to-primary/20 ring-1 ring-primary/20">
                        <FileSearch className="w-8 h-8 text-primary/80" />
                      </div>
                      <h3 className="text-xl font-semibold text-center mb-3 text-foreground">Intelligent File Discovery</h3>
                      <p className="text-center text-sm leading-relaxed text-foreground/80">
                        Uses regex patterns, AST paths, and content analysis to identify exact files and code sections for modification.
                      </p>
                    </div>
                  </GlassCard>
                </Reveal>
                
                <Reveal className="feature-card group" delay={0.15}>
                  <GlassCard className="h-full">
                    <div className="content-spacing text-safe-padding">
                      <div className="flex mx-auto mb-4 w-16 h-16 rounded-2xl items-center justify-center bg-gradient-to-br from-primary/10 to-primary/20 ring-1 ring-primary/20">
                        <GitMerge className="w-8 h-8 text-primary/80" />
                      </div>
                      <h3 className="text-xl font-semibold text-center mb-3 text-foreground">Plan Synthesis & Merge</h3>
                      <p className="text-center text-sm leading-relaxed text-foreground/80">
                        Analyzes plans from multiple models, resolves conflicts, and synthesizes superior strategies with source traceability.
                      </p>
                    </div>
                  </GlassCard>
                </Reveal>
                
                <Reveal className="feature-card group" delay={0.2}>
                  <GlassCard className="h-full">
                    <div className="content-spacing text-safe-padding">
                      <div className="flex mx-auto mb-4 w-16 h-16 rounded-2xl items-center justify-center bg-gradient-to-br from-primary/10 to-primary/20 ring-1 ring-primary/20">
                        <Zap className="w-8 h-8 text-primary/80" />
                      </div>
                      <h3 className="text-xl font-semibold text-center mb-3 text-foreground">Detailed File Operations</h3>
                      <p className="text-center text-sm leading-relaxed text-foreground/80">
                        Generates exact file paths, function modifications, copy maps, and validation checkpoints for reliable execution.
                      </p>
                    </div>
                  </GlassCard>
                </Reveal>
              </div>

              <Reveal className="mb-16 max-w-4xl mx-auto">
                <GlassCard highlighted className="p-8">
                  <h3 className="text-2xl font-bold mb-6 text-center text-primary-emphasis">Implementation Capabilities</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center">
                          <CheckCircle className="w-5 h-5 text-success" />
                        </div>
                        <span className="text-sm font-medium text-foreground/85 dark:text-foreground/90">Architectural analysis with SOLID principles</span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center">
                          <CheckCircle className="w-5 h-5 text-success" />
                        </div>
                        <span className="text-sm font-medium text-foreground/85 dark:text-foreground/90">External example integration with copy maps</span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center">
                          <CheckCircle className="w-5 h-5 text-success" />
                        </div>
                        <span className="text-sm font-medium text-foreground/85 dark:text-foreground/90">Conflict resolution between approaches</span>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center">
                          <CheckCircle className="w-5 h-5 text-success" />
                        </div>
                        <span className="text-sm font-medium text-foreground/85 dark:text-foreground/90">Source traceability with inline markers</span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center">
                          <CheckCircle className="w-5 h-5 text-success" />
                        </div>
                        <span className="text-sm font-medium text-foreground/85 dark:text-foreground/90">Validation gates and checkpoints</span>
                      </div>
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-full bg-success/10 flex items-center justify-center">
                          <CheckCircle className="w-5 h-5 text-success" />
                        </div>
                        <span className="text-sm font-medium text-foreground/85 dark:text-foreground/90">Micro-step breakdown for complex tasks</span>
                      </div>
                    </div>
                  </div>
                </GlassCard>
              </Reveal>

              <Reveal className="mb-16 max-w-4xl mx-auto">
                <div className="text-center mb-8">
                  <h2 className="text-2xl sm:text-3xl font-bold text-primary-emphasis">How It Works</h2>
                </div>
                <div className="grid md:grid-cols-3 gap-6">
                  <Reveal delay={0.1}>
                    <GlassCard className="text-center h-full">
                      <div className="w-16 h-16 bg-gradient-to-br from-primary/10 to-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <Code2 className="w-8 h-8 text-primary" />
                      </div>
                      <h4 className="font-semibold mb-3 text-lg">1. Define Your Task</h4>
                      <p className="text-sm text-foreground/80 leading-relaxed">
                        Describe what needs implementation - features, refactoring, or architectural improvements
                      </p>
                    </GlassCard>
                  </Reveal>
                  <Reveal delay={0.15}>
                    <GlassCard className="text-center h-full">
                      <div className="w-16 h-16 bg-gradient-to-br from-primary/10 to-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <Wrench className="w-8 h-8 text-primary" />
                      </div>
                      <h4 className="font-semibold mb-3 text-lg">2. Synthesize Plans</h4>
                      <p className="text-sm text-foreground/80 leading-relaxed">
                        Multiple AI models create plans, then merge into a superior synthesized strategy
                      </p>
                    </GlassCard>
                  </Reveal>
                  <Reveal delay={0.2}>
                    <GlassCard className="text-center h-full">
                      <div className="w-16 h-16 bg-gradient-to-br from-primary/10 to-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <Shield className="w-8 h-8 text-primary" />
                      </div>
                      <h4 className="font-semibold mb-3 text-lg">3. Execute Implementation</h4>
                      <p className="text-sm text-foreground/80 leading-relaxed">
                        Follow detailed file operations with validation checkpoints for reliable execution
                      </p>
                    </GlassCard>
                  </Reveal>
                </div>
              </Reveal>

              <Reveal className="mb-16 max-w-4xl mx-auto">
                <div className="space-y-8">
                  <h2 className="text-2xl sm:text-3xl font-bold text-center text-primary-emphasis mb-8">Frequently Asked Questions</h2>
                  <div className="space-y-4">
                    {faqItems.map((item, index) => (
                      <Reveal key={index} delay={0.05 + index * 0.03}>
                        <GlassCard className="p-6">
                          <h3 className="text-lg font-semibold mb-3 text-foreground">{item.question}</h3>
                          <p className="text-sm leading-relaxed text-foreground/80">{item.answer}</p>
                        </GlassCard>
                      </Reveal>
                    ))}
                  </div>
                </div>
              </Reveal>

              <Reveal className="text-center max-w-3xl mx-auto">
                <GlassCard highlighted className="p-12">
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4 text-primary-emphasis">Start Planning Better Implementations</h2>
                  <p className="text-lg font-medium text-foreground/85 dark:text-foreground/90 mb-8 max-w-2xl mx-auto">
                    Download Vibe Manager for superior implementation planning through multi-model synthesis
                  </p>
                  <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <PlatformDownloadSection 
                      location="vibe_code_cleanup_specialist"
                      redirectToDownloadPage={true}
                    />
                    <Button asChild variant="outline" size="lg" className="min-w-[200px]">
                      <Link href="/#how-it-works">
                        See How It Works
                      </Link>
                    </Button>
                  </div>
                </GlassCard>
              </Reveal>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}