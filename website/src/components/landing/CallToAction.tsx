'use client';

import Image from 'next/image';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { GlassCard } from '@/components/ui/GlassCard';

interface CallToActionProps {
  title: string;
  description: string;
  buttonText: string;
  buttonLink: string;
}

export function CallToAction({ title, description, buttonText, buttonLink }: CallToActionProps) {
  return (
    <section className="relative py-20 px-4 overflow-hidden">
      {/* Background image - changes based on theme */}
      <Image
        src="/images/features-background.png"
        alt="Call to action background"
        fill
        quality={100}
        className="object-cover object-center z-0 block dark:hidden"
      />
      <Image
        src="/images/features-background-dark.png"
        alt="Call to action background"
        fill
        quality={100}
        className="object-cover object-center z-0 hidden dark:block"
      />
      
      {/* Gradient overlay for better text contrast */}
      <div className="absolute inset-0 z-1 bg-gradient-to-b from-background/60 via-transparent to-background/90" />
      
      {/* Additional soft transition from top */}
      <div className="absolute inset-x-0 top-0 h-32 z-2 bg-gradient-to-b from-background to-transparent" />
      
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