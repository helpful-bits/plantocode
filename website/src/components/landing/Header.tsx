'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from '@/i18n/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Sparkles, ChevronDown, Terminal, GitMerge, Code2, Mic, Search, FileSearch, Copy, LucideIcon, TrendingUp, Download, HelpCircle, History, Info, Github } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DownloadButton } from '@/components/ui/DownloadButton';
import { MacDownloadButton } from '@/components/ui/MacDownloadButton';
import { WindowsStoreButton } from '@/components/ui/WindowsStoreButton';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { LanguageSwitch } from '@/components/i18n/LanguageSwitch';
import { useMessages } from '@/components/i18n/useMessages';
import { usePlatformDetection } from '@/hooks/usePlatformDetection';
import { cn } from '@/lib/utils';
import { defaultEase, defaultDuration } from '@/lib/animations';
import { GITHUB_REPO_URL } from '@/lib/brand';

interface DropdownItem {
  href: string;
  label: string;
  icon?: LucideIcon;
  description?: string;
  external?: boolean;
}

interface NavLinkDropdown {
  label: string;
  dropdown: true;
  href?: undefined;
  items: DropdownItem[];
  external?: never;
}

interface NavLinkDirect {
  label: string;
  href: string;
  dropdown: false;
  items?: never;
  external?: boolean;
}

type NavLink = NavLinkDropdown | NavLinkDirect;

