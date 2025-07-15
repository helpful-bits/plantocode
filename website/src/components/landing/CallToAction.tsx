'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface CallToActionProps {
  title: string;
  description: string;
  buttonText: string;
  buttonLink: string;
}

export function CallToAction({ title, description, buttonText, buttonLink }: CallToActionProps) {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <section className="relative py-20 px-4 overflow-hidden">
      {/* Background image - changes based on theme */}
      <Image
        src={resolvedTheme === 'dark' ? "/images/features-background-dark.png" : "/images/features-background.png"}
        alt="Call to action background"
        fill
        quality={100}
        className="object-cover object-center z-0"
      />
      
      {/* Gradient overlay for better text contrast */}
      <div className="absolute inset-0 z-1 bg-gradient-to-b from-background/60 via-transparent to-background/90" />
      
      {/* Additional soft transition from top */}
      <div className="absolute inset-x-0 top-0 h-32 z-2 bg-gradient-to-b from-background to-transparent" />
      
      {/* Glass morphism overlay */}
      <div className="absolute inset-0 z-5 bg-gradient-to-b from-transparent via-background/5 to-background/20 backdrop-blur-[2px]" />
      
      {/* Radial gradient for focus */}
      <div 
        className="absolute inset-0 z-3"
        style={{
          background: 'radial-gradient(circle at 50% 50%, rgba(16, 185, 129, 0.1) 0%, transparent 50%)'
        }}
      />
      
      <div className="container mx-auto relative z-10">
        <div className="max-w-3xl mx-auto">
          {/* Glass card for CTA content */}
          <div className="relative overflow-hidden rounded-3xl">
            {/* Solid base layer */}
            <div className="absolute inset-0 bg-white/95 dark:bg-black/85 backdrop-blur-xl backdrop-saturate-150" />
            
            {/* Gradient overlay for depth */}
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-teal-500/10" />
            
            {/* Glass shine effect */}
            <div className="absolute inset-[1px] bg-gradient-to-br from-white/40 via-transparent to-transparent rounded-[23px] opacity-40" />
            
            {/* Static shimmer effect */}
            <div className="absolute inset-0 opacity-30">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12 translate-x-12" />
            </div>
            
            {/* Edge highlights */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />
            
            {/* Border with glow */}
            <div className="absolute inset-0 rounded-3xl ring-1 ring-emerald-500/30 dark:ring-emerald-400/20" />
            
            <div className="relative text-center p-12">
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
          </div>
        </div>
      </div>
    </section>
  );
}