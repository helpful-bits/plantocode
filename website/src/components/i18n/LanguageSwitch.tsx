'use client';
import { useState, useRef, useEffect } from 'react';
import { usePathname } from '@/i18n/navigation';
import { useLocale } from 'next-intl';
import { locales, type Locale } from '@/i18n/config';
import { removeLocalePrefix } from '@/i18n/routing';
import { ChevronDown, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
  ko: '한국어',
  ja: '日本語',
};

const LOCALE_FLAGS: Record<Locale, string> = {
  en: '🇬🇧',
  de: '🇩🇪',
  es: '🇪🇸',
  fr: '🇫🇷',
  ko: '🇰🇷',
  ja: '🇯🇵',
};

export function LanguageSwitch() {
  const pathname = usePathname();
  const currentLocale = useLocale() as Locale;
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 150);
  };

  const handleLocaleChange = (locale: Locale) => {
    // Guard: if already on the selected locale, just close the dropdown
    if (locale === currentLocale) {
      setIsOpen(false);
      return;
    }

    // Use window.location.pathname instead of usePathname() to get the full path with locale
    const actualPathname = typeof window !== 'undefined' ? window.location.pathname : pathname;

    // Remove any existing locale prefix first to avoid duplication
    const cleanPathname = removeLocalePrefix(actualPathname);

    // Build the localized path manually for the target locale
    const nextHref = locale === 'en' ? cleanPathname : `/${locale}${cleanPathname}`;

    // Use hard navigation to ensure proper locale switching
    if (typeof window !== 'undefined') {
      window.location.href = nextHref;
    }

    setIsOpen(false);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={dropdownRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        className={cn(
          'flex items-center gap-1.5 px-3 py-2 rounded-lg',
          'text-sm font-medium',
          'hover:bg-primary/10 transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          'min-h-[44px]'
        )}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Globe className="w-4 h-4" />
        <span>{currentLocale.toUpperCase()}</span>
        <ChevronDown
          className={cn(
            'w-4 h-4 transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className={cn(
              'absolute right-0 mt-2 w-48',
              'bg-background/95 backdrop-blur-xl',
              'border border-border rounded-lg shadow-lg',
              'overflow-hidden z-50'
            )}
          >
            {locales.map((locale) => (
              <button
                key={locale}
                type="button"
                onClick={() => handleLocaleChange(locale)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3',
                  'text-left text-sm',
                  'hover:bg-primary/10 transition-colors',
                  'focus-visible:outline-none focus-visible:bg-primary/10',
                  currentLocale === locale && 'bg-primary/5'
                )}
              >
                <span className="text-xl">{LOCALE_FLAGS[locale]}</span>
                <span className={cn(
                  'flex-1',
                  currentLocale === locale && 'font-semibold text-primary'
                )}>
                  {LOCALE_LABELS[locale]}
                </span>
                {currentLocale === locale && (
                  <span className="text-primary">✓</span>
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
