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
  SearchX,
  EyeOff,
  GitMerge,
  History,
  Search,
  Layers,
  ShieldCheck,
  ClipboardCheck,
  Compass,
  Sparkles,
  GitBranch,
  Database,
  Shield,
  Link2,
  CheckCircle2,
} from 'lucide-react';
import type { SoftwareApplication, HowTo, FAQPage } from 'schema-dts';

export const metadata: Metadata = {
  title: 'PlanToCode + Codex CLI - plan before you run',
  description:
    'Stop Codex breaking your codebase. Discover every file, dependency, and service BEFORE Codex runs. Multi-model planning (Gemini 2.5 Pro, GPT-5, Claude 4.5 Sonnet) prevents surprise regressions.',
  keywords: [
    'codex cli planning workflow',
    'openai codex cli architectural planning',
    'codex cli approval modes',
    'codex cli read-only mode',
    'codex planning workflow',
    'gpt-5-codex planning',
    'codex cli file discovery',
    'plantocode codex',
  ],
  openGraph: {
    title: 'PlanToCode + Codex CLI - plan before you run',
    description:
      'See every file Codex will touch before it runs. Discover impacted files, merge GPT-5 & Claude plans, execute with Codex approval modes. Architectural pre-planning for Codex CLI teams.',
    url: 'https://www.plantocode.com/plan-mode/codex',
    siteName: 'PlanToCode',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.plantocode.com/plan-mode/codex',
  },
};

