'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';

export function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      setScrolled(scrollPosition > 50);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header 
      className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        scrolled 
          ? 'glass-subtle border-b border-border/20 shadow-lg' 
          : 'bg-transparent'
      }`}
    >
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link 
          href="/" 
          className={`font-bold text-xl transition-all duration-300 ${
            scrolled 
              ? 'text-teal-800 dark:text-teal-600' 
              : 'text-white drop-shadow-lg dark:drop-shadow-md'
          } hover:opacity-90`}
        >
          Vibe Manager
        </Link>
        <nav className="hidden md:flex items-center gap-6">
          <Link 
            href="#features" 
            className={`transition-all duration-300 ${
              scrolled 
                ? 'text-teal-700 hover:text-teal-600 dark:text-teal-600 dark:hover:text-teal-500' 
                : 'text-white/90 hover:text-white drop-shadow-md dark:drop-shadow'
            } font-medium`}
          >
            Features
          </Link>
          <Link 
            href="#how-it-works" 
            className={`transition-all duration-300 ${
              scrolled 
                ? 'text-teal-700 hover:text-teal-600 dark:text-teal-600 dark:hover:text-teal-500' 
                : 'text-white/90 hover:text-white drop-shadow-md dark:drop-shadow'
            } font-medium`}
          >
            How It Works
          </Link>
          <Link 
            href="#pricing" 
            className={`transition-all duration-300 ${
              scrolled 
                ? 'text-teal-700 hover:text-teal-600 dark:text-teal-600 dark:hover:text-teal-500' 
                : 'text-white/90 hover:text-white drop-shadow-md dark:drop-shadow'
            } font-medium`}
          >
            Pricing
          </Link>
          <ThemeToggle />
          <Button asChild>
            <Link href="/download">
              Download
            </Link>
          </Button>
        </nav>
        
        {/* Mobile menu button */}
        <button 
          className={`md:hidden p-2 rounded-lg transition-all duration-300 ${
            scrolled 
              ? 'bg-background/20 backdrop-blur-sm' 
              : 'bg-white/10 backdrop-blur-sm'
          }`}
          aria-label="Toggle menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>
    </header>
  );
}