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
  GitMerge,
  ClipboardCheck,
  History,
  Search,
  Layers,
  Sparkles,
  ShieldCheck,
  Compass,
  CheckCircle2,
  Link2,
  Users,
  LayoutDashboard,
  PenTool,
} from 'lucide-react';
import type { SoftwareApplication, HowTo, FAQPage } from 'schema-dts';

export const metadata: Metadata = {
  title: 'Enhance Claude Code Plan Mode | Vibe Manager',
  description:
    'Enhance Claude Code\'s native Plan Mode (Shift+Tab) with multi-model synthesis and file discovery. Vibe Manager adds architectural pre-planning to complement Claude Code CLI\'s built-in planning feature.',
  keywords: [
    'claude code plan mode enhancement',
    'claude code shift+tab planning',
    'claude code multi-model planning',
    'enhance claude code plan mode',
    'claude code file discovery',
    'claude code planning workflow',
    'vibe manager claude code',
  ],
  openGraph: {
    title: 'Enhance Claude Code Plan Mode with Vibe Manager',
    description:
      'Complement Claude Code\'s native Plan Mode with file discovery, multi-model synthesis, and merge instructions for superior architectural planning.',
    url: 'https://www.vibemanager.app/plan-mode/claude-code',
    siteName: 'Vibe Manager',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.vibemanager.app/plan-mode/claude-code',
  },
};

