'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { cn } from '@/lib/utils';
import { defaultEase, defaultDuration } from '@/lib/animations';
import { track } from '@/lib/track';

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMac, setIsMac] = useState(true);
  const [mounted, setMounted] = useState(false);

  const handleDownloadClick = async (e: React.MouseEvent, location: string) => {
    e.preventDefault();
    // Track download click on client-side to preserve user context
    await track({ 
      event: 'download_click', 
      props: { 
        location,
        platform: 'mac',
        version: 'latest'
      } 
    });
    // Redirect to download endpoint
    window.location.href = `/api/download/mac?source=${location}`;
  };

  useEffect(() => {
    setMounted(true);
    try {
      const plat = (navigator as any)?.userAgentData?.platform || navigator.platform || navigator.userAgent || '';
      setIsMac(/mac/i.test(plat));
    } catch {
      setIsMac(true);
    }
  }, []);

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
    { href: '/docs', label: 'Docs' },
    { href: '#how-it-works', label: 'How It Works' },
    { href: '#features', label: 'Features' },
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

            {/* Promo Badge - Tailwind CSS 4 optimized */}
            <div className="hidden md:flex items-center">
              <motion.div
                animate={{ opacity: 1, scale: 1 }}
                initial={{ opacity: 0, scale: 0.8 }}
                transition={{ delay: 0.5, duration: 0.3, type: 'spring' }}
                className="relative isolate overflow-hidden rounded-full px-3 lg:px-6 py-2 lg:py-3 mr-2 lg:mr-4"
                whileHover={{ scale: 1.05 }}
              >
                {/* Modern gradient background with improved performance */}
                <div className="absolute inset-0 -z-10 bg-gradient-to-r from-orange-500 via-pink-500 to-pink-600" />
                
                {/* Glossy effect overlay */}
                <div className="absolute inset-0 -z-10 bg-gradient-to-b from-white/25 via-transparent to-transparent opacity-90" />
                
                {/* Content */}
                <div className="relative flex items-center gap-1 lg:gap-2">
                  <span className="text-base lg:text-xl drop-shadow-md" role="img" aria-label="gift">🎁</span>
                  <span className="text-white text-xs lg:text-sm font-black tracking-wide lg:tracking-wider uppercase drop-shadow-md whitespace-nowrap">
                    $10 FREE
                  </span>
                </div>
                
                {/* Enhanced shadow effect - only on larger screens */}
                <div className="hidden lg:block absolute inset-0 -z-20 blur-xl bg-gradient-to-r from-orange-400/50 via-pink-400/50 to-pink-500/50 translate-y-2" />
              </motion.div>
            </div>

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
                        ? 'text-foreground/75 dark:text-foreground/85 hover:text-foreground font-medium'
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
                {!isMac && (
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Button asChild size="lg" variant="gradient-outline">
                      <Link href="#how-it-works" className="no-hover-effect cursor-pointer">Try Demo</Link>
                    </Button>
                  </motion.div>
                )}
                <div className="flex flex-col items-center justify-center ml-2">
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Button
                      className="relative"
                      size="sm"
                      variant="cta"
                      onClick={(e) => handleDownloadClick(e, 'header_desktop')}
                    >
                      <span className="no-hover-effect cursor-pointer text-sm">
                        Download for Mac
                      </span>
                    </Button>
                  </motion.div>
                  <div className="flex flex-col items-center gap-0.5 mt-0.5">
                    <em className="text-[10px] text-foreground/70 dark:text-foreground/85 font-medium">Signed & notarized for macOS</em>
                    <a href="mailto:support@vibemanager.app?subject=Windows%20Waitlist" className="text-[10px] text-foreground/70 dark:text-foreground/85 hover:text-primary font-medium">Join Windows waitlist</a>
                  </div>
                </div>
              </motion.div>
            </nav>

            {/* Mobile actions */}
            <div className="flex md:hidden items-center gap-2">
              {/* Mobile Promo Badge - Tailwind CSS 4 optimized */}
              <motion.div
                animate={{ opacity: 1, scale: 1 }}
                initial={{ opacity: 0, scale: 0.8 }}
                transition={{ delay: 0.3, duration: 0.3, type: 'spring' }}
                className="relative isolate overflow-hidden rounded-full px-4 py-2"
              >
                {/* Modern gradient background */}
                <div className="absolute inset-0 -z-10 bg-gradient-to-r from-orange-500 via-pink-500 to-pink-600" />
                
                {/* Glossy effect overlay */}
                <div className="absolute inset-0 -z-10 bg-gradient-to-b from-white/20 to-transparent" />
                
                {/* Content */}
                <div className="relative flex items-center gap-1.5">
                  <span className="text-lg drop-shadow" role="img" aria-label="gift">🎁</span>
                  <span className="text-white text-[11px] font-black tracking-wide uppercase">
                    $10 FREE
                  </span>
                </div>
              </motion.div>
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

      {/* Mobile Navigation Menu - Portal Based */}
      {mounted && mobileMenuOpen && createPortal(
        <AnimatePresence>
          <>
            {/* Backdrop */}
            <motion.div
              animate={{ opacity: 1 }}
              className="fixed inset-0 z-40 bg-background/60 backdrop-blur-md md:hidden"
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: '100vw',
                height: '100vh'
              }}
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              transition={{ duration: defaultDuration * 0.6, ease: defaultEase }}
              onClick={() => setMobileMenuOpen(false)}
            />

            {/* Mobile Menu */}
            <motion.nav
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={cn(
                'fixed z-50 md:hidden',
                'glass',
                'rounded-2xl',
                'p-6 sm:p-8',
                // Enhanced background for light mode visibility
                'bg-card/98 dark:bg-background/95 backdrop-blur-xl border border-border/60',
                'shadow-2xl shadow-black/20 dark:shadow-black/40',
                'overflow-y-auto',
              )}
              style={{
                position: 'fixed',
                top: '5rem', // Account for header height in viewport
                left: '1rem',
                right: '1rem',
                maxWidth: 'calc(100vw - 2rem)',
                maxHeight: 'calc(100vh - 6rem)',
              }}
              exit={{ opacity: 0, y: -30, scale: 0.9 }}
              initial={{ opacity: 0, y: -30, scale: 0.9 }}
              transition={{
                duration: defaultDuration * 0.8,
                ease: defaultEase,
                opacity: { duration: defaultDuration * 0.6 },
              }}
            >
              {/* Close button inside the menu */}
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="absolute top-3 right-3 p-2 rounded-full bg-background/80 hover:bg-background border border-border/50 hover:border-primary/50 transition-all z-10"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="space-y-1">
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
                          'block px-4 py-3.5 rounded-xl font-semibold text-lg cursor-pointer',
                          // Consistent teal/primary color
                          'text-primary hover:text-primary/80',
                          'hover:bg-primary/10 active:bg-primary/20',
                          'relative overflow-hidden',
                          'transition-all duration-200',
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
                className="h-px bg-gradient-to-r from-transparent via-border/50 to-transparent my-5"
                initial={{ scaleX: 0 }}
                transition={{ delay: 0.5, duration: 0.5 }}
              />

              <motion.div
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-3"
                initial={{ opacity: 0, y: 20 }}
                transition={{ delay: 0.6, duration: 0.4 }}
              >
                <div className="flex items-center gap-3">
                  <ThemeToggle />
                  <motion.div className="flex-1" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button asChild className="w-full" size="lg" variant="outline" onClick={() => setMobileMenuOpen(false)}>
                      <Link href="/docs" className="no-hover-effect cursor-pointer">Docs</Link>
                    </Button>
                  </motion.div>
                  <motion.div className="flex-1" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button asChild className="w-full" size="lg" variant="gradient-outline" onClick={() => setMobileMenuOpen(false)}>
                      <Link href="#how-it-works" className="no-hover-effect cursor-pointer">Try Demo</Link>
                    </Button>
                  </motion.div>
                </div>
                
                <motion.div
                  className="w-full"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    className="w-full"
                    size="lg"
                    variant="cta"
                    onClick={(e) => {
                      handleDownloadClick(e, 'header_mobile');
                      setMobileMenuOpen(false);
                    }}
                  >
                    <span className="no-hover-effect cursor-pointer">
                      Download for Mac
                    </span>
                  </Button>
                  <div className="flex flex-col items-center gap-0.5 mt-2">
                    <em className="text-xs text-foreground/70 dark:text-foreground/85 font-medium">Signed & notarized for macOS</em>
                    <a href="mailto:support@vibemanager.app?subject=Windows%20Waitlist" className="text-xs text-foreground/70 dark:text-foreground/85 hover:text-primary font-medium">Join Windows waitlist</a>
                  </div>
                </motion.div>
              </motion.div>
            </motion.nav>
          </>
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}