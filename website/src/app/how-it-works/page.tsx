import { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import Link from 'next/link';
import {
  FileSearch,
  GitMerge,
  Code2,
  Terminal,
  Play,
  Edit3,
  CheckCircle2,
  Brain,
  Sparkles,
  Zap,
  Target,
  Video,
  Mic,
  FileText
} from 'lucide-react';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'How It Works - AI planning workflow | Vibe Manager',
  description: 'Step-by-step workflow: surface the right files, generate implementation plans from configured models, edit in the Monaco workspace, and execute through the integrated terminal.',
  keywords: [
    'ai workflow',
    'implementation plan workflow',
    'monaco editor ai',
    'merge ai plans',
    'ai terminal execution',
    'claude code workflow',
    'codex cli workflow',
    'ai plan editing',
    'multi model ai planning',
    'professional ai tools',
    'staff engineer tools',
    'ai architect studio',
    'plan merge instructions',
    'integrated terminal ai',
  ],
  openGraph: {
    title: 'How It Works - Professional AI Planning Workflow',
    description: 'Generate → Edit → Merge → Execute. The complete workflow for professional AI-assisted development. Monaco editor, multi-model planning, integrated terminal.',
    url: 'https://www.vibemanager.app/how-it-works',
    siteName: 'Vibe Manager',
    type: 'website',
  },
  alternates: {
    canonical: 'https://www.vibemanager.app/how-it-works',
  },
};

