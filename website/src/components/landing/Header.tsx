'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme';
import { useTheme } from 'next-themes';

export function Header() {
  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { theme } = useTheme();

  useEffect(() => {
    setMounted(true);
    
    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      setScrolled(scrollPosition > 50);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (!mounted) {
    return (
      <header className="fixed top-0 w-full z-50 transition-all duration-300">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="font-bold text-xl">
            Vibe Manager
          </Link>
          <nav className="flex items-center gap-6">
            <Link href="#features" className="text-muted-foreground hover:text-foreground transition-colors">
              Features
            </Link>
            <Link href="#how-it-works" className="text-muted-foreground hover:text-foreground transition-colors">
              How It Works
            </Link>
            <Link href="#pricing" className="text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </Link>
            <ThemeToggle />
            <Button asChild>
              <Link href="/download">
                Download
              </Link>
            </Button>
          </nav>
        </div>
      </header>
    );
  }

  return (
    <header 
      className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        scrolled 
          ? 'glass border-b border-border/20 shadow-lg' 
          : 'bg-transparent'
      }`}
    >
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link 
          href="/" 
          className={`font-bold text-xl transition-all duration-300 ${
            scrolled 
              ? 'text-foreground' 
              : theme === 'dark' 
                ? 'text-white' 
                : 'text-foreground'
          }`}
        >
          Vibe Manager
        </Link>
        <nav className="hidden md:flex items-center gap-6">
          <Link 
            href="#features" 
            className={`transition-all duration-300 hover:text-primary ${
              scrolled 
                ? 'text-muted-foreground' 
                : theme === 'dark' 
                  ? 'text-gray-200 hover:text-white' 
                  : 'text-muted-foreground'
            }`}
          >
            Features
          </Link>
          <Link 
            href="#how-it-works" 
            className={`transition-all duration-300 hover:text-primary ${
              scrolled 
                ? 'text-muted-foreground' 
                : theme === 'dark' 
                  ? 'text-gray-200 hover:text-white' 
                  : 'text-muted-foreground'
            }`}
          >
            How It Works
          </Link>
          <Link 
            href="#pricing" 
            className={`transition-all duration-300 hover:text-primary ${
              scrolled 
                ? 'text-muted-foreground' 
                : theme === 'dark' 
                  ? 'text-gray-200 hover:text-white' 
                  : 'text-muted-foreground'
            }`}
          >
            Pricing
          </Link>
          <ThemeToggle />
          <Button asChild className="btn-primary-modern">
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