export default function CodexPlanModePage() {
  const painPoints = [
    {
      title: 'Codex scopes automatically but lacks architectural documentation',
      description:
        'Codex explores your workspace and creates task lists automatically, but produces no reusable architectural documentation or dependency maps you can review with your team.',
      icon: <SearchX className="w-5 h-5 text-primary" />,
    },
    {
      title: 'Codex executes without a separate planning phase',
      description:
        'Unlike Claude Code\'s Plan Mode, Codex doesn\'t have a review-before-execution feature. It creates task lists and executes immediately - you can\'t compare multiple architectural approaches before committing.',
      icon: <EyeOff className="w-5 h-5 text-primary" />,
    },
    {
      title: 'Operational runbooks live outside the CLI',
      description:
        'Prompt snippets, checklists, and approval steps often sit in separate docs, so each session starts with setup rather than execution.',
      icon: <GitMerge className="w-5 h-5 text-primary" />,
    },
    {
      title: 'Command history needs consolidation',
      description:
        'Codex CLI outputs to your terminal. Capturing metadata, approvals, and a searchable history for audits is an extra chore.',
      icon: <History className="w-5 h-5 text-primary" />,
    },
  ];

  const capabilities = [
    {
      title: 'AI file discovery for Codex tasks',
      description:
        'Surface every impacted file before Codex ever generates a command. Multi-stage discovery maps dependencies, caches roots, and exports context for Codex prompts.',
      icon: <Search className="w-8 h-8 text-primary" />,
    },
    {
      title: 'Multi-model plan synthesis',
      description:
        'Generate plans from Gemini 2.5 Pro, GPT-5, Claude 4.5 Sonnet, and Codex. PlanToCode\'s architect merges them with your guidance into one bulletproof blueprint.',
      icon: <Layers className="w-8 h-8 text-primary" />,
    },
    {
      title: 'Execution with approvals and health checks',
      description:
        'Run every step inside persistent PTY sessions. Require confirmation, watch health telemetry, and pause Codex instructions when something looks risky.',
      icon: <ShieldCheck className="w-8 h-8 text-primary" />,
    },
    {
      title: 'Prompt kits tuned for Codex CLI',
      description:
        'Copy buttons deliver consistent Codex instructions - plan, implement, verify. Stop re-typing "make it idempotent" for the twentieth time.',
      icon: <ClipboardCheck className="w-8 h-8 text-primary" />,
    },
  ];

  const workflow = [
    {
      step: 'Scope the blast radius',
      description:
        'Run file discovery against your repo. PlanToCode highlights entry points, downstream services, and shared configs Codex needs to respect.',
      icon: <Compass className="w-5 h-5 text-primary" />,
    },
    {
      step: 'Generate multiple plans',
      description:
        'Run GPT-5 and Gemini 2.5 Pro multiple times. Each run surfaces different implementation details - tackling the LLM attention problem when context includes many full files.',
      icon: <Sparkles className="w-5 h-5 text-primary" />,
    },
    {
      step: 'Guide the merge',
      description:
        'Tell the AI architect what to keep, what to drop, and how to structure the final plan. Every decision keeps source attribution.',
      icon: <GitMerge className="w-5 h-5 text-primary" />,
    },
    {
      step: 'Execute with confidence',
      description:
        'Run the merged plan in PlanToCode terminal or paste it into Codex CLI with full scope visibility and logging.',
      icon: <Terminal className="w-5 h-5 text-primary" />,
    },
  ];

  const comparisons = [
    {
      title: 'Architectural documentation',
      codex: 'Codex traverses the repo automatically and creates task lists, but produces no reusable architectural documentation for team review.',
      vibe: 'File discovery generates persistent dependency maps and impact analysis that travels across sessions and team members.',
    },
    {
      title: 'Multi-model synthesis',
      codex: 'Codex executes with GPT-5-Codex only. Comparing approaches from Claude 4.5 Sonnet or Gemini requires separate sessions and manual synthesis.',
      vibe: 'Run GPT-5 and Gemini multiple times (e.g., 3x GPT-5, 2x Gemini). Each run surfaces complementary implementation details - merged with full source attribution.',
    },
    {
      title: 'Execution auditability',
      codex: 'Codex has approval modes (Read-Only, Auto, Full) but no centralized audit trail or health monitoring across sessions.',
      vibe: 'Persistent terminal with approvals, health monitoring, and searchable logs provides complete audit trails for compliance.',
    },
  ];

  const quickstartSteps = [
    {
      title: 'Install PlanToCode and connect your repo',
      description:
        'Download the desktop app for macOS or Windows, point it at the same workspace you use with Codex CLI, and let it index the project.',
    },
    {
      title: 'Run file discovery for your task',
      description:
        'Describe the change once. PlanToCode builds a scoped file list and impact map you can feed straight into Codex prompts.',
    },
    {
      title: 'Generate and merge multi-model plans',
      description:
        'Run multiple models (e.g., Gemini 2.5 Pro, GPT-5, Claude 4.5 Sonnet). Each run finds complementary details. Use merge instructions to synthesize a comprehensive plan with full attribution.',
    },
    {
      title: 'Execute or hand back to Codex',
      description:
        'Run inside PlanToCode\'s persistent terminal with approvals or copy the validated plan into Codex CLI when you\'re ready.',
    },
  ];

  const useCases = [
    {
      title: 'Large refactors in monorepos',
      description:
        'Coordinate edits across packages, services, and shared configs. File discovery keeps Codex aligned with the repo topology.',
      icon: <GitBranch className="w-5 h-5 text-primary" />,
    },
    {
      title: 'API and schema migrations',
      description:
        'Model-by-model plans ensure contract updates, migrations, and SDK changes stay synchronized before Codex touches production.',
      icon: <Database className="w-5 h-5 text-primary" />,
    },
    {
      title: 'Governed, review-heavy teams',
      description:
        'Maintain audit trails, approvals, and reproducible logs for every Codex session. Perfect for regulated environments.',
      icon: <Shield className="w-5 h-5 text-primary" />,
    },
  ];

  const outcomeHighlights = [
    {
      title: 'Expose hidden scope before Codex runs',
      detail: 'Teams spot config files, background jobs, and downstream services during discovery instead of during rollback.',
    },
    {
      title: 'Surface complementary implementation details',
      detail: 'Multiple runs (3x GPT-5, 2x Gemini) each find subtle details the others miss. Tackle LLM attention limitations when context is large.',
    },
    {
      title: 'Maintain an auditable command history',
      detail: 'Persistent terminals and approvals give compliance the exact commands that were executed.',
    },
  ];

  const faqs = [
    {
      question: 'Does PlanToCode replace Codex CLI?',
      answer:
        'No. PlanToCode adds architectural pre-planning, file discovery, and multi-model synthesis that happens BEFORE you use Codex CLI. You still use Codex CLI for execution - now with better context and reviewable plans. Use Codex Read-Only or Auto approval modes for maximum safety.',
    },
    {
      question: 'How do Codex approval modes work with PlanToCode?',
      answer:
        'Codex CLI has three approval modes (/approvals command): Read-Only (requires approval for all actions), Auto (default - workspace freedom, approval outside), and Full Access (no approvals). Most teams plan in PlanToCode, then execute in Codex with Read-Only or Auto mode for safe iteration.',
    },
    {
      question: 'Which platforms are supported?',
      answer:
        'PlanToCode runs on macOS 11+, Windows 10+, and works great with remote containers. The workflow integrates seamlessly with Codex CLI approval modes and whichever shell you prefer.',
    },
  ];

  const softwareApplicationJsonLd: SoftwareApplication = {
    '@type': 'SoftwareApplication',
    name: 'PlanToCode',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: ['macOS 11.0+', 'Windows 10+'],
    url: 'https://www.plantocode.com/plan-mode/codex',
    description:
      'Pre-planning workflow for OpenAI Codex CLI. Discover impacted files, merge multi-model plans, then execute in Codex with approval modes in persistent terminals.',
    offers: {
      '@type': 'Offer',
      price: 0,
      priceCurrency: 'USD',
      description: 'Free desktop app with pay-as-you-go API usage and $5 in credits on signup.',
    },
  };

  const howToJsonLd: HowTo = {
    '@type': 'HowTo',
    name: 'Use PlanToCode planning workflow with OpenAI Codex CLI',
    description: 'Generate and review architectural plans before running Codex CLI commands.',
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
                  <span>Codex CLI • Pre-planning before execution</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  Plan Codex CLI runs before you execute
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  See impacted files, merge multi-model plans, then run Codex with approvals in a terminal that keeps logs.
                </p>
                <p className="text-base sm:text-lg text-foreground/70 max-w-2xl mx-auto">
                  PlanToCode provides pre-planning with file discovery, multi-model synthesis, and reviewable plans - then you execute in Codex with Read-Only, Auto, or Full Access approval modes.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Button variant="cta" size="lg" asChild>
                    <Link href="/downloads">Install PlanToCode</Link>
                  </Button>
                  <VideoButton />
                </div>
                <p className="text-sm text-foreground/60">$5 free credits • Pay-as-you-go • Works with Codex CLI approvals</p>
              </div>

              <div className="space-y-8">
                <h2 className="text-2xl sm:text-3xl font-bold text-center">Where Codex teams add pre-planning structure</h2>
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
                <h2 className="text-2xl sm:text-3xl font-bold text-center">What PlanToCode layers on top of Codex</h2>
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
                <h2 className="text-2xl sm:text-3xl font-bold text-center">How the Codex + PlanToCode workflow runs</h2>
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
                  <LinkWithArrow href="/features/plan-mode">Explore the plan editor</LinkWithArrow>
                </div>
              </div>

              <div className="space-y-6">
                <h2 className="text-2xl sm:text-3xl font-bold text-center">Why teams add PlanToCode pre-planning to Codex CLI</h2>
                <div className="space-y-4">
                  {comparisons.map((item, index) => (
                    <GlassCard key={index} className="p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <Link2 className="w-5 h-5 text-primary" />
                        <h3 className="text-lg font-semibold">{item.title}</h3>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-4 text-sm text-foreground/70">
                        <div className="rounded-xl border border-border/40 p-4">
                          <div className="font-semibold text-foreground mb-1">Codex CLI alone</div>
                          <p className="leading-relaxed">{item.codex}</p>
                        </div>
                        <div className="rounded-xl border border-primary/40 p-4 bg-primary/5">
                          <div className="font-semibold text-foreground mb-1">With PlanToCode</div>
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
                      <h2 className="text-2xl sm:text-3xl font-bold mb-4">Codex CLI planning workflow quickstart</h2>
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
                        <LinkWithArrow href="/features/file-discovery">Learn about file discovery</LinkWithArrow>
                        <LinkWithArrow href="/docs/implementation-plans">Review implementation plans</LinkWithArrow>
                      </div>
                    </div>
                  </div>
                </GlassCard>
              </div>

              <div className="space-y-8">
                <h2 className="text-2xl sm:text-3xl font-bold text-center">Where Codex teams rely on PlanToCode</h2>
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
                <h2 className="text-2xl sm:text-3xl font-bold text-center">Outcomes Codex teams look for</h2>
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
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">Pre-plan Codex CLI execution with architectural context</h2>
                  <p className="text-lg text-foreground/80 mb-8">
                    Discover the real scope, merge multi-model ideas, then execute with Codex approval modes for safe, reviewable iteration.
                  </p>
                  <PlatformDownloadSection location="plan_mode_codex" />
                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                    <LinkWithArrow href="/demo">Watch the interactive demo</LinkWithArrow>
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
