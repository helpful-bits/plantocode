import { Metadata } from 'next';
import { Header } from '@/components/landing/Header';
import { GlassCard } from '@/components/ui/GlassCard';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import {
  FileSearch, Brain, Mic, Video, Copy, GitMerge, MessageSquare, Terminal, Zap
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'PlanToCode Features - AI Development Planning Tools',
  description: 'Explore powerful features: file discovery, multi-model planning, voice transcription, video analysis, merge instructions, and integrated terminal execution.',
  openGraph: {
    title: 'PlanToCode Features - AI Development Planning Tools',
    description: 'Comprehensive AI development features for large codebases.',
    url: 'https://www.plantocode.com/features',
  },
  alternates: {
    canonical: 'https://www.plantocode.com/features',
  },
};

const features = [
  {
    slug: '/features/file-discovery',
    title: 'AI File Discovery',
    description: 'Intelligent multi-stage workflow that discovers and selects relevant files from your codebase',
    icon: FileSearch,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10'
  },
  {
    slug: '/features/plan-mode',
    title: 'Implementation Plans',
    description: 'Generate file-by-file implementation plans with AI. Review and approve every change before execution',
    icon: Brain,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10'
  },
  {
    slug: '/features/voice-transcription',
    title: 'Voice to Text',
    description: 'Capture specifications hands-free with voice transcription in multiple languages',
    icon: Mic,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10'
  },
  {
    slug: '/features/video-analysis',
    title: 'Meeting & Recording Analysis',
    description: 'Multimodal AI analyzes audio and visual content to extract actionable requirements',
    icon: Video,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10'
  },
  {
    slug: '/features/text-improvement',
    title: 'Specification Capture Mode',
    description: 'Refine specifications with AI text enhancement and task refinement prompts',
    icon: MessageSquare,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10'
  },
  {
    slug: '/features/merge-instructions',
    title: 'Architectural Plan Synthesis',
    description: 'AI analyzes multiple implementation plans, resolves conflicts, creates emergent solutions',
    icon: GitMerge,
    color: 'text-indigo-500',
    bgColor: 'bg-indigo-500/10'
  },
  {
    slug: '/features/deep-research',
    title: 'Deep Research',
    description: 'AI-powered research with sophisticated queries and parallel research tasks',
    icon: Zap,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10'
  },
  {
    slug: '/features/integrated-terminal',
    title: 'Integrated Terminal',
    description: 'Persistent terminal sessions with health monitoring and command review',
    icon: Terminal,
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-500/10'
  },
  {
    slug: '/features/copy-buttons',
    title: 'Copy Buttons',
    description: 'Transform any prompt into a reusable button with smart placeholders and drag-drop',
    icon: Copy,
    color: 'text-pink-500',
    bgColor: 'bg-pink-500/10'
  }
];

export default function FeaturesHubPage() {
  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />

        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 px-4">
            <div className="container mx-auto max-w-6xl">
              <Breadcrumbs items={[{ label: 'Features' }]} />

              <header className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6 text-sm font-medium">
                  <Zap className="w-4 h-4" />
                  <span>Powerful Features</span>
                </div>
                <h1 className="text-4xl sm:text-5xl font-bold mb-6">
                  AI Development Planning Features
                </h1>
                <p className="text-lg text-foreground/80 max-w-3xl mx-auto">
                  Comprehensive tools for planning, reviewing, and executing complex code changes.
                  From file discovery to terminal execution, everything you need for safe AI-assisted development.
                </p>
              </header>

              {/* Features Grid */}
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
                {features.map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <GlassCard key={feature.slug} className="p-6 flex flex-col hover:shadow-lg transition-shadow">
                      <div className={`w-12 h-12 rounded-lg ${feature.bgColor} flex items-center justify-center mb-4`}>
                        <Icon className={`w-6 h-6 ${feature.color}`} />
                      </div>

                      <h3 className="font-semibold mb-2 text-lg">
                        {feature.title}
                      </h3>

                      <p className="text-sm text-foreground/70 mb-4 flex-grow">
                        {feature.description}
                      </p>

                      <LinkWithArrow href={feature.slug} className="text-sm mt-auto">
                        Learn more
                      </LinkWithArrow>
                    </GlassCard>
                  );
                })}
              </div>

              {/* Bottom CTA */}
              <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto text-center" highlighted>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                  Ready to Experience Safe AI Development?
                </h2>
                <p className="text-lg text-foreground/80 mb-8">
                  Download PlanToCode and start planning your code changes with confidence.
                </p>
                <LinkWithArrow href="/downloads" className="text-lg">
                  Download PlanToCode
                </LinkWithArrow>
              </GlassCard>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
