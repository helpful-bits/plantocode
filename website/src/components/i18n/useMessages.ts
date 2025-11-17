'use client';

import { useI18n } from './I18nProvider';

export function useMessages() {
  const { t, tRich, locale } = useI18n();
  return { t, tRich, locale };
}
