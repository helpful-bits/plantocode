import type { Metadata } from 'next';
import { Header } from '@/components/landing/Header';
import { Globe } from 'lucide-react';
import Reveal from '@/components/motion/Reveal';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Up-to-date answers for your stack | Vibe Manager',
  description: 'Search docs and issues, tie findings back to your code.',
  keywords: [
    'deep research',
    'documentation search',
    'up-to-date answers',
    'code documentation',
    'issue search',
    'knowledge gaps',
    'AI coding assistant',
  ],
};

export default function DeepResearchPage() {
  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent">
        <Header />
        
        <main className="flex-grow">
          <section className="relative py-20 sm:py-24">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
              <Reveal as="div" className="mb-6">
                <Globe className="w-16 h-16 mx-auto mb-6 text-primary" />
              </Reveal>
              
              <Reveal as="h1" className="text-4xl sm:text-5xl font-bold mb-6 text-foreground">
                Up-to-date answers for your stack
              </Reveal>
              
              <Reveal className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                Search docs and issues, tie findings back to your code.
              </Reveal>

              <div className="grid md:grid-cols-2 gap-8 mt-12 text-left">
                <Reveal className="space-y-4">
                  <h3 className="text-2xl font-semibold text-foreground">Current Documentation</h3>
                  <p className="text-muted-foreground">
                    Your LLM's knowledge is frozen in time. Deep Research fixes that by 
                    searching for the latest documentation, APIs, and best practices 
                    for your specific stack.
                  </p>
                </Reveal>

                <Reveal className="space-y-4" delay={0.1}>
                  <h3 className="text-2xl font-semibold text-foreground">Context Integration</h3>
                  <p className="text-muted-foreground">
                    Don't just get generic answers. Deep Research ties external findings 
                    directly back to your codebase context, ensuring recommendations 
                    fit your specific implementation.
                  </p>
                </Reveal>

                <Reveal className="space-y-4" delay={0.2}>
                  <h3 className="text-2xl font-semibold text-foreground">Knowledge Gap Filling</h3>
                  <p className="text-muted-foreground">
                    Identify what your AI doesn't know and fill those gaps with 
                    up-to-the-minute information. No more outdated solutions or 
                    deprecated API recommendations.
                  </p>
                </Reveal>

                <Reveal className="space-y-4" delay={0.3}>
                  <h3 className="text-2xl font-semibold text-foreground">Issue Tracking</h3>
                  <p className="text-muted-foreground">
                    Search through GitHub issues, Stack Overflow, and documentation 
                    to find solutions to problems specific to your implementation challenges.
                  </p>
                </Reveal>
              </div>

              <Reveal className="mt-12" delay={0.4}>
                <Button asChild size="xl" variant="cta">
                  <Link href="/download">
                    Try Deep Research
                  </Link>
                </Button>
              </Reveal>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}