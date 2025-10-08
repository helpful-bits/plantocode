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
  Terminal,
  EyeOff,
  Compass,
  GitMerge,
  History,
  Search,
  Layers,
  ClipboardCheck,
  ShieldCheck,
  Sparkles,
  Laptop,
  Bug,
  Users,
  Link2,
  CheckCircle2,
} from 'lucide-react';
import type { SoftwareApplication, HowTo, FAQPage } from 'schema-dts';

export const metadata: Metadata = {
  title: 'Planning Workflow for Cursor Composer & Agent | Vibe Manager',
  description:
    'Add architectural pre-planning to Cursor Composer and Agent mode. Vibe Manager discovers impacted files, merges multi-model plans, providing context Cursor needs before Agent mode executes.',
  keywords: [
    'cursor planning workflow',
    'cursor composer planning',
    'cursor agent mode workflow',
    'cursor architectural planning',
    'cursor agent pre-planning',
    'cursor composer context',
    'vibe manager cursor',
  ],
  openGraph: {
    title: 'Planning Workflow for Cursor Composer & Agent',
    description:
      'Give Cursor Agent mode the architectural context it needs. File discovery, merged AI plans, and execution guardrails for Windows, macOS, and WSL.',
    url: 'https://www.vibemanager.app/plan-mode/cursor',
    siteName: 'Vibe Manager',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.vibemanager.app/plan-mode/cursor',
  },
};