export default function ClaudeCodePlanModePage() {
  const painPoints = [
    {
      title: 'Preparing shareable context is repetitive',
      description:
        'Claude can inspect files, but packaging the right directories and notes for every session usually happens in separate docs.',
      icon: <EyeOff className="w-5 h-5 text-primary" />,
    },
    {
      title: 'Plan Mode limits you to one model',
      description:
        'Claude Code\'s native Plan Mode uses only Claude Sonnet. Comparing strategies from GPT-5, Gemini, and Claude requires manual switching and reconciliation.',
      icon: <GitMerge className="w-5 h-5 text-primary" />,
    },
    {
      title: 'Reusable prompts live outside the workspace',
      description:
        'Teams juggle templates for investigations, implementation, and verification. Keeping them consistent across sessions takes work.',
      icon: <ClipboardCheck className="w-5 h-5 text-primary" />,
    },
    {
      title: 'Terminal history isn\'t structured',
      description:
        'Claude Code CLI logs conversations, but organizing plans, terminal commands, and health checks for audits requires separate tooling.',
      icon: <History className="w-5 h-5 text-primary" />,
    },
  ];

  const capabilities = [
    {
      title: 'Claude-ready file discovery',
      description:
        'Run Vibe\'s multi-stage discovery to surface every file Claude should consider. Export scoped directories straight into Claude plan mode.',
      icon: <Search className="w-8 h-8 text-primary" />,
    },
    {
      title: 'Multi-model plan synthesis',
      description:
        'Run GPT-5 and Gemini multiple times. Each run surfaces implementation details others miss. Merge instructions consolidate complementary insights with full source attribution.',
      icon: <Layers className="w-8 h-8 text-primary" />,
    },
    {
      title: 'Multi-run streaming with real-time progress',
      description:
        'Stream multiple GPT-5 and Gemini runs simultaneously. Each run tackles large context differently, surfacing complementary implementation details with token guardrails.',
      icon: <Sparkles className="w-8 h-8 text-primary" />,
    },
    {
      title: 'Execution guardrails beyond the editor',
      description:
        'Run plans in Vibe\'s persistent terminal, keep searchable logs, and sync the results back to your Claude workspace when you\'re done.',
      icon: <ShieldCheck className="w-8 h-8 text-primary" />,
    },
  ];

  const workflow = [
    {
      step: 'Discover the real project scope',
      description:
        'Point Vibe at your Claude Code workspace. File discovery builds a focused context package you can reuse across sessions.',
      icon: <Compass className="w-5 h-5 text-primary" />,
    },
    {
      step: 'Generate plans with multiple models',
      description:
        'Run GPT-5 and Gemini 2.5 Pro multiple times. When context includes many full files, LLMs miss details—multiple runs surface complementary implementation insights.',
      icon: <Sparkles className="w-5 h-5 text-primary" />,
    },
    {
      step: 'Guide the merge with your expertise',
      description:
        'Tell the merge AI what to emphasize across the runs—certain file patterns, edge cases, or architectural constraints. Consolidate complementary details into one comprehensive plan.',
      icon: <GitMerge className="w-5 h-5 text-primary" />,
    },
    {
      step: 'Execute with Claude Code Plan Mode',
      description:
        'Use the merged plan in Claude Code\'s native Plan Mode (Shift+Tab) or execute directly from Vibe\'s terminal with full approvals and logging.',
      icon: <Terminal className="w-5 h-5 text-primary" />,
    },
  ];

  const comparisons = [
    {
      title: 'Context packaging',
      claude: 'Claude can inspect files interactively, but teams curate and share the important ones manually.',
      vibe: 'File discovery builds a reusable context tree that travels with every session.',
    },
    {
      title: 'Plan flexibility',
      claude: 'Plan mode produces responses sequentially, so reconciling variations takes manual editing.',
      vibe: 'Run models multiple times (3x GPT-5, 2x Gemini). Each run finds complementary details—merged with step-level source attribution.',
    },
    {
      title: 'Execution oversight',
      claude: 'Claude Code logs conversations, but organizing terminal commands and approvals requires extra tooling.',
      vibe: 'Persistent terminal with approvals, health monitoring, and searchable transcripts for complete audit trails.',
    },
  ];

  const quickstartSteps = [
    {
      title: 'Install Vibe Manager alongside Claude Code',
      description:
        'Download the desktop app for macOS or Windows, sign in, and connect it to the same repo you open in Claude.',
    },
    {
      title: 'Run file discovery on your feature or bug',
      description:
        'Generate a scoped list of files and dependencies. Paste it into Claude or keep it inside Vibe for future prompts.',
    },
    {
      title: 'Generate and merge plans',
      description:
        'Create plans with Claude Sonnet and supporting models (GPT-5, Gemini), then merge them using instructions tailored to your architectural requirements.',
    },
    {
      title: 'Use with Claude Code Plan Mode or execute in Vibe',
      description:
        'Feed the merged plan into Claude Code\'s native Plan Mode (Shift+Tab), or run the validated plan directly in Vibe\'s terminal with full auditability.',
    },
  ];

  const useCases = [
    {
      title: 'Large refactors on macOS',
      description:
        'Pair Claude with Vibe\'s discovery and terminal to ship multi-service refactors safely on your Mac.',
      icon: <LayoutDashboard className="w-5 h-5 text-primary" />,
    },
    {
      title: 'Cross-team plan reviews',
      description:
        'Share the merged plan with teammates before it hits Claude. Keep source attribution so reviewers know which model proposed what.',
      icon: <Users className="w-5 h-5 text-primary" />,
    },
    {
      title: 'Plan-first feature development',
      description:
        'Design the architectural plan in Monaco editor, review multi-model insights, then execute in Claude Code CLI with full visibility and checkpointing.',
      icon: <PenTool className="w-5 h-5 text-primary" />,
    },
  ];

  const outcomeHighlights = [
    {
      title: 'Multi-model plans without rework',
      detail: 'Run models multiple times (3x GPT-5, 2x Gemini). Merge instructions consolidate complementary implementation details into a single, comprehensive plan.',
    },
    {
      title: 'Shared context for reviewers',
      detail: 'File discovery and Monaco editing ensure everyone sees the same scoped files before Claude executes anything.',
    },
    {
      title: 'Logged execution for compliance',
      detail: 'Persistent terminals capture the commands and approvals that back each Claude session.',
    },
  ];

  const faqs = [
    {
      question: 'Does Vibe Manager replace Claude Code\'s Plan Mode?',
      answer:
        'No. Claude Code already has Plan Mode (Shift+Tab) built-in. Vibe Manager enhances it by adding multi-model synthesis, file discovery, and merge instructions BEFORE you use Claude Code\'s native planning feature. You get better architectural context going into Plan Mode.',
    },
    {
      question: 'How do I use the merged plan with Claude Code?',
      answer:
        'After merging plans in Vibe Manager, you can either: 1) Feed the context and plan to Claude Code\'s Plan Mode (Shift+Tab) for review before execution, or 2) Execute directly in Vibe\'s terminal with full logging and approvals.',
    },
    {
      question: 'What operating systems are supported?',
      answer:
        'macOS 11+ and Windows 10+. Works great with Claude Code CLI in your native terminal or inside remote dev containers, with full audit trail support.',
    },
  ];

  const softwareApplicationJsonLd: SoftwareApplication = {
    '@type': 'SoftwareApplication',
    name: 'Vibe Manager',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: ['macOS 11.0+', 'Windows 10+'],
    url: 'https://www.vibemanager.app/plan-mode/claude-code',
    description:
      'Enhance Claude Code CLI\'s native Plan Mode with multi-model synthesis, file discovery, and merge instructions for superior architectural planning.',
    offers: {
      '@type': 'Offer',
      price: 0,
      priceCurrency: 'USD',
      description: 'Free desktop app with pay-as-you-go usage and $5 in credits on signup.',
    },
  };

  const howToJsonLd: HowTo = {
    '@type': 'HowTo',
    name: 'Use Vibe Manager with Claude Code plan mode',
    description: 'Prepare and execute Claude Code plans with full architectural context.',
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
                  <span>Claude Code • Enhance native Plan Mode (Shift+Tab)</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  Enhance Claude Code Plan Mode
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                  Claude Code already has Plan Mode (Shift+Tab). Vibe Manager enhances it with multi-model synthesis, file discovery, and merge instructions for superior architectural planning.
                </p>
                <p className="text-base sm:text-lg text-foreground/70 max-w-2xl mx-auto">
                  Pre-plan with multiple models, then use Claude Code's Plan Mode to execute with confidence. Every command and decision stays on record.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Button variant="cta" size="lg" asChild>
                    <Link href="/downloads">Install Vibe Manager</Link>
                  </Button>
                  <VideoButton />
                </div>
                <p className="text-sm text-foreground/60">$5 free credits • Pay-as-you-go • Works with Claude Code on macOS and Windows</p>
              </div>

              <div className="space-y-8">
                <h2 className="text-2xl sm:text-3xl font-bold text-center">Where teams add structure to Claude plan mode</h2>
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
                <h2 className="text-2xl sm:text-3xl font-bold text-center">What Vibe Manager adds to Claude Code</h2>
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
                <h2 className="text-2xl sm:text-3xl font-bold text-center">Claude + Vibe workflow</h2>
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
                  <LinkWithArrow href="/features/merge-instructions">See merge instructions in action</LinkWithArrow>
                </div>
              </div>

              <div className="space-y-6">
                <h2 className="text-2xl sm:text-3xl font-bold text-center">Why teams pair Vibe with Claude Code</h2>
                <div className="space-y-4">
                  {comparisons.map((item, index) => (
                    <GlassCard key={index} className="p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <Link2 className="w-5 h-5 text-primary" />
                        <h3 className="text-lg font-semibold">{item.title}</h3>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-4 text-sm text-foreground/70">
                        <div className="rounded-xl border border-border/40 p-4">
                          <div className="font-semibold text-foreground mb-1">Claude plan mode alone</div>
                          <p className="leading-relaxed">{item.claude}</p>
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
                      <h2 className="text-2xl sm:text-3xl font-bold mb-4">Claude plan mode quickstart</h2>
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
                        <LinkWithArrow href="/large-refactors/claude-code/macos">See Claude refactor workflow</LinkWithArrow>
                        <LinkWithArrow href="/features/plan-mode">Explore the plan editor</LinkWithArrow>
                      </div>
                    </div>
                  </div>
                </GlassCard>
              </div>

              <div className="space-y-8">
                <h2 className="text-2xl sm:text-3xl font-bold text-center">How Claude teams use Vibe Manager</h2>
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
                <h2 className="text-2xl sm:text-3xl font-bold text-center">Outcomes Claude teams prioritise</h2>
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
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">Enhance Claude Code Plan Mode with multi-model intelligence</h2>
                  <p className="text-lg text-foreground/80 mb-8">
                    Discover the right files, merge multi-model architectural plans, then use Claude Code's native Plan Mode (Shift+Tab) with complete context and confidence.
                  </p>
                  <PlatformDownloadSection location="plan_mode_claude_code" />
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
