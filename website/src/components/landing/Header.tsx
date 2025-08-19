'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { cn } from '@/lib/utils';
import { defaultEase, defaultDuration } from '@/lib/animations';
import { usePlausible } from '@/hooks/usePlausible';

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { trackEvent } = usePlausible();

  const handleDownloadClick = (location: string) => {
    trackEvent('download_click', { location });
  };

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const scrollPosition = window.scrollY;
          setScrolled(scrollPosition > 20);
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { href: '#features', label: 'Features' },
    { href: '#how-it-works', label: 'How It Works' },
    { href: '#pricing', label: 'Pricing' },
    { href: '#faq', label: 'FAQ' },
  ];

  return (
    <>
      <motion.header
        animate={{ y: 0, opacity: 1 }}
        className="fixed top-0 inset-x-0 z-50"
        initial={{ y: -100, opacity: 0 }}
        transition={{ duration: defaultDuration * 1.6, ease: defaultEase }}
      >
        {/* Background layer */}
        <div
          className={cn(
            'absolute inset-0',
            scrolled ? 'glass' : 'bg-transparent',
          )}
        />
        <div className="relative container mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            {/* Logo */}
            <motion.div
              className="flex-shrink-0"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Link
                className={cn(
                  'group inline-flex items-center gap-2 sm:gap-3 font-bold text-base sm:text-lg md:text-xl lg:text-2xl cursor-pointer',
                  scrolled
                    ? 'text-foreground hover:text-primary'
                    : 'text-foreground hover:text-primary drop-shadow-lg',
                )}
                href="/"
              >
                <motion.div
                  className={cn(
                    'flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 lg:w-10 lg:h-10 rounded-xl flex-shrink-0',
                    'bg-gradient-to-br from-primary via-primary/90 to-accent',
                    'group-hover:shadow-lg group-hover:shadow-primary/25',
                  )}
                  transition={{ type: 'spring', stiffness: 400, damping: 10 }}
                  whileHover={{ rotate: 12, scale: 1.1 }}
                >
                  <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 lg:w-5 lg:h-5 text-primary-foreground" />
                </motion.div>
                <span className="bg-gradient-to-r from-current to-primary bg-clip-text whitespace-nowrap">
                  Vibe Manager
                </span>
              </Link>
            </motion.div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1 lg:gap-2">
              {navLinks.map((link, index) => (
                <motion.div
                  key={link.href}
                  animate={{ opacity: 1, y: 0 }}
                  initial={{ opacity: 0, y: -20 }}
                  transition={{ delay: index * 0.1 + 0.3, duration: defaultDuration, ease: defaultEase }}
                >
                  <Link
                    className={cn(
                      'relative px-3 lg:px-4 py-2 rounded-xl font-medium text-sm lg:text-base',
                      'group nav-link-hover cursor-pointer clickable-text-underline',
                      scrolled
                        ? 'text-muted-foreground hover:text-foreground'
                        : 'text-foreground/90 hover:text-foreground drop-shadow-md',
                    )}
                    href={link.href}
                  >
                    <motion.span
                      className="relative z-10"
                      transition={{ type: 'spring', stiffness: 400, damping: 10 }}
                      whileHover={{ scale: 1.05 }}
                    >
                      {link.label}
                    </motion.span>
                  </Link>
                </motion.div>
              ))}

              <motion.div
                animate={{ opacity: 1, scaleY: 1 }}
                className="w-px h-6 bg-border/50 mx-2"
                initial={{ opacity: 0, scaleY: 0 }}
                transition={{ delay: 0.6, duration: 0.3 }}
              />

              <motion.div
                animate={{ opacity: 1, x: 0 }}
                className="hidden md:flex items-center gap-2"
                initial={{ opacity: 0, x: 20 }}
                transition={{ delay: 0.7, duration: defaultDuration, ease: defaultEase }}
              >
                <ThemeToggle />
                <div className="flex flex-col items-center ml-2">
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Button
                      asChild
                      className="relative"
                      size="lg"
                      variant="cta"
                      onClick={() => handleDownloadClick('header_desktop')}
                    >
                      <Link href="/download" className="no-hover-effect cursor-pointer">
                        Download for Mac
                      </Link>
                    </Button>
                  </motion.div>
                  <span className="text-xs text-muted-foreground mt-1 whitespace-nowrap">Windows coming soon</span>
                </div>
              </motion.div>
            </nav>

            {/* Mobile actions */}
            <div className="flex md:hidden items-center gap-2">
              <ThemeToggle />
              <motion.button
                animate={{ opacity: 1 }}
                aria-label="Toggle menu"
                className={cn(
                  'relative p-2.5 rounded-xl',
                  'focus:outline-none focus:ring-2 focus:ring-primary/50',
                  scrolled
                    ? 'glass text-foreground'
                    : 'bg-background/80 backdrop-blur-sm text-foreground hover:bg-background/90 border border-border/50',
                )}
                initial={{ opacity: 0 }}
                transition={{ delay: 0.5, duration: defaultDuration, ease: defaultEase }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                <AnimatePresence mode="wait">
                  {mobileMenuOpen ? (
                    <motion.div
                      key="close"
                      animate={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: 90, opacity: 0 }}
                      initial={{ rotate: -90, opacity: 0 }}
                      transition={{ duration: 0.3, type: 'spring', stiffness: 200 }}
                    >
                      <X className="w-5 h-5" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="menu"
                      animate={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: -90, opacity: 0 }}
                      initial={{ rotate: 90, opacity: 0 }}
                      transition={{ duration: 0.3, type: 'spring', stiffness: 200 }}
                    >
                      <Menu className="w-5 h-5" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
            </div>
          </div>
        </div>
      </motion.header>

      {/* Mobile Navigation Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              animate={{ opacity: 1 }}
              className="fixed inset-0 z-40 bg-background/60 backdrop-blur-md md:hidden"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              transition={{ duration: defaultDuration * 0.6, ease: defaultEase }}
              onClick={() => setMobileMenuOpen(false)}
            />

            {/* Mobile Menu */}
            <motion.nav
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={cn(
                'fixed top-20 left-4 right-4 z-50 md:hidden',
                'max-w-[calc(100vw-2rem)]',
                'max-h-[calc(100vh-6rem)]',
                'glass',
                'rounded-2xl',
                'p-4 sm:p-6',
                // Enhanced background for light mode visibility
                'bg-background/95 backdrop-blur-xl border border-border/80',
                'shadow-2xl shadow-black/10',
                'overflow-y-auto',
              )}
              exit={{ opacity: 0, y: -30, scale: 0.9 }}
              initial={{ opacity: 0, y: -30, scale: 0.9 }}
              transition={{
                duration: defaultDuration * 0.8,
                ease: defaultEase,
                opacity: { duration: defaultDuration * 0.6 },
              }}
            >
              <div className="space-y-2">
                {navLinks.map((link, index) => (
                  <motion.div
                    key={link.href}
                    animate={{ opacity: 1, x: 0 }}
                    initial={{ opacity: 0, x: -30 }}
                    transition={{
                      delay: index * 0.1 + 0.1,
                      duration: 0.4,
                      type: 'spring',
                      stiffness: 100,
                    }}
                  >
                    <motion.div
                      whileHover={{ scale: 1.02, x: 5 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Link
                        className={cn(
                          'block px-4 py-3 rounded-xl font-medium text-base cursor-pointer clickable-text-underline',
                          // Consistent with desktop nav colors
                          'text-muted-foreground hover:text-foreground',
                          'hover:bg-accent/50 active:bg-accent/70',
                          'relative overflow-hidden',
                        )}
                        href={link.href}
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        <span className="relative z-10">{link.label}</span>
                        <motion.div
                          className="absolute inset-0 bg-gradient-to-r from-primary/8 via-accent/8 to-primary/8"
                          initial={{ x: '-100%' }}
                          transition={{ duration: 0.5, ease: 'easeOut' }}
                          whileHover={{ x: '0%' }}
                        />
                      </Link>
                    </motion.div>
                  </motion.div>
                ))}
              </div>

              <motion.div
                animate={{ scaleX: 1 }}
                className="h-px bg-gradient-to-r from-transparent via-border to-transparent my-6"
                initial={{ scaleX: 0 }}
                transition={{ delay: 0.5, duration: 0.5 }}
              />

              <motion.div
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between gap-4"
                initial={{ opacity: 0, y: 20 }}
                transition={{ delay: 0.6, duration: 0.4 }}
              >
                <ThemeToggle />
                <motion.div
                  className="flex-1"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <div className="flex flex-col items-center w-full">
                    <Button
                      asChild
                      className="w-full"
                      size="xl"
                      variant="cta"
                      onClick={() => {
                        handleDownloadClick('header_mobile');
                        setMobileMenuOpen(false);
                      }}
                    >
                      <Link href="/download" className="no-hover-effect cursor-pointer">
                        Download for Mac
                      </Link>
                    </Button>
                    <span className="text-xs text-muted-foreground mt-2">Windows coming soon</span>
                  </div>
                </motion.div>
              </motion.div>
            </motion.nav>
          </>
        )}
      </AnimatePresence>
    </>
  );
}