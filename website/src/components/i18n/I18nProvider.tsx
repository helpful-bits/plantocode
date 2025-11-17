'use client';

import React, { createContext, useContext, useMemo } from 'react';
import type { Locale } from '@/lib/i18n';
import { getByPath } from '@/lib/i18n';
import { renderBold } from './RichText';

type MessagesMap = Record<string, any>;
type I18nContextValue = {
  locale: Locale;
  messages: MessagesMap;
  t: (key: string, fallback?: any) => any;
  tRich: (key: string, fallback?: string) => React.ReactNode;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  locale,
  initialMessages,
  children,
}: {
  locale: Locale;
  initialMessages: MessagesMap;
  children: React.ReactNode;
}) {
  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      messages: initialMessages ?? {},
      t: (key: string, fallback?: any): any => {
        const m = initialMessages ?? {};
        const result = getByPath(m, key);
        if (result !== undefined) {
          return result;
        }
        return fallback ?? '';
      },
      tRich: (key: string, fallback?: string): React.ReactNode => {
        const m = initialMessages ?? {};
        const result = getByPath(m, key);
        const text = result !== undefined ? result : (fallback ?? '');
        return renderBold(text);
      },
    }),
    [locale, initialMessages]
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
