'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { cn } from '@/lib/utils';

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
        className="fixed top-0 inset-x-0 z-50"
      >
        {/* Background layer */}
        <div 
          className={cn(
            'absolute inset-0 transition-all duration-700 ease-out',
            scrolled ? 'glass backdrop-blur-md' : 'bg-transparent'
          )}
        />
        <div className="relative container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            {/* Logo */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Link 
                href="/" 
                className={cn(
                  'group flex items-center gap-3 font-bold text-xl lg:text-2xl transition-all duration-500 cursor-pointer',
                  scrolled
                    ? 'text-foreground hover:text-primary'
                    : 'text-foreground hover:text-primary drop-shadow-lg'
                )}
              >
                <motion.div 
                  className={cn(
                    'flex items-center justify-center w-8 h-8 lg:w-10 lg:h-10 rounded-xl transition-all duration-500',
                    'bg-gradient-to-br from-primary via-primary/90 to-accent',
                    'group-hover:shadow-lg group-hover:shadow-primary/25'
                  )}
                  whileHover={{ rotate: 12, scale: 1.1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 10 }}
                >
                  <Sparkles className="w-4 h-4 lg:w-5 lg:h-5 text-primary-foreground" />
                </motion.div>
                <span className="bg-gradient-to-r from-current to-primary bg-clip-text">
                  Vibe Manager
                </span>
              </Link>
            </motion.div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1 lg:gap-2">
              {navLinks.map((link, index) => (
                <motion.div
                  key={link.href}
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 + 0.3, duration: 0.5 }}
                >
                  <Link
                    href={link.href}
                    className={cn(
                      'relative px-3 lg:px-4 py-2 rounded-xl font-medium text-sm lg:text-base',
                      'group nav-link-hover cursor-pointer',
                      scrolled
                        ? 'text-muted-foreground hover:text-foreground'
                        : 'text-foreground/90 hover:text-foreground drop-shadow-md'
                    )}
                    style={{
                      transition: 'all 0.5s ease-out'
                    }}
                  >
                    <motion.span 
                      className="relative z-10"
                      whileHover={{ scale: 1.05 }}
                      transition={{ type: "spring", stiffness: 400, damping: 10 }}
                    >
                      {link.label}
                    </motion.span>
                  </Link>
                </motion.div>
              ))}
              
              <motion.div 
                className="w-px h-6 bg-border/50 mx-2"
                initial={{ opacity: 0, scaleY: 0 }}
                animate={{ opacity: 1, scaleY: 1 }}
                transition={{ delay: 0.6, duration: 0.3 }}
              />
              
              <motion.div 
                className="flex items-center gap-2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.7, duration: 0.5 }}
              >
                <ThemeToggle />
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Button 
                    asChild 
                    variant="cta"
                    size="lg"
                    className="ml-2 relative"
                  >
                    <Link href="/download">
                      Download Free
                    </Link>
                  </Button>
                </motion.div>
              </motion.div>
            </nav>

            {/* Mobile menu button */}
            <motion.button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className={cn(
                'md:hidden relative p-2.5 rounded-xl transition-all duration-500',
                'focus:outline-none focus:ring-2 focus:ring-primary/50',
                scrolled
                  ? 'glass text-foreground'
                  : 'bg-foreground/10 backdrop-blur-sm text-foreground hover:bg-foreground/20'
              )}
              aria-label="Toggle menu"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.5 }}
            >
              <AnimatePresence mode="wait">
                {mobileMenuOpen ? (
                  <motion.div
                    key="close"
                    initial={{ rotate: -90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: 90, opacity: 0 }}
                    transition={{ duration: 0.3, type: "spring", stiffness: 200 }}
                  >
                    <X className="w-5 h-5" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="menu"
                    initial={{ rotate: 90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: -90, opacity: 0 }}
                    transition={{ duration: 0.3, type: "spring", stiffness: 200 }}
                  >
                    <Menu className="w-5 h-5" />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>
          </div>
        </div>
      </motion.header>

      {/* Mobile Navigation Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-md md:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
            
            {/* Mobile Menu */}
            <motion.nav
              initial={{ opacity: 0, y: -30, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -30, scale: 0.9 }}
              transition={{ 
                duration: 0.4, 
                ease: [0.25, 0.1, 0.25, 1],
                opacity: { duration: 0.3 }
              }}
              className={cn(
                'fixed top-20 inset-x-4 z-50 md:hidden',
                'glass',
                'rounded-2xl',
                'p-6',
                scrolled && 'top-[72px]'
              )}
            >
              <div className="space-y-2">
                {navLinks.map((link, index) => (
                  <motion.div
                    key={link.href}
                    initial={{ opacity: 0, x: -30 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ 
                      delay: index * 0.1 + 0.1, 
                      duration: 0.4,
                      type: "spring",
                      stiffness: 100
                    }}
                  >
                    <motion.div
                      whileHover={{ scale: 1.02, x: 5 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Link
                        href={link.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={cn(
                          'block px-4 py-3 rounded-xl font-medium text-base cursor-pointer',
                          'text-foreground hover:text-primary',
                          'nav-link-hover',
                          'transition-all duration-500 relative overflow-hidden'
                        )}
                      >
                        <span className="relative z-10">{link.label}</span>
                        <motion.div 
                          className="absolute inset-0 bg-gradient-to-r from-primary/5 via-accent/5 to-primary/5"
                          initial={{ x: "-100%" }}
                          whileHover={{ x: "0%" }}
                          transition={{ duration: 0.5, ease: "easeOut" }}
                        />
                      </Link>
                    </motion.div>
                  </motion.div>
                ))}
              </div>
              
              <motion.div 
                className="h-px bg-gradient-to-r from-transparent via-border/50 to-transparent my-6"
                style={{ backgroundColor: 'transparent' }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.5, duration: 0.5 }}
              />
              
              <motion.div 
                className="flex items-center justify-between gap-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.4 }}
              >
                <ThemeToggle />
                <motion.div
                  className="flex-1"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button 
                    asChild 
                    variant="cta"
                    size="xl"
                    className="w-full"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Link href="/download">
                      Download Free
                    </Link>
                  </Button>
                </motion.div>
              </motion.div>
            </motion.nav>
          </>
        )}
      </AnimatePresence>
    </>
  );
}