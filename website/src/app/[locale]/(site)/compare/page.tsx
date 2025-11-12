import type { Metadata } from 'next';
import { Link } from '@/i18n/navigation';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { locales } from '@/i18n/config';
import { loadMessages, type Locale } from '@/lib/i18n';
import { Code2, Zap, Terminal } from 'lucide-react';
import { generatePageMetadata, COMMON_KEYWORDS, mergeKeywords } from '@/content/metadata';

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return {
    ...generatePageMetadata({
      locale,
      slug: '/compare',
      title: t['compare.meta.title'],
      description: t['compare.meta.description'],
    }),
    keywords: mergeKeywords(
      [
    'ai coding tool comparison',
    'cursor alternative',
    'windsurf alternative',
    'claude code comparison',
    'aider alternative',
    'ai code editor comparison',
  ],
      COMMON_KEYWORDS.core
    ),
  };
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

const comparisons = [
  {
    title: 'Cursor vs Windsurf',
    description: 'Compare Cursor and Windsurf AI code editors for preventing duplicate files and implementation planning.',
    href: '/compare/cursor-vs-windsurf',
    icon: <Code2 className="w-6 h-6" />,
  },
  {
    title: 'PlanToCode vs Cursor Agents',
    description: 'How PlanToCode complements Cursor with pre-planning and file discovery.',
    href: '/compare/plantocode-vs-cursor-agents',
    icon: <Zap className="w-6 h-6" />,
  },
  {
    title: 'PlanToCode vs Claude Code',
    description: 'Architectural planning workflow before Claude Code execution.',
    href: '/compare/plantocode-vs-claude-code-standalone',
    icon: <Terminal className="w-6 h-6" />,
  },
  {
    title: 'PlanToCode vs Aider',
    description: 'Compare AI-powered code planning and execution approaches.',
    href: '/compare/plantocode-vs-aider',
    icon: <Code2 className="w-6 h-6" />,
  },
  {
    title: 'PlanToCode vs GitHub Copilot CLI',
    description: 'Planning-first vs execution-first AI coding workflows.',
    href: '/compare/plantocode-vs-github-copilot-cli',
    icon: <Terminal className="w-6 h-6" />,
  },
  {
    title: 'PlanToCode vs Warp AI Terminal',
    description: 'Full planning workspace vs AI-enhanced terminal.',
    href: '/compare/plantocode-vs-warp-ai-terminal',
    icon: <Terminal className="w-6 h-6" />,
  },
  {
    title: 'PlanToCode vs Raycast AI',
    description: 'Dedicated planning tool vs productivity launcher with AI.',
    href: '/compare/plantocode-vs-raycast-ai',
    icon: <Zap className="w-6 h-6" />,
  },
  {
    title: 'PlanToCode vs VS Code Tasks',
    description: 'AI-powered planning vs manual task management.',
    href: '/compare/plantocode-vs-vscode-tasks',
    icon: <Code2 className="w-6 h-6" />,
  },
  {
    title: 'PlanToCode vs tmux + Asciinema',
    description: 'Modern planning workspace vs traditional terminal recording.',
    href: '/compare/plantocode-vs-tmux-script-asciinema',
    icon: <Terminal className="w-6 h-6" />,
  },
];

export default async function ComparePage({ params }: { params: Promise<{ locale: Locale }> }) {
  await params;

  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent">
        <Header />
        <main className="container mx-auto px-4 py-16 max-w-6xl">
          <div className="text-center mb-12">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
              Compare AI Coding Tools
            </h1>
            <p className="text-lg text-foreground/80 max-w-3xl mx-auto">
              Find the right AI coding assistant for your workflow. Compare features, approaches, and use cases.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {comparisons.map((comparison, i) => (
              <Link key={i} href={comparison.href}>
                <GlassCard className="p-6 h-full hover:border-primary/50 transition-colors cursor-pointer" highlighted>
                  <div className="flex items-start gap-3 mb-3">
                    <div className="text-primary mt-1">{comparison.icon}</div>
                    <h2 className="font-semibold text-lg">{comparison.title}</h2>
                  </div>
                  <p className="text-sm text-foreground/70 leading-relaxed">
                    {comparison.description}
                  </p>
                </GlassCard>
              </Link>
            ))}
          </div>

          <div className="text-center">
            <GlassCard className="p-8 max-w-3xl mx-auto">
              <h2 className="text-2xl font-bold mb-4">Not Sure Which Tool to Use?</h2>
              <p className="text-foreground/80 mb-6">
                Every AI coding tool has different strengths. We can help you find the right fit for your team.
              </p>
              <Link
                href="/schedule"
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
              >
                Schedule a Demo
              </Link>
            </GlassCard>
          </div>
        </main>
      </div>
    </>
  );
}
