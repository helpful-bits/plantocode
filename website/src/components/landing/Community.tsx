'use client';

import React from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { variants } from '@/lib/animations';
import { MessageSquare, Users, Lightbulb, Bug } from 'lucide-react';
import Link from 'next/link';

export function Community() {
  return (
    <section className="relative py-12 sm:py-16 md:py-20 lg:py-24 px-4 overflow-hidden" id="community">
      <div className="container mx-auto relative z-10">
        <motion.div
          className="max-w-4xl mx-auto"
          initial="hidden"
          whileInView="visible"
          variants={variants.section}
          viewport={{ once: true, amount: 0.3 }}
        >
          <GlassCard className="overflow-hidden">
            <div className="p-8 sm:p-10 lg:p-12 text-center">
              <motion.h2
                className="text-3xl sm:text-4xl lg:text-5xl mb-6 text-primary-emphasis font-bold"
                variants={variants.item}
              >
                Built for You, With You
              </motion.h2>
              
              <motion.p
                className="text-lg sm:text-xl mb-8 leading-relaxed text-foreground/80 max-w-3xl mx-auto"
                variants={variants.item}
              >
                Look, I built this because I was drowning in AI babysitting duty. But this isn't just my tool - it's ours. 
                I want us all to be more productive, to spend less time wrestling with context and more time building cool stuff.
              </motion.p>

              <motion.p
                className="text-lg font-semibold mb-8 text-foreground"
                variants={variants.item}
              >
                Got ideas? Hit a bug? Something not working quite right?
              </motion.p>

              <motion.div
                className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10"
                variants={variants.item}
              >
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
              </motion.div>

              <motion.div variants={variants.item}>
                <Button asChild size="lg" variant="default">
                  <Link href="https://vibemanager.featurebase.app" target="_blank" rel="noopener noreferrer">
                    Visit Our FeatureBase Portal
                  </Link>
                </Button>
              </motion.div>

            </div>
          </GlassCard>
        </motion.div>
      </div>
    </section>
  );
}