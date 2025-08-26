import type { Metadata } from 'next';
import { Header } from '@/components/landing/Header';
import { Search } from 'lucide-react';
import Reveal from '@/components/motion/Reveal';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { StructuredData } from '@/components/seo/StructuredData';
import type { BreadcrumbList } from 'schema-dts';

export const metadata: Metadata = {
  title: 'Find the exact files to change | Vibe Manager',
  description: 'Decompose tasks, search smart patterns, and rank files by actual content.',
  keywords: [
    'file finder',
    'code search',
    'relevant files',
    'task decomposition',
    'smart search patterns',
    'file ranking',
    'AI coding assistant',
  ],
};

export default function FileFinderPage() {
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
        name: 'File Finder',
        item: 'https://www.vibemanager.app/file-finder'
      }
    ]
  };

  return (
    <>
      <StructuredData data={breadcrumbJsonLd} />
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent">
        <Header />
        
        <main className="flex-grow">
          <section className="relative py-20 sm:py-24">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
              <Reveal as="div" className="mb-6">
                <Search className="w-16 h-16 mx-auto mb-6 text-primary" />
              </Reveal>
              
              <Reveal as="h1" className="text-4xl sm:text-5xl font-bold mb-6 text-foreground">
                Find the exact files to change
              </Reveal>
              
              <Reveal className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                4-stage workflow: decompose tasks into logical areas, create targeted search patterns, then AI assesses actual file content for relevance. No vector databases.
              </Reveal>

              <div className="grid md:grid-cols-2 gap-8 mt-12 text-left">
                <Reveal className="space-y-4">
                  <h3 className="text-2xl font-semibold text-foreground">Pattern Groups Generation</h3>
                  <p className="text-muted-foreground">
                    Creates focused pattern groups targeting specific functionality areas. Each group uses precise path patterns and content patterns with targeted exclusions to find exactly what's needed.
                  </p>
                </Reveal>

                <Reveal className="space-y-4" delay={0.1}>
                  <h3 className="text-2xl font-semibold text-foreground">AI Relevance Assessment</h3>
                  <p className="text-muted-foreground">
                    Files are scored by actual content analysis, not just filenames or keyword matches. 
                    Quality over quantity - be conservative and selective with file inclusion for cost efficiency.
                  </p>
                </Reveal>

                <Reveal className="space-y-4" delay={0.2}>
                  <h3 className="text-2xl font-semibold text-foreground">Cost-Optimized Selection</h3>
                  <p className="text-muted-foreground">
                    Focuses on files that will need direct modification (typically 3-10 files). 
                    Each extra file increases inference cost, so it favors brevity while safeguarding completeness.
                  </p>
                </Reveal>

                <Reveal className="space-y-4" delay={0.3}>
                  <h3 className="text-2xl font-semibold text-foreground">Priority-Based Ordering</h3>
                  <p className="text-muted-foreground">
                    Returns files ordered by implementation priority - highest-impact files first (entry points, shared data models, core logic), then adds paths only when essential for completeness.
                  </p>
                </Reveal>
              </div>

              <Reveal className="mt-12" delay={0.4}>
                <Button asChild size="xl" variant="cta">
                  <Link href="/download">
                    Try File Finder
                  </Link>
                </Button>
              </Reveal>

              {/* FAQ Section */}
              <div className="mt-16 max-w-3xl mx-auto">
                <Reveal as="h2" className="text-2xl font-semibold mb-8 text-center">
                  Frequently Asked Questions
                </Reveal>
                <div className="space-y-6">
                  <Reveal className="border border-primary/10 rounded-lg p-6">
                    <h3 className="font-semibold text-foreground mb-2">How is this different from grep or search?</h3>
                    <p className="text-muted-foreground">File Finder uses AI to understand your task context and scores files by actual relevance, not just text matches. It finds implementation-critical files you might miss with traditional search.</p>
                  </Reveal>
                  <Reveal className="border border-primary/10 rounded-lg p-6" delay={0.1}>
                    <h3 className="font-semibold text-foreground mb-2">Does it work with large codebases?</h3>
                    <p className="text-muted-foreground">Yes, it's specifically designed for large codebases where manual file discovery becomes impossible. The AI assessment scales efficiently across thousands of files.</p>
                  </Reveal>
                  <Reveal className="border border-primary/10 rounded-lg p-6" delay={0.2}>
                    <h3 className="font-semibold text-foreground mb-2">What if it misses important files?</h3>
                    <p className="text-muted-foreground">File Finder can expand its search scope dynamically and includes dependency analysis. You can also refine search patterns based on initial results.</p>
                  </Reveal>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}