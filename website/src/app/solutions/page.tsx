import { Metadata } from 'next';
import { Header } from '@/components/landing/Header';
import { GlassCard } from '@/components/ui/GlassCard';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import {
  AlertTriangle, Boxes, Wrench, Library, Code2, FileWarning, Shield, Cog
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'PlanToCode Solutions - AI Development Workflows',
  description: 'Solve complex development challenges: hard bugs, large features, library upgrades, legacy refactoring, and more with AI-powered planning.',
  openGraph: {
    title: 'PlanToCode Solutions - AI Development Workflows',
    description: 'AI-powered solutions for complex development challenges.',
    url: 'https://www.plantocode.com/solutions',
  },
  alternates: {
    canonical: 'https://www.plantocode.com/solutions',
  },
};

const solutions = [
  {
    slug: '/solutions/hard-bugs',
    title: 'Resolve Hard Bugs',
    description: 'Capture plan history, terminal logs, and transcripts for reproducible bug investigation',
    icon: AlertTriangle,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    category: 'Debugging'
  },
  {
    slug: '/solutions/large-features',
    title: 'Large Features',
    description: 'Plan and track multi-file features with dependency mapping and step-by-step execution',
    icon: Boxes,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    category: 'Development'
  },
  {
    slug: '/solutions/library-upgrades',
    title: 'Library Upgrades',
    description: 'Safely upgrade dependencies with impact analysis and comprehensive testing',
    icon: Library,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    category: 'Maintenance'
  },
  {
    slug: '/solutions/maintenance-enhancements',
    title: 'Maintenance & Enhancements',
    description: 'Document ongoing tasks with audit trails and prevent regressions',
    icon: Wrench,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
    category: 'Maintenance'
  },
  {
    slug: '/solutions/legacy-code-refactoring',
    title: 'Legacy Code Refactoring',
    description: 'AI-powered planning for safe modernization of legacy codebases',
    icon: Code2,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    category: 'Refactoring'
  },
  {
    slug: '/solutions/prevent-duplicate-files',
    title: 'Prevent Duplicate Files',
    description: 'Stop AI from creating duplicate files with pre-execution file discovery',
    icon: FileWarning,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
    category: 'Safety'
  },
  {
    slug: '/solutions/ai-wrong-paths',
    title: 'Prevent Wrong Paths',
    description: 'Review AI-generated paths before execution to prevent file location errors',
    icon: Shield,
    color: 'text-cyan-500',
    bgColor: 'bg-cyan-500/10',
    category: 'Safety'
  },
  {
    slug: '/solutions/safe-refactoring',
    title: 'Safe Refactoring',
    description: 'AI-powered planning for risk-free code changes with dependency visibility',
    icon: Cog,
    color: 'text-indigo-500',
    bgColor: 'bg-indigo-500/10',
    category: 'Refactoring'
  }
];

export default function SolutionsHubPage() {
  // Group solutions by category
  const categories = solutions.reduce((acc, solution) => {
    const category = solution.category;
    if (!acc[category]) acc[category] = [];
    acc[category].push(solution);
    return acc;
  }, {} as Record<string, typeof solutions>);

  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />

        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 px-4">
            <div className="container mx-auto max-w-6xl">
              <Breadcrumbs items={[{ label: 'Solutions' }]} />

              <header className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6 text-sm font-medium">
                  <Code2 className="w-4 h-4" />
                  <span>Development Solutions</span>
                </div>
                <h1 className="text-4xl sm:text-5xl font-bold mb-6">
                  AI-Powered Development Solutions
                </h1>
                <p className="text-lg text-foreground/80 max-w-3xl mx-auto">
                  Tackle complex development challenges with AI-powered planning. From debugging hard bugs
                  to refactoring legacy code, PlanToCode provides the safety layer your team needs.
                </p>
              </header>

              {/* Solutions by Category */}
              {Object.entries(categories).map(([category, items]) => (
                <div key={category} className="mb-16">
                  <h2 className="text-2xl font-bold mb-6">{category}</h2>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {items.map((solution) => {
                      const Icon = solution.icon;
                      return (
                        <GlassCard key={solution.slug} className="p-6 flex flex-col hover:shadow-lg transition-shadow">
                          <div className={`w-12 h-12 rounded-lg ${solution.bgColor} flex items-center justify-center mb-4`}>
                            <Icon className={`w-6 h-6 ${solution.color}`} />
                          </div>

                          <h3 className="font-semibold mb-2 text-lg">
                            {solution.title}
                          </h3>

                          <p className="text-sm text-foreground/70 mb-4 flex-grow">
                            {solution.description}
                          </p>

                          <LinkWithArrow href={solution.slug} className="text-sm mt-auto">
                            View solution
                          </LinkWithArrow>
                        </GlassCard>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Bottom CTA */}
              <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto text-center" highlighted>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                  Ready to Solve Your Development Challenges?
                </h2>
                <p className="text-lg text-foreground/80 mb-8">
                  Start planning complex changes with confidence. Download PlanToCode today.
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
