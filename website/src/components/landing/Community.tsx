'use client';

import React from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { MessageSquare, Users, Lightbulb, Bug } from 'lucide-react';
import Reveal from '@/components/motion/Reveal';
import Link from 'next/link';

export function Community() {
  return (
    <section className="relative py-12 sm:py-16 md:py-20 lg:py-24 px-4 overflow-hidden" id="community">
      <div className="container mx-auto relative z-10">
        <Reveal className="max-w-4xl mx-auto">
          <GlassCard className="overflow-hidden">
            <div className="p-8 sm:p-10 lg:p-12 text-center">
              <Reveal as="h2" className="text-3xl sm:text-4xl lg:text-5xl mb-6 text-primary-emphasis font-bold" delay={0.05}>
                Built for You, With You
              </Reveal>
              
              <Reveal as="p" className="text-lg sm:text-xl mb-8 leading-relaxed text-foreground/80 max-w-3xl mx-auto" delay={0.1}>
                I built this to stop the file chaos. To edit in the right place, every time. This isn't just my tool - it's ours. 
                Let's ship features without cleanup duty, without duplicate files, without the mess.
              </Reveal>

              <Reveal as="p" className="text-lg font-semibold mb-8 text-foreground" delay={0.15}>
                Got ideas? Hit a bug? Something not working quite right?
              </Reveal>

              <Reveal className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10" delay={0.2}>
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Lightbulb className="w-6 h-6 text-primary" />
                  </div>
                  <p className="text-sm font-medium">Submit feature requests</p>
                </div>
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bug className="w-6 h-6 text-primary" />
                  </div>
                  <p className="text-sm font-medium">Report bugs</p>
                </div>
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <MessageSquare className="w-6 h-6 text-primary" />
                  </div>
                  <p className="text-sm font-medium">Vote on what's next</p>
                </div>
                <div className="flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Users className="w-6 h-6 text-primary" />
                  </div>
                  <p className="text-sm font-medium">Connect with developers</p>
                </div>
              </Reveal>

              <Reveal delay={0.25}>
                <Link
                  className="inline-flex items-center justify-center px-8 py-4 text-base font-semibold text-primary-foreground bg-gradient-to-r from-primary to-primary-emphasis hover:from-primary-emphasis hover:to-primary rounded-xl shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transform hover:-translate-y-0.5 transition-all duration-200"
                  href="https://vibemanager.featurebase.app"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Join the Community & Share Feedback
                </Link>
              </Reveal>

            </div>
          </GlassCard>
        </Reveal>
      </div>
    </section>
  );
}