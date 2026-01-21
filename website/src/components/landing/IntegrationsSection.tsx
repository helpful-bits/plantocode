'use client';

import { GlassCard } from '@/components/ui/GlassCard';
import { useMessages } from '@/components/i18n/useMessages';
import { Link } from '@/i18n/navigation';
import { GITHUB_REPO_URL } from '@/lib/brand';

export function IntegrationsSection() {
  const { t } = useMessages();

  return (
    <section className="py-16 px-4 bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto max-w-6xl">
        <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">
          {t('integrations.title')}
        </h2>
        <p className="text-lg text-center text-foreground/80 mb-12 max-w-3xl mx-auto">
          {t('integrations.subtitle')}
        </p>
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <GlassCard className="p-6">
            <h3 className="text-xl font-semibold mb-3">
              {t('integrations.cards.claudeCode.title')}
            </h3>
            <p className="text-foreground/80 mb-4 text-sm">
              {t('integrations.cards.claudeCode.description')}
            </p>
            <Link href="/docs/prompt-types" className="text-primary hover:underline text-sm font-medium">
              {t('integrations.cards.claudeCode.link')}
            </Link>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="text-xl font-semibold mb-3">
              {t('integrations.cards.cursor.title')}
            </h3>
            <p className="text-foreground/80 mb-4 text-sm">
              {t('integrations.cards.cursor.description')}
            </p>
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline text-sm font-medium"
            >
              {t('integrations.cards.cursor.link')}
            </a>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="text-xl font-semibold mb-3">
              {t('integrations.cards.allIntegrations.title')}
            </h3>
            <p className="text-foreground/80 mb-4 text-sm">
              {t('integrations.cards.allIntegrations.description')}
            </p>
            <Link href="/docs/server-setup" className="text-primary hover:underline text-sm font-medium">
              {t('integrations.cards.allIntegrations.link')}
            </Link>
          </GlassCard>
        </div>
      </div>
    </section>
  );
}