export default function HowItWorksPage() {
  const workflowSteps = [
    {
      step: 1,
      title: "Describe Your Task",
      subtitle: "Multiple input methods for maximum efficiency",
      icon: <FileText className="w-6 h-6" />,
      description: "Start with natural language description of what you want to build or fix, then highlight the draft to refine it before moving on.",
      methods: [
        {
          icon: <Edit3 className="w-5 h-5" />,
          title: "AI-Enhanced Text",
          description: "Highlight any draft and press the Sparkles popover. The text-improvement job uses Claude Sonnet 4 or Gemini 2.5 Flash to rewrite the selection without touching formatting."
        },
        {
          icon: <Mic className="w-5 h-5" />,
          title: "Voice Dictation",
          description: "Speak your requirements naturally. Transcripts land in the editor with project defaults so you can run the same improvement popover immediately."
        },
        {
          icon: <Video className="w-5 h-5" />,
          title: "Screen Recording",
          description: "Record bugs, workflows, or visual context. Gemini 2.5 Pro analyzes recordings, and the resulting notes can be refined with the text improvement flow before planning."
        }
      ]
    },
    {
      step: 2,
      title: "Intelligent File Discovery",
      subtitle: "AI finds the true impact surface",
      icon: <FileSearch className="w-6 h-6" />,
      description: "From thousands of files, AI identifies the exact files you need to touch.",
      features: [
        "Pattern groups generated per workflow stage",
        "Regex filters and exclusions ready to apply",
        "Relevance scoring before you commit to a selection",
        "Undo/redo history for file picks",
        "Support for external file metadata"
      ]
    },
    {
      step: 3,
      title: "Multi-Model Plan Generation",
      subtitle: "Council of LLMs for better solutions",
      icon: <Brain className="w-6 h-6" />,
      description: "Generate multiple implementation approaches from different AI models simultaneously.",
      models: [
        "OpenAI GPT-5",
        "Anthropic Claude 4 Sonnet",
        "Google Gemini 2.5 Pro",
        "OpenAI o3 / o4 Mini",
        "xAI Grok 4",
        "DeepSeek R1 & Moonshot Kimi K2"
      ]
    },
    {
      step: 4,
      title: "Edit in Monaco Editor",
      subtitle: "Real IDE for implementation plans",
      icon: <Code2 className="w-6 h-6" />,
      description: "Full VS Code editor for AI-generated plans. Not a chat interface - a professional editing experience.",
      capabilities: [
        "Syntax highlighting inside Monaco",
        "Prompt preview & copy buttons",
        "Token estimation with context warnings",
        "Auto-save with change tracking",
        "Copy individual steps",
        "Reorder and restructure plans"
      ]
    },
    {
      step: 5,
      title: "Merge with Instructions",
      subtitle: "Combine the best approaches your way",
      icon: <GitMerge className="w-6 h-6" />,
      description: "Specify exactly how to merge multiple plans. Floating instruction panel stays visible while reviewing.",
      examples: [
        "\"Use Plan 2's error handling with Plan 3's architecture\"",
        "\"Take the database approach from Plan 1, API design from Plan 3\"",
        "\"Combine the testing strategy from Plan 2 with execution steps from Plan 4\"",
        "\"Use Plan 1's file structure with Plan 2's implementation details\""
      ]
    },
    {
      step: 6,
      title: "Execute in Integrated Terminal",
      subtitle: "From plan to reality without context switching",
      icon: <Terminal className="w-6 h-6" />,
      description: "Run your perfected plan immediately. Integrated terminal with persistent sessions.",
      tools: [
        "Claude Code CLI",
        "Cursor CLI",
        "OpenAI Codex CLI",
        "Gemini CLI",
        "Voice transcription inside the terminal",
        "Persistent terminal log with auto-recovery"
      ]
    }
  ];

  const keyFeatures = [
    {
      icon: <Target className="w-8 h-8" />,
      title: "Professional Control",
      description: "Generate multiple approaches, merge with your rules, edit before execution. Not a black box."
    },
    {
      icon: <Zap className="w-8 h-8" />,
      title: "Persistent Sessions",
      description: "Terminal output is stored locally and sessions restore on launch. Close the app, come back next week, continue debugging."
    },
    {
      icon: <Sparkles className="w-8 h-8" />,
      title: "Deploy on your terms",
      description: "Use the included Rust proxy server with your own API keys when you need to keep requests on infrastructure you control."
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
                  <span>Professional AI Planning Workflow</span>
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  How It Works
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-4xl mx-auto leading-relaxed">
                  From idea to implementation: Generate plans from multiple AI models, edit in Monaco editor,
                  merge with custom instructions, execute in integrated terminal. Built for engineers who need control.
                </p>
              </div>


              {/* Workflow Steps */}
              <div className="mb-20">
                <h2 className="text-2xl sm:text-3xl font-bold mb-12 text-center">The Complete Workflow</h2>

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
                                {step.models.map((model, idx) => (
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
                                {step.examples.map((example, idx) => (
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
                          </div>
                        </div>
                      </GlassCard>
                    </div>
                  ))}
                </div>
              </div>


              {/* Key Features */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Why This Workflow Works</h2>

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
              </div>

              {/* Use Cases */}
              <div className="mb-16">
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Perfect For</h2>

                <div className="grid md:grid-cols-2 gap-8">
                  <GlassCard className="p-8">
                    <h3 className="text-xl font-bold mb-4">Large Feature Development</h3>
                    <p className="text-foreground/80 mb-4">
                      Multi-file features that require careful planning. Generate multiple approaches,
                      merge the best parts, edit for your specific codebase.
                    </p>
                    <ul className="space-y-2 text-foreground/70">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                        <span>Cross-component feature implementation</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                        <span>API design and integration</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                        <span>Database schema changes</span>
                      </li>
                    </ul>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <h3 className="text-xl font-bold mb-4">Complex Bug Investigation</h3>
                    <p className="text-foreground/80 mb-4">
                      Record screen captures of bugs, get AI analysis, generate debugging plans,
                      execute with full terminal control.
                    </p>
                    <ul className="space-y-2 text-foreground/70">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                        <span>Visual context with screen recording</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                        <span>Systematic debugging approaches</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                        <span>Persistent terminal log</span>
                      </li>
                    </ul>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <h3 className="text-xl font-bold mb-4">Legacy Codebase Maintenance</h3>
                    <p className="text-foreground/80 mb-4">
                      AI understands legacy patterns and technical debt. Generate safe refactoring
                      plans, library upgrades, and architectural improvements.
                    </p>
                    <ul className="space-y-2 text-foreground/70">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                        <span>Dependency upgrade strategies</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                        <span>Breaking change migration plans</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                        <span>Technical debt cleanup</span>
                      </li>
                    </ul>
                  </GlassCard>

                  <GlassCard className="p-8">
                    <h3 className="text-xl font-bold mb-4">Professional Development</h3>
                    <p className="text-foreground/80 mb-4">
                      Command approvals, session retention, single-tenant deployment.
                      Built for teams where one wrong command costs millions.
                    </p>
                    <ul className="space-y-2 text-foreground/70">
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                        <span>Terminal governance and approvals</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                        <span>Complete audit trails</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 mt-1 flex-shrink-0 text-primary" />
                        <span>On-premise deployment options</span>
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
                    <h2 className="text-2xl font-bold">See It In Action</h2>
                  </div>
                  <p className="text-foreground/70 mb-6">
                    Watch the interactive demo to see the complete workflow
                  </p>
                  <Button variant="cta" size="lg" asChild>
                    <Link href="/demo">
                      Try Interactive Demo
                    </Link>
                  </Button>
                </GlassCard>
              </div>

              {/* CTA */}
              <div className="text-center">
                <GlassCard className="p-8 sm:p-12 max-w-4xl mx-auto" highlighted>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">Ready to Transform Your Development Workflow?</h2>
                  <p className="text-lg text-foreground/80 mb-8 max-w-3xl mx-auto">
                    Stop accepting AI's first draft. Generate multiple approaches, merge with your rules,
                    edit in a real IDE, execute with professional tools. Built by engineers for engineers.
                  </p>

                  <PlatformDownloadSection location="how_it_works" />

                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm text-foreground/60">
                    <LinkWithArrow href="/demo">
                      Try interactive demo
                    </LinkWithArrow>
                    <span className="hidden sm:inline">•</span>
                    <LinkWithArrow href="/features/plan-mode">
                      Learn about plan editing
                    </LinkWithArrow>
                    <span className="hidden sm:inline">•</span>
                    <LinkWithArrow href="/docs">
                      View documentation
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