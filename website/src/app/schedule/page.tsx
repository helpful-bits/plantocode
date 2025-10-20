'use client';

import { useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { Calendar, Clock, Users, MessageSquare } from 'lucide-react';

export default function SchedulePage() {
  useEffect(() => {
    // Load Cal.com embed script
    const script = document.createElement('script');
    script.src = 'https://app.cal.com/embed/embed.js';
    script.async = true;

    script.onload = () => {
      // Initialize Cal.com after script loads
      if (typeof window !== 'undefined' && (window as any).Cal) {
        (window as any).Cal('init');
      }
    };

    document.head.appendChild(script);

    return () => {
      // Cleanup script on unmount
      document.head.removeChild(script);
    };
  }, []);

  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />

      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />

        <main className="flex-grow py-16 sm:py-20 md:py-24 lg:py-32 px-4">
          <div className="container mx-auto max-w-5xl">
            <div className="text-center mb-12">
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                Talk to an Architect
              </h1>
              <p className="text-lg sm:text-xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                Get expert guidance on using PlanToCode for your team's specific needs. We'll discuss architecture patterns, integration strategies, and deployment options.
              </p>
            </div>

            <div className="grid lg:grid-cols-3 gap-8 mb-12">
              <GlassCard className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Clock className="w-6 h-6 text-primary" />
                  <h3 className="text-lg font-semibold">30-Minute Session</h3>
                </div>
                <p className="text-foreground/80">
                  Focused consultation on your team's requirements and how PlanToCode can help.
                </p>
              </GlassCard>

              <GlassCard className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Users className="w-6 h-6 text-primary" />
                  <h3 className="text-lg font-semibold">Team Solutions</h3>
                </div>
                <p className="text-foreground/80">
                  Learn about enterprise features, terminal governance, and deployment options.
                </p>
              </GlassCard>

              <GlassCard className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <MessageSquare className="w-6 h-6 text-primary" />
                  <h3 className="text-lg font-semibold">Architecture Review</h3>
                </div>
                <p className="text-foreground/80">
                  Discuss integration with your existing Claude Code, Cursor, or Aider workflows.
                </p>
              </GlassCard>
            </div>

            <GlassCard className="p-8 sm:p-12" highlighted>
              <div className="flex justify-center mb-6">
                <div className="p-4 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10">
                  <Calendar className="w-8 h-8 text-primary" />
                </div>
              </div>

              {/* Cal.com embed container */}
              <div className="cal-container">
                <div
                  data-cal-namespace="plantocode"
                  data-cal-link="plantocode/architect-consultation"
                  data-cal-config='{"layout":"month_view"}'
                  style={{ width: '100%', height: '700px', overflow: 'scroll' }}
                  className="rounded-lg overflow-hidden"
                />
              </div>

              <div className="mt-8 text-center">
                <p className="text-sm text-foreground/60">
                  Can't find a suitable time? Email us at{' '}
                  <a href="mailto:architects@plantocode.com" className="text-primary hover:underline">
                    architects@plantocode.com
                  </a>
                </p>
              </div>
            </GlassCard>

            <div className="mt-12 text-center">
              <h2 className="text-2xl font-bold mb-6">Common Topics We Cover</h2>
              <div className="grid sm:grid-cols-2 gap-4 max-w-3xl mx-auto text-left">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <span className="text-foreground/80">Integrating with existing Claude Code/Cursor workflows</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <span className="text-foreground/80">Terminal orchestration for CI/CD pipelines</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <span className="text-foreground/80">Multi-model planning strategies for legacy code</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <span className="text-foreground/80">On-premise deployment requirements</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <span className="text-foreground/80">Security & compliance considerations</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <span className="text-foreground/80">Cost optimization for large teams</span>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}