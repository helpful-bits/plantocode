'use client';

import { useEffect, useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Header } from '@/components/landing/Header';
import { Calendar, Clock, Users, MessageSquare } from 'lucide-react';
import { ObfuscatedEmail } from '@/components/ui/ObfuscatedEmail';
import { loadMessages, DEFAULT_LOCALE } from '@/lib/i18n';

export default function SchedulePage() {
  const [t, setT] = useState<Record<string, any>>({});

  useEffect(() => {
    const loadTranslations = async () => {
      const messages = await loadMessages(DEFAULT_LOCALE);
      setT(messages);
    };
    loadTranslations();
  }, []);

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

  if (!t || Object.keys(t).length === 0) {
    return null; // or a loading spinner
  }

  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />

      <div className="relative z-0 bg-transparent min-h-screen flex flex-col">
        <Header />

        <main className="flex-grow py-16 sm:py-20 md:py-24 lg:py-32 px-4">
          <div className="container mx-auto max-w-5xl">
            <div className="text-center mb-12">
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                {t['schedule.hero.title'] || 'Talk to an Architect'}
              </h1>
              <p className="text-lg sm:text-xl text-foreground/80 max-w-3xl mx-auto leading-relaxed">
                {t['schedule.hero.subtitle'] ?? ''}
              </p>
            </div>

            <div className="grid lg:grid-cols-3 gap-8 mb-12">
              <GlassCard className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Clock className="w-6 h-6 text-primary" />
                  <h3 className="text-lg font-semibold">{t['schedule.benefits.session.title']}</h3>
                </div>
                <p className="text-foreground/80">
                  {t['schedule.benefits.session.description']}
                </p>
              </GlassCard>

              <GlassCard className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Users className="w-6 h-6 text-primary" />
                  <h3 className="text-lg font-semibold">{t['schedule.benefits.team.title']}</h3>
                </div>
                <p className="text-foreground/80">
                  {t['schedule.benefits.team.description']}
                </p>
              </GlassCard>

              <GlassCard className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <MessageSquare className="w-6 h-6 text-primary" />
                  <h3 className="text-lg font-semibold">{t['schedule.benefits.review.title']}</h3>
                </div>
                <p className="text-foreground/80">
                  {t['schedule.benefits.review.description']}
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
                  {t['schedule.footer']}{' '}
                  <ObfuscatedEmail
                    user="architects"
                    domain="plantocode.com"
                    className="text-primary hover:underline"
                  />
                </p>
              </div>
            </GlassCard>

            <div className="mt-12 text-center">
              <h2 className="text-2xl font-bold mb-6">{t['schedule.topics.title']}</h2>
              <div className="grid sm:grid-cols-2 gap-4 max-w-3xl mx-auto text-left">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <span className="text-foreground/80">{t['schedule.topics.items.integration']}</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <span className="text-foreground/80">{t['schedule.topics.items.orchestration']}</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <span className="text-foreground/80">{t['schedule.topics.items.planning']}</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <span className="text-foreground/80">{t['schedule.topics.items.deployment']}</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <span className="text-foreground/80">{t['schedule.topics.items.security']}</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <span className="text-foreground/80">{t['schedule.topics.items.cost']}</span>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}