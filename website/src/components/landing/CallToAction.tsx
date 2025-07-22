'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { GlassCard } from '@/components/ui/GlassCard';
import Image from 'next/image';
import { useTheme } from 'next-themes';

interface CallToActionProps {
  title: string;
  description: string;
  buttonText: string;
  buttonLink: string;
}

export function CallToAction({ title, description, buttonText, buttonLink }: CallToActionProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);
  
  return (
    <section className="relative py-20 px-4 overflow-hidden">
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
      {/* Gradient overlay for better text contrast */}
      <div className="absolute inset-0 z-1 bg-gradient-to-b from-background/90 via-background/50 to-background/90 dark:from-background/95 dark:via-background/70 dark:to-background/95" />
      
      {/* Additional soft transition from top */}
      <div className="absolute inset-x-0 top-0 h-32 z-2 bg-gradient-to-b from-background to-transparent dark:from-background/90" />
      
      {/* Glass morphism overlay */}
      <div className="absolute inset-0 z-5 bg-gradient-to-b from-transparent via-background/10 to-transparent backdrop-blur-sm" />
      
      {/* Radial gradient for focus */}
      <div 
        className="absolute inset-0 z-3"
        style={{
          background: 'radial-gradient(circle at 50% 50%, rgba(16, 185, 129, 0.1) 0%, transparent 50%)'
        }}
      />
      
      <div className="container mx-auto relative z-10">
        <div className="max-w-3xl mx-auto">
          <GlassCard highlighted={true}>
            <div className="text-center p-12">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-gray-900 dark:text-white">
                {title}
              </h2>
              
              <p className="text-lg sm:text-xl mb-8 max-w-2xl mx-auto leading-relaxed font-medium text-gray-700 dark:text-gray-200">
                {description}
              </p>
              
              <div className="relative inline-block group">
                {/* Glow effect */}
                <div className="absolute -inset-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 blur-lg opacity-40 group-hover:opacity-60 transition-opacity duration-300 animate-pulse" />
                
                <Button asChild size="lg" className="relative shadow-2xl hover:shadow-emerald-500/25">
                  <Link href={buttonLink} className="group">
                    {buttonText}
                    <svg 
                      className="ml-3 w-6 h-6 group-hover:translate-x-1 transition-transform duration-300" 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </Button>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    </section>
  );
}