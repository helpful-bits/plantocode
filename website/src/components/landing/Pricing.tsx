'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/GlassCard';
import Image from 'next/image';
import { useTheme } from 'next-themes';

export function Pricing() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <section id="pricing" className="relative py-16 px-4 overflow-hidden">
      {/* Theme-based background images */}
      {mounted && (
        <Image
          src={resolvedTheme === 'dark' ? '/images/features-background-dark.png' : '/images/features-background.png'}
          alt="Section background"
          fill
          quality={100}
          className="object-cover object-top z-0"
        />
      )}
      {/* Gradient overlay for better text contrast and smooth transition */}
      <div className="absolute inset-0 z-1 bg-gradient-to-b from-background/90 via-background/50 to-background/90 dark:from-background/95 dark:via-background/70 dark:to-background/95" />
      
      {/* Additional soft transition from top */}
      <div className="absolute inset-x-0 top-0 h-32 z-2 bg-gradient-to-b from-background to-transparent dark:from-background/90" />
      
      {/* Glass morphism overlay */}
      <div className="absolute inset-0 z-5 bg-gradient-to-b from-transparent via-background/10 to-transparent backdrop-blur-sm" />
      
      <div className="container mx-auto relative z-10">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-teal-900 dark:text-white">Simple Pricing</h2>
          <p className="text-lg sm:text-xl max-w-3xl mx-auto leading-relaxed font-medium text-teal-950 dark:text-gray-100">
            Pay-as-you-go. No subscriptions. Transparent costs.
          </p>
        </div>
        
        <div className="max-w-2xl mx-auto">
          <GlassCard highlighted={true}>
            <div className="p-8 text-center">
              <h3 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
                Start Free, Pay for Usage
              </h3>
              <p className="text-lg mb-6 text-gray-700 dark:text-gray-200">
                All costs displayed upfront. Only charged for AI processing.
              </p>
              <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-6 mb-6">
                <h4 className="font-semibold mb-2 text-emerald-900 dark:text-emerald-400">
                  $1.50 Free Credit
                </h4>
                <p className="text-emerald-800 dark:text-emerald-300">
                  No payment info needed. Full access to all features.
                </p>
              </div>
              <Button size="lg" className="w-full sm:w-auto">
                Get Started
              </Button>
            </div>
          </GlassCard>
        </div>
      </div>
    </section>
  );
}