export default function CursorPlanModePage() {
  const painPoints = [
    {
      title: 'Preparing an architectural brief takes time',
      description:
        'Cursor can search on demand, yet teams still compile scope summaries, service notes, and owner docs manually before running Composer.',
      icon: <EyeOff className="w-5 h-5 text-primary" />,
    },
    {
      title: 'Evaluating multiple strategies is tedious',
      description:
        'Trying different prompts or models means juggling separate plan outputs and diffing them by hand.',
      icon: <Compass className="w-5 h-5 text-primary" />,
    },
    {
      title: 'Operational guardrails live outside Cursor',
      description:
        'Approval checklists, rollback steps, and success criteria usually sit in external docs instead of the plan itself.',
      icon: <GitMerge className="w-5 h-5 text-primary" />,
    },
    {
      title: 'Audit trails depend on manual logging',
      description:
        'Agent Terminal produces shell output, but keeping metadata, approvals, and WSL transcripts organised is extra overhead.',
      icon: <History className="w-5 h-5 text-primary" />,
    },
  ];

  const capabilities = [
    {
      title: 'Architectural discovery before Cursor plans',
      description:
        'Run Vibe\'s multi-stage file discovery to map every impacted file and dependency. Hand Cursor a complete context package.',
      icon: <Search className="w-8 h-8 text-primary" />,
    },
    {
      title: 'Multi-model plan synthesis',
      description:
        'Generate plans from GPT-5, Claude, Gemini, and Cursor itself. Merge them into one annotated plan ready for Composer.',
      icon: <Layers className="w-8 h-8 text-primary" />,
    },
    {
      title: 'Cursor-ready copy buttons',
      description:
        'One-click prompts and XML exports slot directly into Cursor Composer or Agent mode. Keep formatting, file lists, and guardrails intact.',
      icon: <ClipboardCheck className="w-8 h-8 text-primary" />,
    },
    {
      title: 'Execution guardrails with WSL support',
      description:
        'Run plans in Vibe\'s terminal (macOS, Windows, WSL). Health monitoring, approvals, and searchable transcripts keep teams aligned.',
      icon: <ShieldCheck className="w-8 h-8 text-primary" />,
    },
  ];

  const workflow = [
    {
      step: 'Discover and scope the change',
      description:
        'Point Vibe at your repo. File discovery highlights the directories, services, and configs Cursor needs to know about.',
      icon: <Compass className="w-5 h-5 text-primary" />,
    },
    {
      step: 'Generate multi-model plans',
      description:
        'Run GPT-5 and Gemini 2.5 Pro multiple times (e.g., 3x GPT-5, 2x Gemini). Each run finds subtle implementation details the others miss—critical when context is large.',
      icon: <Sparkles className="w-5 h-5 text-primary" />,
    },
    {
      step: 'Merge and annotate for Cursor',
      description:
        'Use merge instructions to create a single plan with comments, TODOs, and checkpoints tailored for Cursor Composer and Agent mode.',
      icon: <GitMerge className="w-5 h-5 text-primary" />,
    },
    {
      step: 'Execute or paste into Cursor',
      description:
        'Run the plan in Vibe\'s terminal (with approvals) or paste the annotated context into Cursor Composer or Agent mode.',
      icon: <Terminal className="w-5 h-5 text-primary" />,
    },
  ];

  const comparisons = [
    {
      title: 'Context packaging',
      cursor: 'Cursor can search indexed files on demand, but teams summarise the relevant results manually.',
      vibe: 'Maps the architecture, selected files, and dependencies into a reusable brief before planning begins.',
    },
    {
      title: 'Plan review',
      cursor: 'Sequential plan runs mean alternative strategies require manual juggling.',
      vibe: 'Run models multiple times (3x GPT-5, 2x Gemini). Merge complementary implementation details with source attribution before execution.',
    },
    {
      title: 'Execution oversight',
      cursor: 'Agent Terminal runs commands immediately; organising logs and approvals is an extra step.',
      vibe: 'Integrated terminal enforces approvals, supports WSL, and records every session automatically.',
    },
  ];

  const quickstartSteps = [
    {
      title: 'Install Vibe Manager on the same machine as Cursor',
      description:
        'macOS, Windows, or WSL—connect Vibe to your repo so it can share context with Cursor.',
    },
    {
      title: 'Run file discovery for your task',
      description:
        'Generate a focused set of files and dependencies. Keep it in Vibe or paste it into Cursor\'s context window.',
    },
    {
      title: 'Generate and merge plans',
      description:
        'Run GPT-5 and Gemini multiple times. Merge complementary implementation details into one Cursor-ready blueprint with annotations and checkpoints.',
    },
    {
      title: 'Execute with confidence',
      description:
        'Paste the plan into Cursor or run it in Vibe\'s terminal with approvals, WSL support, and full transcripts.',
    },
  ];

  const useCases = [
    {
      title: 'Bug triage on Windows + WSL',
      description:
        'Keep Cursor\'s fixes from missing the root cause. Discovery highlights cross-service impacts, while Vibe\'s terminal records every WSL command.',
      icon: <Bug className="w-5 h-5 text-primary" />,
    },
    {
      title: 'Large features with multi-file diffs',
      description:
        'Design the implementation in Vibe, then paste the plan into Cursor so Composer can apply changes with full context.',
      icon: <Laptop className="w-5 h-5 text-primary" />,
    },
    {
      title: 'Team-wide plan reviews',
      description:
        'Share the merged plan before Cursor runs it. Capture approvals and comments so everyone understands the approach.',
      icon: <Users className="w-5 h-5 text-primary" />,
    },
  ];

  const outcomeHighlights = [
    {
      title: 'Expose cross-service impacts',
      detail: 'File discovery surfaces shared packages and configs so Cursor plans don’t miss the blast radius.',
    },
    {
      title: 'Review alternative implementation paths',
      detail: 'Merged plans keep annotations and checkpoints that make Composer runs predictable.',
    },
    {
      title: 'Retain execution history on Windows + WSL',
      detail: 'Persistent terminals capture every command with approvals so teams can audit Cursor sessions later.',
    },
  ];

  const faqs = [
    {
      question: 'Does Cursor have a plan mode feature?',
      answer:
        'No. Cursor has Composer and Agent mode, which plan internally during execution but don\'t offer a separate user-controlled planning phase. Vibe Manager adds that pre-planning layer—giving you file discovery, multi-model synthesis, and reviewable architectural context BEFORE Cursor Agent executes.',
    },
    {
      question: 'How do I use Vibe Manager plans with Cursor?',
      answer:
        'After creating a merged plan in Vibe Manager, you can either: 1) Paste the context and instructions into Cursor Composer or Agent mode for execution, or 2) Execute directly in Vibe\'s terminal with full logging, then sync results back to your Cursor workspace.',
    },
    {
      question: 'Does this work on Windows and WSL?',
      answer:
        'Yes. Vibe Manager supports Windows 10+, WSL, and macOS. The integrated terminal provides persistent logging and approvals that complement Cursor\'s terminal integration.',
    },
  ];

  const softwareApplicationJsonLd: SoftwareApplication = {
    '@type': 'SoftwareApplication',
    name: 'Vibe Manager',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: ['macOS 11.0+', 'Windows 10+'],
    url: 'https://www.vibemanager.app/plan-mode/cursor',
    description:
      'Pre-planning workflow for Cursor Composer and Agent mode. Discover impacted files, merge multi-model plans, and execute with approvals across macOS, Windows, and WSL.',
    offers: {
      '@type': 'Offer',
      price: 0,
      priceCurrency: 'USD',
      description: 'Free desktop app with pay-as-you-go usage and $5 signup credits.',
    },
  };

  const howToJsonLd: HowTo = {
    '@type': 'HowTo',
    name: 'Use Vibe Manager with Cursor Composer and Agent mode',
    description: 'Prepare and run Cursor plans with complete architectural context.',
    step: quickstartSteps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step.title,
      text: step.description,
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
                  <Terminal className="w-4 h-4" />
                  <span>Cursor • Pre-planning for Composer & Agent</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  Planning Workflow for Cursor
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  Cursor Agent mode plans internally during execution. Vibe Manager adds architectural pre-planning BEFORE Agent runs—discovering scope, merging multi-model insights, and providing reviewable context.
                </p>
                <p className="text-base sm:text-lg text-foreground/70 max-w-2xl mx-auto">
                  Ideal for Windows + WSL users, large features, and teams that need full architectural context before Cursor Composer or Agent mode executes.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Button variant="cta" size="lg" asChild>
                    <Link href="/downloads">Install Vibe Manager</Link>
                  </Button>
                  <VideoButton />
                </div>
                <p className="text-sm text-foreground/60">$5 free credits • Pay-as-you-go • Works with Cursor Composer and Agent Terminal</p>
              </div>

              <div className="space-y-8">
                <h2 className="text-2xl sm:text-3xl font-bold text-center">Where teams add structure to Cursor plans</h2>
                <div className="grid md:grid-cols-2 gap-6">
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
                <h2 className="text-2xl sm:text-3xl font-bold text-center">What Vibe Manager adds to Cursor</h2>
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
                <h2 className="text-2xl sm:text-3xl font-bold text-center">Cursor + Vibe workflow</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {workflow.map((item, index) => (
                    <GlassCard key={index} className="p-6 h-full" highlighted>
                      <div className="flex items-center gap-2 mb-3">
                        {item.icon}
                        <span className="font-semibold">{item.step}</span>
                      </div>
                      <p className="text-sm text-foreground/70 leading-relaxed">{item.description}</p>
                    </GlassCard>
                  ))}
                </div>
                <div className="text-center">
                  <LinkWithArrow href="/bug-triage/cursor/windows">See the Cursor bug triage playbook</LinkWithArrow>
                </div>
              </div>

              <div className="space-y-6">
                <h2 className="text-2xl sm:text-3xl font-bold text-center">Why Cursor teams bring in Vibe</h2>
                <div className="space-y-4">
                  {comparisons.map((item, index) => (
                    <GlassCard key={index} className="p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <Link2 className="w-5 h-5 text-primary" />
                        <h3 className="text-lg font-semibold">{item.title}</h3>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-4 text-sm text-foreground/70">
                        <div className="rounded-xl border border-border/40 p-4">
                          <div className="font-semibold text-foreground mb-1">Cursor Composer/Agent alone</div>
                          <p className="leading-relaxed">{item.cursor}</p>
                        </div>
                        <div className="rounded-xl border border-primary/40 p-4 bg-primary/5">
                          <div className="font-semibold text-foreground mb-1">With Vibe Manager</div>
                          <p className="leading-relaxed">{item.vibe}</p>
                        </div>
                      </div>
                    </GlassCard>
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                <GlassCard className="p-8" highlighted>
                  <div className="flex items-start gap-4">
                    <div className="mt-1">
                      <CheckCircle2 className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-2xl sm:text-3xl font-bold mb-4">Cursor planning workflow quickstart</h2>
                      <ol className="space-y-4 text-foreground/80 text-sm sm:text-base">
                        {quickstartSteps.map((step, index) => (
                          <li key={index} className="flex gap-3">
                            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold">
                              {index + 1}
                            </span>
                            <div>
                              <div className="font-semibold text-foreground mb-1">{step.title}</div>
                              <p className="leading-relaxed">{step.description}</p>
                            </div>
                          </li>
                        ))}
                      </ol>
                      <div className="mt-6 flex flex-col sm:flex-row gap-4 text-sm text-foreground/70">
                        <LinkWithArrow href="/features/integrated-terminal">See integrated terminal guardrails</LinkWithArrow>
                        <LinkWithArrow href="/features/plan-mode">Explore the plan editor</LinkWithArrow>
                      </div>
                    </div>
                  </div>
                </GlassCard>
              </div>

              <div className="space-y-8">
                <h2 className="text-2xl sm:text-3xl font-bold text-center">How Cursor teams rely on Vibe Manager</h2>
                <div className="grid md:grid-cols-3 gap-6">
                  {useCases.map((item, index) => (
                    <GlassCard key={index} className="p-6 h-full">
                      <div className="flex items-start gap-3">
                        <div className="text-primary mt-1">{item.icon}</div>
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
                <h2 className="text-2xl sm:text-3xl font-bold text-center">Outcomes Cursor teams target</h2>
                <div className="grid md:grid-cols-3 gap-6">
                  {outcomeHighlights.map((item, index) => (
                    <GlassCard key={index} className="p-6 h-full" highlighted>
                      <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                      <p className="text-sm text-foreground/70 leading-relaxed">{item.detail}</p>
                    </GlassCard>
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                <h2 className="text-2xl sm:text-3xl font-bold text-center">Frequently asked</h2>
                <div className="grid md:grid-cols-3 gap-6">
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
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">Give Cursor Agent the architectural context it needs</h2>
                  <p className="text-lg text-foreground/80 mb-8">
                    Pre-plan with multi-model synthesis, discover the full scope, then feed Cursor Composer or Agent mode with reviewable context that matches your architecture.
                  </p>
                  <PlatformDownloadSection location="plan_mode_cursor" />
                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                    <LinkWithArrow href="/demo">Watch the demo</LinkWithArrow>
                    <span className="hidden sm:inline">•</span>
                    <LinkWithArrow href="/support#book">Book an architect session</LinkWithArrow>
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
