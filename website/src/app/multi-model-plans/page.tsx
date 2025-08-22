import type { Metadata } from 'next';
import { Header } from '@/components/landing/Header';
import { BrainCircuit } from 'lucide-react';
import Reveal from '@/components/motion/Reveal';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Merge plans from multiple LLMs | Vibe Manager',
  description: 'Compare, de-duplicate, and synthesize into one executable plan.',
  keywords: [
    'multi-model planning',
    'LLM orchestration',
    'plan merging',
    'AI synthesis',
    'council of LLMs',
    'implementation plans',
    'AI coding assistant',
  ],
};

export default function MultiModelPlansPage() {
  return (
    <>
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
                Compare, de-duplicate, and synthesize into one executable plan.
              </Reveal>

              <div className="grid md:grid-cols-2 gap-8 mt-12 text-left">
                <Reveal className="space-y-4">
                  <h3 className="text-2xl font-semibold text-foreground">Council of LLMs</h3>
                  <p className="text-muted-foreground">
                    Generate plans from Gemini 2.5, GPT-5, Claude 4, and other leading models. 
                    Each model brings unique insights and approaches to your implementation challenge.
                  </p>
                </Reveal>

                <Reveal className="space-y-4" delay={0.1}>
                  <h3 className="text-2xl font-semibold text-foreground">Intelligent Synthesis</h3>
                  <p className="text-muted-foreground">
                    The merge AI performs deep synthesis, detecting blind spots, 
                    eliminating redundancy, and creating emergent solutions that 
                    are better than any single model's plan.
                  </p>
                </Reveal>

                <Reveal className="space-y-4" delay={0.2}>
                  <h3 className="text-2xl font-semibold text-foreground">Plan Comparison</h3>
                  <p className="text-muted-foreground">
                    Side-by-side comparison of different approaches. See where models 
                    agree, where they diverge, and understand the trade-offs of each approach 
                    before execution.
                  </p>
                </Reveal>

                <Reveal className="space-y-4" delay={0.3}>
                  <h3 className="text-2xl font-semibold text-foreground">Executable Output</h3>
                  <p className="text-muted-foreground">
                    Get one clean, executable implementation plan that combines the best 
                    insights from all models. Review with floating notes and edit 
                    plans directly before execution.
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