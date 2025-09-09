import type { Metadata } from 'next';
import { Header } from '@/components/landing/Header';
import { Shield } from 'lucide-react';
import Reveal from '@/components/motion/Reveal';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Local-First Privacy - Your Code Stays Local | Vibe Manager',
  description: 'Vibe Manager stores everything locally in SQLite. Your code only goes to AI providers when generating plans. Full control over your data. Works with Claude Code, Cursor.',
  keywords: [
    'vibe code cleanup specialist',
    'vibe manager',
    'local-first',
    'privacy',
    'local storage',
    'SQLite',
    'code privacy',
    'data control',
    'secure coding',
    'AI coding assistant',
  ],
};

export default function LocalFirstPage() {
  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />
      <div className="relative z-0 bg-transparent">
        <Header />
        
        <main className="flex-grow">
          <section className="relative py-20 sm:py-24">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
              <Reveal as="div" className="mb-6">
                <Shield className="w-16 h-16 mx-auto mb-6 text-primary" />
              </Reveal>
              
              <Reveal as="h1" className="text-4xl sm:text-5xl font-bold mb-6 text-foreground">
                Local storage. Direct to AI providers.
              </Reveal>
              
              <Reveal className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                Sessions and history stored locally. When you create plans, your code goes to OpenAI, Google, or Anthropic. We handle auth and billing.
              </Reveal>

              <div className="grid md:grid-cols-2 gap-8 mt-12 text-left">
                <Reveal className="space-y-4">
                  <h3 className="text-2xl font-semibold text-foreground">Complete Data Sovereignty</h3>
                  <p className="text-muted-foreground">
                    Sessions, history, and settings stored locally in SQLite. 
                    When you click "Create Plan" or "Find Files", selected code is sent to AI providers. 
                    You see token counts and costs before confirming.
                  </p>
                </Reveal>

                <Reveal className="space-y-4" delay={0.1}>
                  <h3 className="text-2xl font-semibold text-foreground">Zero-Trust Architecture</h3>
                  <p className="text-muted-foreground">
                    Vibe Manager proxies your requests to AI providers, handling authentication and billing. 
                    Your code goes directly to OpenAI, Google, Anthropic, etc. when you use AI features. 
                    We don't store your code on our servers.
                  </p>
                </Reveal>

                <Reveal className="space-y-4" delay={0.2}>
                  <h3 className="text-2xl font-semibold text-foreground">Granular Data Control</h3>
                  <p className="text-muted-foreground">
                    Every API call visible and controllable. See exactly what context 
                    is being sent, to which model, and why. Approve or modify before 
                    transmission. No surprises, no hidden data flows.
                  </p>
                </Reveal>

                <Reveal className="space-y-4" delay={0.3}>
                  <h3 className="text-2xl font-semibold text-foreground">Enterprise-Grade Privacy</h3>
                  <p className="text-muted-foreground">
                    Perfect for proprietary codebases and trade secrets. File discovery, 
                    session management, and workflow orchestration work completely offline. 
                    Only specific approved context touches external APIs.
                  </p>
                </Reveal>
              </div>

              <Reveal className="mt-12" delay={0.4}>
                <Button asChild size="xl" variant="cta">
                  <Link href="/download">
                    Download Local-First
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
                    <h3 className="font-semibold text-foreground mb-2">What exactly stays local?</h3>
                    <p className="text-muted-foreground">Sessions and history are stored locally in SQLite. When you use AI features (Create Plan, Find Files), your selected code and context are sent to AI provider APIs (OpenAI, Google, Anthropic, etc.).</p>
                  </Reveal>
                  <Reveal className="border border-primary/10 rounded-lg p-6" delay={0.1}>
                    <h3 className="font-semibold text-foreground mb-2">How does billing work if it's local?</h3>
                    <p className="text-muted-foreground">Vibe Manager acts as a secure proxy for AI API calls. You see real-time token costs and pay only for what you use, while your code never gets stored by us.</p>
                  </Reveal>
                  <Reveal className="border border-primary/10 rounded-lg p-6" delay={0.2}>
                    <h3 className="font-semibold text-foreground mb-2">Can I work offline?</h3>
                    <p className="text-muted-foreground">File browsing and session management work offline. AI features send your code to provider APIs. The AI providers process your code on their servers to generate plans.</p>
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