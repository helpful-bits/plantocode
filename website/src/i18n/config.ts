// Centralized i18n constants (used by middleware and pages)
export const LOCALES = ['en', 'de', 'fr', 'es'] as const;
export type Locale = typeof LOCALES[number];
export const defaultLocale: Locale = 'en';
export const localePrefix = 'as-needed';

// Lowercase alias for compatibility with existing code
export const locales = LOCALES;
