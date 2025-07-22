'use client';

import React from 'react';
import Image from 'next/image';
import { GlassCard } from '@/components/ui/GlassCard';
import { useTheme } from 'next-themes';

interface Feature {
  title: string;
  description: string;
  icon: React.ReactNode;
}

interface FeaturesProps {
  features?: Feature[];
}

const defaultFeatures: Feature[] = [];

export function Features({ features = defaultFeatures }: FeaturesProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);
  
  return (
    <section id="features" className="relative py-16 px-4 overflow-hidden">
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
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-teal-900 dark:text-white">Key Features</h2>
          <p className="text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed font-medium text-teal-950 dark:text-gray-100">
            Powerful tools designed for large codebase development and AI-assisted workflow optimization
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => {
              return (
                <GlassCard key={index}>
                  <div className="p-6">
                    {/* Icon container */}
                    <div className={`
                      mx-auto mb-4 w-16 h-16 rounded-2xl flex items-center justify-center
                      transition-all duration-300 group-hover:scale-110 
                      ${index % 2 === 0 
                        ? 'bg-gradient-to-br from-emerald-500/10 to-emerald-600/20 dark:from-emerald-400/5 dark:to-emerald-500/10 ring-1 ring-emerald-500/20 dark:ring-emerald-400/20' 
                        : 'bg-gradient-to-br from-teal-500/10 to-teal-600/20 dark:from-teal-400/5 dark:to-teal-500/10 ring-1 ring-teal-500/20 dark:ring-teal-400/20'
                      }
                    `}>
                      <div className={`
                        transition-transform duration-300 hover:scale-110
                        ${index % 2 === 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-teal-700 dark:text-teal-400'}
                      `}>
                        {feature.icon}
                      </div>
                    </div>
                    
                    <h3 className="text-xl font-semibold text-center mb-3 text-gray-900 dark:text-white">
                      {feature.title}
                    </h3>
                    
                    <p className="text-center text-sm leading-relaxed text-gray-700 dark:text-gray-200">
                      {feature.description}
                    </p>
                  </div>
                </GlassCard>
              );
            })}
        </div>
      </div>
    </section>
  );
}