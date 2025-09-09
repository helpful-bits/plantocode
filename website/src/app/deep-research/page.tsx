import type { Metadata } from 'next';
import { Header } from '@/components/landing/Header';
import { Globe } from 'lucide-react';
import Reveal from '@/components/motion/Reveal';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { StructuredData } from '@/components/seo/StructuredData';
import type { BreadcrumbList } from 'schema-dts';

export const metadata: Metadata = {
  title: 'Deep Research for Developers - Real-Time Documentation AI Search',
  description: 'AI-powered deep research finds current docs, API changes, and solutions for your exact code. Integrates findings with Claude Code, Cursor implementation. 10x faster than manual search.',
  keywords: [
    'vibe code cleanup specialist',
    'deep research',
    'documentation search',
    'up-to-date answers',
    'code documentation',
    'issue search',
    'knowledge gaps',
    'AI coding assistant',
    'real-time documentation',
    'API research',
    'technical research',
  ],
};

export default function DeepResearchPage() {
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
        name: 'Deep Research',
        item: 'https://www.vibemanager.app/deep-research'
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
                <Globe className="w-16 h-16 mx-auto mb-6 text-primary" />
              </Reveal>
              
              <Reveal as="h1" className="text-4xl sm:text-5xl font-bold mb-6 text-foreground">
                Up-to-date answers for your stack
              </Reveal>
              
              <Reveal className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                Web search with strict authoritative source validation. Only official documentation, never Stack Overflow or blogs. Findings tied back to your code context.
              </Reveal>

              <div className="grid md:grid-cols-2 gap-8 mt-12 text-left">
                <Reveal className="space-y-4">
                  <h3 className="text-2xl font-semibold text-foreground">Authoritative Sources Only</h3>
                  <p className="text-muted-foreground">
                    Strict validation protocol ensures only official vendor documentation, 
                    API docs, and verified sources are used. Forbidden: tutorials, Stack Overflow, 
                    blogs, or third-party guides.
                  </p>
                </Reveal>

                <Reveal className="space-y-4" delay={0.1}>
                  <h3 className="text-2xl font-semibold text-foreground">Integration Specialist</h3>
                  <p className="text-muted-foreground">
                    Acts as a Task-Focused Integration & Verification Specialist. 
                    Provides complete working examples that fit your codebase architecture 
                    and existing patterns.
                  </p>
                </Reveal>

                <Reveal className="space-y-4" delay={0.2}>
                  <h3 className="text-2xl font-semibold text-foreground">Safety-First Research</h3>
                  <p className="text-muted-foreground">
                    Triple validation: source authority check, information accuracy check, 
                    and implementation safety check. Prevents implementation errors from 
                    unofficial or outdated information.
                  </p>
                </Reveal>

                <Reveal className="space-y-4" delay={0.3}>
                  <h3 className="text-2xl font-semibold text-foreground">Research Prompt Generation</h3>
                  <p className="text-muted-foreground">
                    Generates targeted research prompts only for critical knowledge gaps. 
                    Maximum 3 prompts, highly selective, focusing exclusively on what could 
                    cause implementation failure.
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