export function Header() {
  const { t } = useMessages();
  const { isWindows, isMac } = usePlatformDetection();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const dropdownTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const getLocation = (surface: 'desktop' | 'mobile') => `header_${surface}`;

  useEffect(() => {
    setMounted(true);
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

  const handleMouseEnter = (dropdown: string) => {
    if (dropdownTimeoutRef.current) {
      clearTimeout(dropdownTimeoutRef.current);
    }
    setActiveDropdown(dropdown);
  };

  const handleMouseLeave = () => {
    if (dropdownTimeoutRef.current) {
      clearTimeout(dropdownTimeoutRef.current);
    }
    dropdownTimeoutRef.current = setTimeout(() => {
      setActiveDropdown(null);
    }, 150);
  };

  const navLinks: NavLink[] = [
    { href: '/docs', label: t('nav.docs'), dropdown: false },
    { href: '/architecture', label: t('nav.architecture'), dropdown: false },
    { href: '/docs/runtime-walkthrough', label: t('nav.runtimeWalkthrough'), dropdown: false },
    {
      label: t('nav.features'),
      dropdown: true,
      items: [
        { href: '/docs/file-discovery', label: t('feature.fileDiscovery.label'), icon: FileSearch, description: t('feature.fileDiscovery.description') },
        { href: '/docs/deep-research', label: t('feature.deepResearch.label'), icon: Search, description: t('feature.deepResearch.description') },
        { href: '/docs/implementation-plans', label: t('feature.planEditor.label'), icon: Code2, description: t('feature.planEditor.description') },
        { href: '/docs/merge-instructions', label: t('feature.mergeInstructions.label'), icon: GitMerge, description: t('feature.mergeInstructions.description') },
        { href: '/docs/copy-buttons', label: t('feature.copyButtons.label'), icon: Copy, description: t('feature.copyButtons.description') },
        { href: '/docs/text-improvement', label: t('feature.textImprovement.label'), icon: Sparkles, description: t('feature.textImprovement.description') },
        { href: '/docs/voice-transcription', label: t('feature.voiceTranscription.label'), icon: Mic, description: t('feature.voiceTranscription.description') },
        { href: '/docs/terminal-sessions', label: t('feature.integratedTerminal.label'), icon: Terminal, description: t('feature.integratedTerminal.description') },
      ]
    },
    {
      label: t('nav.more'),
      dropdown: true,
      items: [
        { href: '/evolution', label: t('nav.evolution'), icon: TrendingUp, description: t('nav.evolutionDescription') },
        { href: '/downloads', label: t('nav.downloads'), icon: Download, description: t('nav.downloadsDescription') },
        { href: '/support', label: t('footer.support'), icon: HelpCircle, description: t('nav.supportDescription') },
        { href: '/changelog', label: t('footer.changelog'), icon: History, description: t('nav.changelogDescription') },
        { href: '/about', label: t('footer.about'), icon: Info, description: t('nav.aboutDescription') },
        { href: GITHUB_REPO_URL, label: t('nav.source'), icon: Github, description: t('nav.sourceDescription'), external: true },
      ],
    },
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
            'absolute inset-0 -z-10',
            scrolled ? 'glass' : 'bg-transparent',
          )}
        />
        <div className="relative z-10 container mx-auto flex h-16 md:h-20 items-center justify-between px-4 sm:px-6 lg:px-8">
            {/* Logo */}
            <motion.div
              className="flex-shrink-0"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Link
                className={cn(
                  'group inline-flex items-center gap-2 sm:gap-3 font-bold text-base sm:text-lg md:text-xl lg:text-2xl cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-lg',
                  scrolled
                    ? 'text-foreground hover:text-primary'
                    : 'text-foreground hover:text-primary drop-shadow-lg',
                )}
                href="/"
                aria-label={t('aria.homePageLink')}
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
                {/* App name */}
                <span
                  className="font-extrabold whitespace-nowrap text-sm sm:text-base md:text-xl lg:text-2xl"
                  style={{
                    background: 'linear-gradient(90deg, var(--color-primary) 0%, var(--color-adaptive-accent) 50%, var(--color-primary) 100%)',
                    backgroundSize: '200% auto',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    animation: 'gradient-shift 3s ease infinite',
                    filter: 'drop-shadow(0 0 12px color-mix(in oklch, var(--color-primary) 40%, transparent)) drop-shadow(0 0 24px color-mix(in oklch, var(--color-primary) 20%, transparent))'
                  }}
                >
                  PlanToCode
                </span>
              </Link>
            </motion.div>

            {/* Desktop Navigation and Actions Container */}
            <div className="hidden md:flex items-center gap-4 lg:gap-6">
              {/* Navigation Links */}
              <nav className="flex items-center gap-0.5 lg:gap-1">
              {navLinks.map((link, index) => (
                <motion.div
                  key={link.label}
                  animate={{ opacity: 1, y: 0 }}
                  initial={{ opacity: 0, y: -20 }}
                  transition={{ delay: index * 0.1 + 0.3, duration: defaultDuration, ease: defaultEase }}
                  className="relative"
                  onMouseEnter={() => link.dropdown && handleMouseEnter(link.label)}
                  onMouseLeave={handleMouseLeave}
                >
                  {link.dropdown ? (
                    <>
                      <button
                        className={cn(
                          'relative px-2.5 lg:px-3 py-2 rounded-xl font-medium text-sm lg:text-base',
                          'group nav-link-hover cursor-pointer flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 min-h-[44px] whitespace-nowrap',
                          scrolled
                            ? 'text-foreground/75 dark:text-foreground/85 hover:text-foreground font-medium'
                            : 'text-foreground/90 hover:text-foreground drop-shadow-md',
                        )}
                        aria-expanded={activeDropdown === link.label}
                        aria-haspopup="true"
                      >
                        <span>{link.label}</span>
                        <ChevronDown className={cn(
                          'w-4 h-4 transition-transform',
                          activeDropdown === link.label && 'rotate-180'
                        )} />
                      </button>
                      <AnimatePresence>
                        {activeDropdown === link.label && (
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            style={{ backgroundColor: 'var(--color-popover)' }}
                            className="absolute top-full left-0 mt-2 w-72 rounded-xl p-3 shadow-xl border border-border z-50 backdrop-blur-xl"
                          >
                            <div className="flex flex-col">
                              {link.items?.map((item) => {
                                const Icon = item.icon;
                                const itemClassName = cn(
                                  'flex gap-3 px-3 py-2 rounded-lg hover:bg-primary/10 transition-colors group',
                                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary min-h-[44px]',
                                  item.description ? 'items-start' : 'items-center',
                                );
                                const content = (
                                  <>
                                    {Icon && (
                                      <div className="p-1.5 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors mt-0.5">
                                        <Icon className="w-4 h-4 text-primary" />
                                      </div>
                                    )}
                                    <div className="flex-1">
                                      <div className="font-medium text-sm text-foreground">{item.label}</div>
                                      {item.description && (
                                        <div className="text-xs text-muted-foreground mt-0.5">{item.description}</div>
                                      )}
                                    </div>
                                  </>
                                );
                                return item.external ? (
                                  <a
                                    key={item.href}
                                    href={item.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={itemClassName}
                                  >
                                    {content}
                                  </a>
                                ) : (
                                  <Link
                                    key={item.href}
                                    href={item.href}
                                    className={itemClassName}
                                  >
                                    {content}
                                  </Link>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </>
                  ) : link.external ? (
                    <a
                      className={cn(
                        'relative px-2.5 lg:px-3 py-2 rounded-xl font-medium text-sm lg:text-base',
                        'group nav-link-hover cursor-pointer flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 min-h-[44px] whitespace-nowrap',
                        scrolled
                          ? 'text-foreground/75 dark:text-foreground/85 hover:text-foreground font-medium'
                          : 'text-foreground/90 hover:text-foreground drop-shadow-md',
                      )}
                      href={link.href!}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <motion.span
                        className="relative z-10"
                        transition={{ type: 'spring', stiffness: 400, damping: 10 }}
                        whileHover={{ scale: 1.05 }}
                      >
                        {link.label}
                      </motion.span>
                    </a>
                  ) : (
                    <Link
                      className={cn(
                        'relative px-2.5 lg:px-3 py-2 rounded-xl font-medium text-sm lg:text-base',
                        'group nav-link-hover cursor-pointer clickable-text-underline whitespace-nowrap',
                        'flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 min-h-[44px]',
                        scrolled
                          ? 'text-foreground/75 dark:text-foreground/85 hover:text-foreground font-medium'
                          : 'text-foreground/90 hover:text-foreground drop-shadow-md',
                      )}
                      href={link.href!}
                    >
                      <motion.span
                        className="relative z-10"
                        transition={{ type: 'spring', stiffness: 400, damping: 10 }}
                        whileHover={{ scale: 1.05 }}
                      >
                        {link.label}
                      </motion.span>
                    </Link>
                  )}
                </motion.div>
              ))}
              </nav>

              {/* Divider */}
              <motion.div
                animate={{ opacity: 1, scaleY: 1 }}
                className="w-px h-6 bg-border/50"
                initial={{ opacity: 0, scaleY: 0 }}
                transition={{ delay: 0.6, duration: 0.3 }}
              />

              {/* Actions Group */}
              <motion.div
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2"
                initial={{ opacity: 0, x: 20 }}
                transition={{ delay: 0.7, duration: defaultDuration, ease: defaultEase }}
              >
                <LanguageSwitch />

                <ThemeToggle />

                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  {isWindows ? (
                    <WindowsStoreButton size="small" />
                  ) : isMac ? (
                    <MacDownloadButton
                      size="sm"
                      location={getLocation('desktop')}
                    />
                  ) : (
                    <DownloadButton
                      size="sm"
                      variant="cta"
                      location={getLocation('desktop')}
                    />
                  )}
                </motion.div>
              </motion.div>
            </div>

            {/* Mobile actions */}
            <div className="flex md:hidden items-center gap-2.5">
              <LanguageSwitch />
              <ThemeToggle />
              <motion.button
                animate={{ opacity: 1 }}
                aria-label={t('aria.toggleMenu')}
                aria-expanded={mobileMenuOpen}
                className={cn(
                  'relative p-2 rounded-xl min-h-[44px] min-w-[44px] flex items-center justify-center',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
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
                // Theme-aware background colors with full opacity
                'bg-popover backdrop-blur-xl border border-border/60',
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
                className="absolute top-3 right-3 p-2 rounded-full bg-background/80 hover:bg-background border border-border/50 hover:border-primary/50 transition-all z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label={t('aria.closeMenu')}
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>

              <nav className="flex flex-col items-center gap-4 py-4">
                {navLinks.map((link, index) => (
                  <motion.div
                    key={link.label}
                    animate={{ opacity: 1, x: 0 }}
                    initial={{ opacity: 0, x: -30 }}
                    transition={{
                      delay: index * 0.1 + 0.1,
                      duration: 0.4,
                      type: 'spring',
                      stiffness: 100,
                    }}
                  >
                    {link.dropdown ? (
                      <>
                        <div className="px-4 py-2 font-semibold text-sm text-popover-foreground/60 uppercase tracking-wider">
                          {link.label}
                        </div>
                        <div className="pl-4 space-y-1">
                          {link.items?.map((item) => {
                            const Icon = item.icon;
                            const itemClassName = cn(
                              'flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer',
                              'text-popover-foreground hover:text-primary',
                              'hover:bg-primary/10 active:bg-primary/20',
                              'relative overflow-hidden',
                              'transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 min-h-[44px]',
                            );
                            const content = (
                              <>
                                {Icon && <Icon className="w-4 h-4 text-primary flex-shrink-0" />}
                                <div className="flex-1">
                                  <div className="font-medium text-sm text-popover-foreground">{item.label}</div>
                                  {item.description && (
                                    <div className="text-xs text-popover-foreground/70 mt-0.5">{item.description}</div>
                                  )}
                                </div>
                              </>
                            );
                            return (
                              <motion.div
                                key={item.href}
                                whileHover={{ scale: 1.02, x: 5 }}
                                whileTap={{ scale: 0.98 }}
                              >
                                {item.external ? (
                                  <a
                                    href={item.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={itemClassName}
                                    onClick={() => setMobileMenuOpen(false)}
                                  >
                                    {content}
                                  </a>
                                ) : (
                                  <Link
                                    href={item.href}
                                    className={itemClassName}
                                    onClick={() => setMobileMenuOpen(false)}
                                  >
                                    {content}
                                  </Link>
                                )}
                              </motion.div>
                            );
                          })}
                        </div>
                      </>
                    ) : link.external ? (
                      <motion.div
                        whileHover={{ scale: 1.02, x: 5 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <a
                          className={cn(
                            'block px-4 py-3.5 rounded-xl font-semibold text-lg cursor-pointer',
                            'text-primary hover:text-primary/80',
                            'hover:bg-primary/10 active:bg-primary/20',
                            'relative overflow-hidden',
                            'transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 min-h-[44px] flex items-center',
                          )}
                          href={link.href!}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          <span className="relative z-10">{link.label}</span>
                          <motion.div
                            className="absolute inset-0 bg-gradient-to-r from-primary/8 via-accent/8 to-primary/8"
                            initial={{ x: '-100%' }}
                            transition={{ duration: 0.5, ease: 'easeOut' }}
                            whileHover={{ x: '0%' }}
                          />
                        </a>
                      </motion.div>
                    ) : (
                      <motion.div
                        whileHover={{ scale: 1.02, x: 5 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <Link
                          className={cn(
                            'block px-4 py-3.5 rounded-xl font-semibold text-lg cursor-pointer',
                            'text-primary hover:text-primary/80',
                            'hover:bg-primary/10 active:bg-primary/20',
                            'relative overflow-hidden',
                            'transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 min-h-[44px] flex items-center',
                          )}
                          href={link.href!}
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
                    )}
                  </motion.div>
                ))}
              </nav>

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
                  <LanguageSwitch />
                  <ThemeToggle />
                  <motion.div className="flex-1" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button asChild className="w-full" size="lg" variant="outline" onClick={() => setMobileMenuOpen(false)}>
                      <Link href="/docs" className="no-hover-effect cursor-pointer">{t('nav.docs')}</Link>
                    </Button>
                  </motion.div>
                </div>

                <motion.div
                  className="w-full"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div onClick={() => setMobileMenuOpen(false)}>
                    {isWindows ? (
                      <div className="w-full flex justify-center">
                        <WindowsStoreButton size="small" />
                      </div>
                    ) : isMac ? (
                      <div className="w-full flex justify-center">
                        <MacDownloadButton
                          size="lg"
                          location={getLocation('mobile')}
                        />
                      </div>
                    ) : (
                      <DownloadButton
                        className="w-full"
                        size="lg"
                        variant="cta"
                        location={getLocation('mobile')}
                      />
                    )}
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
