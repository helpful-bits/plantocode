import { defineRouting } from 'next-intl/routing';
import { locales, defaultLocale, localePrefix } from './config';

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix
});
