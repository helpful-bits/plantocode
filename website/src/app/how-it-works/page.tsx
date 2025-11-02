import { Metadata } from 'next';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { PlatformDownloadSection } from '@/components/ui/PlatformDownloadSection';
import Link from 'next/link';
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
import { cdnUrl } from '@/lib/cdn';

export const metadata: Metadata = {
  title: 'How It Works - AI Planning Workflow',
  description: 'AI implementation planning prevents chaos. File discovery, multi-model plans, human review, and safe execution with any coding agent.',
  keywords: [
    'implementation plan',
    'ai code planning',
    'safe refactoring',
    'prevent duplicate files',
    'cursor alternative',
    'corporate ai workflow',
    'requirements to implementation',
    'meeting to code',
    'human in the loop workflow',
    'safe ai development',
    'specification capture workflow',
    'enterprise ai development',
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
    title: 'How It Works - Corporate AI Development Workflow',
    description: 'End-to-end workflow: capture requirements from meetings and voice, refine into actionable specifications, generate granular implementation plans, review with human-in-the-loop governance, and execute safely. Built for corporate teams managing legacy codebases.',
    url: 'https://www.plantocode.com/how-it-works',
    siteName: 'PlanToCode',
    type: 'website',
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
  },
  alternates: {
    canonical: 'https://www.plantocode.com/how-it-works',
    languages: {
      'en-US': 'https://www.plantocode.com/how-it-works',
      'en': 'https://www.plantocode.com/how-it-works',
    },
  },
};

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

export default function HowItWorksPage() {
  const workflowSteps: WorkflowStep[] = [
    {
      step: 1,
      title: "Capture Ideas & Context",
      subtitle: "Meeting recordings, screen captures, and voice dictation",
      icon: <Video className="w-6 h-6" />,
      description: "Start by capturing initial requirements from multiple sources. Upload Microsoft Teams meeting recordings for multimodal analysis, record screen presentations to capture visual context, or use voice dictation for rapid idea capture. All input methods feed into the same refinement workflow.",
      methods: [
        {
          icon: <Video className="w-5 h-5" />,
          title: "Meeting Recordings",
          description: "Upload Teams meetings. Multimodal AI analyzes audio transcripts (with speaker identification) and visual content (shared screens, documents) to extract requirements, decisions, and action items."
        },
        {
          icon: <Camera className="w-5 h-5" />,
          title: "Screen Recordings",
          description: "Record workflows, bugs, or UI presentations. Gemini Vision analyzes both audio narration and visual content to capture complete context for requirements gathering."
        },
        {
          icon: <Mic className="w-5 h-5" />,
          title: "Voice Dictation",
          description: "Speak requirements naturally. OpenAI Whisper transcribes with smart text insertion and speaker identification for rapid specification capture."
        }
      ],
      learnMoreLinks: [
        { href: "/features/video-analysis", text: "Learn about meeting analysis" },
        { href: "/features/voice-transcription", text: "Learn about voice transcription" }
      ]
    },
    {
      step: 2,
      title: "Refine into Actionable Specifications",
      subtitle: "Two AI prompt types for clarity and completeness",
      icon: <Sparkles className="w-6 h-6" />,
      description: "Transform raw meeting transcripts, voice recordings, and rough notes into clear, implementation-ready specifications using two distinct AI prompt types that work together to ensure both clarity and completeness.",
      promptTypes: [
        {
          icon: <Edit3 className="w-5 h-5" />,
          title: "Text Enhancement",
          description: "Improves grammar, sentence structure, clarity, and conciseness while maintaining your original intent, tone, and technical detail level. Perfect for polishing voice transcripts and meeting notes."
        },
        {
          icon: <Target className="w-5 h-5" />,
          title: "Task Refinement",
          description: "Expands task descriptions by identifying implied requirements, filling in overlooked gaps, clarifying expected behavior and edge cases, and adding technical considerations for implementation readiness."
        }
      ],
      learnMoreLinks: [
        { href: "/features/text-improvement", text: "Learn about Specification Capture Mode" }
      ]
    },
    {
      step: 3,
      title: "Generate Granular Implementation Plans",
      subtitle: "File-by-file plans with exact repository paths",
      icon: <FileText className="w-6 h-6" />,
      description: "AI file discovery identifies relevant files across your codebase. Multiple AI models generate implementation plans with file-by-file granularity—exact file paths, specific line ranges, and clear operation types (modify/create/delete). This granularity makes impact assessment crystal clear.",
      features: [
        "Exact file paths from your repository structure",
        "Specific line ranges and modification details",
        "Clear operation types (modify, create, delete)",
        "Dependency analysis and impact assessment",
        "Multiple plan generation for approach comparison",
        "Multi-model support (GPT-5, Claude 4, Gemini 2.5 Pro)"
      ],
      learnMoreLinks: [
        { href: "/features/file-discovery", text: "Learn about AI file discovery" },
        { href: "/features/plan-mode", text: "Learn about plan generation" }
      ]
    },
    {
      step: 4,
      title: "Review, Edit & Approve (Human-in-the-Loop)",
      subtitle: "Full control before any code changes",
      icon: <Code2 className="w-6 h-6" />,
      description: "Plans open in Monaco editor for comprehensive review. Team leads examine every proposed change, edit steps directly, merge multiple approaches with custom instructions, or reject plans entirely. No code changes occur without explicit human approval—ensuring alignment with corporate requirements and team workflows.",
      capabilities: [
        "Professional Monaco editor with syntax highlighting",
        "Direct editing of all plan steps and details",
        "Merge multiple plans with custom instructions",
        "Request modifications or alternative approaches",
        "Approve for execution or reject with audit trail",
        "Complete visibility into proposed changes"
      ],
      learnMoreLinks: [
        { href: "/features/plan-mode", text: "Learn about human-in-the-loop governance" },
        { href: "/features/merge-instructions", text: "Learn about plan merging" }
      ]
    },
    {
      step: 5,
      title: "Execute with Confidence",
      subtitle: "Safe handoff to developers or coding agents",
      icon: <Terminal className="w-6 h-6" />,
      description: "After approval, securely transmit the plan to your chosen coding agent (Claude Code, Cursor, Codex) or assigned software developer. File-by-file granularity prevents regressions and unintended modifications—ensuring safe execution. Integrated terminal with persistent sessions enables immediate execution and debugging.",
      tools: [
        "Claude Code CLI with plan mode support",
        "Cursor CLI integration",
        "OpenAI Codex CLI execution",
        "Integrated terminal with voice transcription",
        "Persistent terminal sessions with auto-recovery",
        "Complete audit trail of execution"
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
      title: "Human-in-the-Loop Governance",
      description: "Review every plan before execution. Edit approaches, merge strategies, approve or reject. AI assists, humans control. Built for teams where code quality matters."
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
                  How it works
                </h1>
                <p className="text-lg sm:text-xl md:text-2xl text-foreground/80 max-w-4xl mx-auto leading-relaxed">
                  From meeting capture to safe execution—the complete corporate AI development workflow
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
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Why Corporate Teams Choose This Workflow</h2>

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
                <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Built for Corporate Development Teams</h2>

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
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">Ready to Transform Your Corporate Development Workflow?</h2>
                  <p className="text-lg text-foreground/80 mb-8 max-w-3xl mx-auto">
                    From meeting capture to safe execution—the complete workflow for corporate teams adopting AI coding agents confidently. Capture requirements from any source, refine with AI, generate granular plans, review with full control, and execute safely.
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