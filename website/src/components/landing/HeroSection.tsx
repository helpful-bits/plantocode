'use client';

import Link from 'next/link';
import Image from 'next/image';
import { CSSLightRays } from '@/components/effects/CSSLightRays';
import { Button } from '@/components/ui/button';

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Studio Ghibli background image - changes based on theme */}
      <Image
        src="/images/hero-background.png"
        alt="Studio Ghibli inspired landscape with teal sky and light rays"
        fill
        priority
        quality={100}
        className="object-cover object-center z-0 block dark:hidden"
      />
      <Image
        src="/images/hero-background-dark.png"
        alt="Northern lights aurora in deep blue night sky"
        fill
        priority
        quality={100}
        className="object-cover object-center z-0 hidden dark:block"
      />
      
      {/* Gradient overlay for better text contrast */}
      <div className="absolute inset-0 z-1 bg-gradient-to-b from-background/50 via-background/30 to-background/60" />
      
      {/* Light rays effect */}
      <CSSLightRays />
      
      {/* Glass morphism overlay */}
      <div className="absolute inset-0 z-5 bg-gradient-to-b from-transparent via-background/10 to-transparent backdrop-blur-sm" />

      {/* Main content */}
      <div className="relative z-10 text-center px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        {/* Primary heading */}
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
          <span className="inline-block transition-all duration-700 delay-100 opacity-100 translate-y-0">
            <span className="text-teal-900 dark:text-white font-bold">
              AI-Powered Context Curation
            </span>
          </span>
          <br />
          <span className="inline-block transition-all duration-700 delay-300 opacity-100 translate-y-0">
            <span className="text-teal-900/80 dark:text-white/80 font-medium">for</span>{' '}
            <span className="text-teal-800 dark:text-teal-400 font-extrabold">
              Large Codebases
            </span>
          </span>
        </h1>

        {/* Subtitle */}
        <div className="relative mb-8 max-w-3xl mx-auto transition-all duration-700 delay-500 opacity-100 translate-y-0">
          <p className="relative text-lg sm:text-xl leading-relaxed font-medium text-teal-950 dark:text-gray-100"
             style={{
               textShadow: `0 0 30px rgba(255, 255, 135, 0.6),
                          0 0 50px rgba(154, 255, 154, 0.4),
                          0 2px 8px rgba(255, 255, 200, 0.7)`
             }}>
            <span className="dark:hidden">
              Find relevant files instantly and create implementation plans that combine internet knowledge with your codebase. 
              4-stage file discovery, web research integration, and multi-model planning with transparent pricing.
            </span>
            <span className="hidden dark:inline" style={{
               textShadow: `0 0 20px rgba(94, 234, 212, 0.3),
                          0 0 40px rgba(94, 234, 212, 0.2),
                          0 2px 8px rgba(0, 0, 0, 0.4)`
             }}>
              Find relevant files instantly and create implementation plans that combine internet knowledge with your codebase. 
              4-stage file discovery, web research integration, and multi-model planning with transparent pricing.
            </span>
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center transition-all duration-700 delay-700 opacity-100 translate-y-0">
          <Button asChild size="lg">
            <Link href="/download">
              Download Vibe Manager Free
            </Link>
          </Button>
          
          <Button asChild variant="gradient-outline" size="lg">
            <Link href="#features">
              Learn More
            </Link>
          </Button>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-10 transition-all duration-700 delay-1000 opacity-100">
        <div className="animate-bounce p-2 rounded-full glass-subtle">
          <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </div>
    </section>
  );
}