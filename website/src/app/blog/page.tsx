import { Metadata } from 'next';
import { Header } from '@/components/landing/Header';
import { GlassCard } from '@/components/ui/GlassCard';
import { LinkWithArrow } from '@/components/ui/LinkWithArrow';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { BookOpen } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Blog - AI Code Planning Insights',
  description: 'Learn about AI code planning, development best practices, and how to effectively use AI tools for complex software changes.',
  openGraph: {
    title: 'PlanToCode Blog - AI Development Insights',
    description: 'Insights on AI-powered code planning and development workflows.',
    url: 'https://www.plantocode.com/blog',
  },
  alternates: {
    canonical: 'https://www.plantocode.com/blog',
  },
};

const blogPosts = [
  {
    slug: '/blog/ai-pair-programming-vs-ai-planning',
    title: 'AI Pair Programming vs AI Planning',
    description: 'Understanding the difference between AI pair programming and AI planning approaches to software development.',
    date: '2025',
    category: 'Concepts'
  },
  {
    slug: '/blog/what-is-ai-code-planning',
    title: 'What is AI Code Planning?',
    description: 'An introduction to AI-powered code planning and how it differs from traditional coding assistance.',
    date: '2025',
    category: 'Concepts'
  },
  {
    slug: '/blog/ai-code-planning-best-practices',
    title: 'AI Code Planning Best Practices',
    description: 'Learn best practices for using AI to plan complex code changes effectively and safely.',
    date: '2025',
    category: 'Best Practices'
  },
  {
    slug: '/blog/best-ai-coding-assistants-2025',
    title: 'Best AI Coding Assistants 2025',
    description: 'Compare the best AI coding assistants and planning tools available in 2025.',
    date: '2025',
    category: 'Comparisons'
  },
  {
    slug: '/blog/github-copilot-alternatives-2025',
    title: 'GitHub Copilot Alternatives 2025',
    description: 'Explore alternatives to GitHub Copilot for AI-assisted development and planning.',
    date: '2025',
    category: 'Comparisons'
  }
];

export default function BlogHubPage() {
  // Group by category
  const byCategory = blogPosts.reduce((acc, post) => {
    const category = post.category;
    if (!acc[category]) acc[category] = [];
    acc[category].push(post);
    return acc;
  }, {} as Record<string, typeof blogPosts>);

  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />

        <main className="flex-grow">
          <section className="py-16 sm:py-20 md:py-24 px-4">
            <div className="container mx-auto max-w-6xl">
              <Breadcrumbs items={[{ label: 'Blog' }]} />

              <header className="text-center mb-16">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6 text-sm font-medium">
                  <BookOpen className="w-4 h-4" />
                  <span>Blog & Insights</span>
                </div>
                <h1 className="text-4xl sm:text-5xl font-bold mb-6">
                  AI Code Planning Insights
                </h1>
                <p className="text-lg text-foreground/80 max-w-3xl mx-auto">
                  Learn about AI-powered code planning, development best practices, and how to effectively
                  use AI tools for complex software changes.
                </p>
              </header>

              {/* Blog Posts by Category */}
              {Object.entries(byCategory).map(([category, posts]) => (
                <div key={category} className="mb-16">
                  <h2 className="text-2xl font-bold mb-6">{category}</h2>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {posts.map((post) => (
                      <GlassCard key={post.slug} className="p-6 flex flex-col hover:shadow-lg transition-shadow">
                        <div className="mb-3">
                          <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                            {post.category}
                          </span>
                        </div>

                        <h3 className="font-semibold mb-2 text-lg line-clamp-2">
                          {post.title}
                        </h3>

                        <p className="text-sm text-foreground/70 mb-4 line-clamp-3 flex-grow">
                          {post.description}
                        </p>

                        <LinkWithArrow href={post.slug} className="text-sm mt-auto">
                          Read article
                        </LinkWithArrow>
                      </GlassCard>
                    ))}
                  </div>
                </div>
              ))}

              {/* Bottom CTA */}
              <GlassCard className="p-8 sm:p-12 max-w-3xl mx-auto text-center" highlighted>
                <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                  Ready to Try AI Code Planning?
                </h2>
                <p className="text-lg text-foreground/80 mb-8">
                  Start planning complex changes with confidence. Download PlanToCode today.
                </p>
                <LinkWithArrow href="/downloads" className="text-lg">
                  Download PlanToCode
                </LinkWithArrow>
                <p className="text-sm text-foreground/60 mt-4">
                  $5 free credits • No credit card required
                </p>
              </GlassCard>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
