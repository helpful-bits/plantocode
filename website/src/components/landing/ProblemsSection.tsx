'use client';

import Link from 'next/link';
import { useMessages } from '@/components/i18n/useMessages';
import { GlassCard } from '@/components/ui/GlassCard';

export function ProblemsSection() {
  const { t } = useMessages();

  const problems = [
    {
      key: 'hardBugs',
      href: '/solutions/hard-bugs',
    },
    {
      key: 'largeFeatures',
      href: '/solutions/large-features',
    },
    {
      key: 'libraryUpgrades',
      href: '/solutions/library-upgrades',
    },
    {
      key: 'legacyRefactoring',
      href: '/solutions/legacy-code-refactoring',
    },
    {
      key: 'safeRefactoring',
      href: '/solutions/safe-refactoring',
    },
    {
      key: 'preventDuplicates',
      href: '/solutions/prevent-duplicate-files',
    },
    {
      key: 'browseAll',
      href: '/solutions',
    },
  ] as const;

  return (
    <section className="py-16 px-4">
      <div className="container mx-auto max-w-6xl">
        <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">
          {t('problems.title', 'Solve Complex Development Challenges')}
        </h2>
        <p className="text-lg text-center text-foreground/80 mb-12 max-w-3xl mx-auto">
          {t('problems.subtitle', 'Real solutions for the hardest problems in software development')}
        </p>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {problems.map(({ key, href }) => (
            <GlassCard key={key} className="p-6" highlighted>
              <h3 className="text-xl font-semibold mb-3">
                {t(`problems.cards.${key}.title`)}
              </h3>
              <p className="text-foreground/80 mb-4 text-sm">
                {t(`problems.cards.${key}.description`)}
              </p>
              <Link
                href={href}
                className="text-primary hover:underline text-sm font-medium"
              >
                {t(`problems.cards.${key}.link`)}
              </Link>
            </GlassCard>
          ))}
        </div>
      </div>
    </section>
  );
}
