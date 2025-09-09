import type { Metadata } from 'next';
import { Header } from '@/components/landing/Header';
import { BrainCircuit } from 'lucide-react';
import Reveal from '@/components/motion/Reveal';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { StructuredData } from '@/components/seo/StructuredData';
import type { BreadcrumbList } from 'schema-dts';

export const metadata: Metadata = {
  title: 'Multi-Model AI Planning - Merge GPT-5, Claude 4 & Gemini Plans',
  description: 'Revolutionary multi-model planning: Generate implementation plans from GPT-5, Claude 4, Gemini 2.5, then merge into one superior strategy. Works with Claude Code, Cursor. See how it works →',
  keywords: [
    'vibe code cleanup specialist',
    'multi-model planning',
    'LLM orchestration',
    'plan merging',
    'AI synthesis',
    'council of LLMs',
    'implementation plans',
    'AI coding assistant',
    'gpt-5 planning',
    'claude 4 planning',
    'gemini 2.5 planning',
  ],
};

export default function MultiModelPlansPage() {
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
        name: 'Multi-Model Plans',
        item: 'https://www.vibemanager.app/multi-model-plans'
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
                <BrainCircuit className="w-16 h-16 mx-auto mb-6 text-primary" />
              </Reveal>
              
              <Reveal as="h1" className="text-4xl sm:text-5xl font-bold mb-6 text-foreground">
                Merge plans from multiple LLMs
              </Reveal>
              
              <Reveal className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                Deep architectural analysis with conflict resolution protocol. Creates emergent solutions that transcend any individual plan's limitations.
              </Reveal>

              <div className="grid md:grid-cols-2 gap-8 mt-12 text-left">
                <Reveal className="space-y-4">
                  <h3 className="text-2xl font-semibold text-foreground">Architectural Philosophy Extraction</h3>
                  <p className="text-muted-foreground">
                    Analyzes each plan's core architectural approach and reasoning. 
                    Extracts the "why" behind major decisions and identifies underlying 
                    design patterns across different model approaches.
                  </p>
                </Reveal>

                <Reveal className="space-y-4" delay={0.1}>
                  <h3 className="text-2xl font-semibold text-foreground">Conflict Resolution Protocol</h3>
                  <p className="text-muted-foreground">
                    When plans disagree, applies principle-based resolution: SOLID principles, 
                    architectural integration, maintainability, and complexity minimization. 
                    Can synthesize hybrid approaches or create third solutions.
                  </p>
                </Reveal>

                <Reveal className="space-y-4" delay={0.2}>
                  <h3 className="text-2xl font-semibold text-foreground">Cross-Plan Pattern Recognition</h3>
                  <p className="text-muted-foreground">
                    Identifies convergent solutions and complementary approaches across plans. 
                    Uses insights from one plan to validate assumptions in others, 
                    detecting blind spots invisible to individual models.
                  </p>
                </Reveal>

                <Reveal className="space-y-4" delay={0.3}>
                  <h3 className="text-2xl font-semibold text-foreground">Emergent Intelligence</h3>
                  <p className="text-muted-foreground">
                    Creates solutions that are MORE than the sum of their parts. 
                    Generates architectural coherence and superior insights that 
                    transcend the limitations of any individual plan.
                  </p>
                </Reveal>
              </div>

              <Reveal className="mt-12" delay={0.4}>
                <Button asChild size="xl" variant="cta">
                  <Link href="/download">
                    Try Multi-Model Planning
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