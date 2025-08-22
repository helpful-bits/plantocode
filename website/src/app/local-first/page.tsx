import type { Metadata } from 'next';
import { Header } from '@/components/landing/Header';
import { Shield } from 'lucide-react';
import Reveal from '@/components/motion/Reveal';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Your repo stays on your machine | Vibe Manager',
  description: 'Local SQLite storage, you control what\'s sent and when.',
  keywords: [
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
                Your repo stays on your machine
              </Reveal>
              
              <Reveal className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
                Local SQLite storage, you control what's sent and when.
              </Reveal>

              <div className="grid md:grid-cols-2 gap-8 mt-12 text-left">
                <Reveal className="space-y-4">
                  <h3 className="text-2xl font-semibold text-foreground">True Local-First</h3>
                  <p className="text-muted-foreground">
                    All your code, sessions, and history live in SQLite on your machine. 
                    No cloud storage, no data mining, no vendor lock-in. Your code stays yours.
                  </p>
                </Reveal>

                <Reveal className="space-y-4" delay={0.1}>
                  <h3 className="text-2xl font-semibold text-foreground">Secure Proxy Only</h3>
                  <p className="text-muted-foreground">
                    Vibe Manager is just a secure proxy to AI providers, handling auth 
                    and billing. Your code flows directly through without being stored 
                    or analyzed by us.
                  </p>
                </Reveal>

                <Reveal className="space-y-4" delay={0.2}>
                  <h3 className="text-2xl font-semibold text-foreground">You Control the Flow</h3>
                  <p className="text-muted-foreground">
                    Decide exactly what gets sent to which AI provider and when. 
                    Fine-grained control over every piece of data that leaves your machine.
                  </p>
                </Reveal>

                <Reveal className="space-y-4" delay={0.3}>
                  <h3 className="text-2xl font-semibold text-foreground">Complete Privacy</h3>
                  <p className="text-muted-foreground">
                    Work on proprietary code with confidence. Your business logic, 
                    trade secrets, and sensitive implementations never leave your 
                    local environment.
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
                    <p className="text-muted-foreground">All your code, file selections, session history, and task descriptions are stored in SQLite on your machine. Only specific context you approve gets sent to AI providers.</p>
                  </Reveal>
                  <Reveal className="border border-primary/10 rounded-lg p-6" delay={0.1}>
                    <h3 className="font-semibold text-foreground mb-2">How does billing work if it's local?</h3>
                    <p className="text-muted-foreground">Vibe Manager acts as a secure proxy for AI API calls. You see real-time token costs and pay only for what you use, while your code never gets stored by us.</p>
                  </Reveal>
                  <Reveal className="border border-primary/10 rounded-lg p-6" delay={0.2}>
                    <h3 className="font-semibold text-foreground mb-2">Can I work offline?</h3>
                    <p className="text-muted-foreground">File finding, session management, and history work offline. AI features require internet for model API calls, but your code stays on your machine.</p>
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