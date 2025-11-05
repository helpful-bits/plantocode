'use client';

import { GlassCard } from '@/components/ui/GlassCard';
import { useMessages } from '@/components/i18n/useMessages';
import { Link } from '@/i18n/navigation';

export function IntegrationsSection() {
  const { t } = useMessages();

  return (
    <section className="py-16 px-4 bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto max-w-6xl">
        <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">
          {t('integrations.title', 'Works With Your Favorite AI Tools')}
        </h2>
        <p className="text-lg text-center text-foreground/80 mb-12 max-w-3xl mx-auto">
          {t('integrations.subtitle', 'Enhance Claude Code, Cursor, and Codex CLI with architectural planning')}
        </p>
        <div className="grid md:grid-cols-3 gap-6">
          <GlassCard className="p-6">
            <h3 className="text-xl font-semibold mb-3">
              {t('integrations.cards.claudeCode.title', 'Claude Code Integration')}
            </h3>
            <p className="text-foreground/80 mb-4 text-sm">
              {t('integrations.cards.claudeCode.description', 'Run Claude Code in persistent terminals with full session recording and health monitoring')}
            </p>
            <Link href="/plan-mode/claude-code" className="text-primary hover:underline text-sm font-medium">
              {t('integrations.cards.claudeCode.link', 'Setup guide →')}
            </Link>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="text-xl font-semibold mb-3">
              {t('integrations.cards.cursor.title', 'Cursor Enhancement')}
            </h3>
            <p className="text-foreground/80 mb-4 text-sm">
              {t('integrations.cards.cursor.description', 'Give Cursor Composer architectural context and file discovery capabilities')}
            </p>
            <Link href="/plan-mode/cursor" className="text-primary hover:underline text-sm font-medium">
              {t('integrations.cards.cursor.link', 'Setup guide →')}
            </Link>
          </GlassCard>

          <GlassCard className="p-6">
            <h3 className="text-xl font-semibold mb-3">
              {t('integrations.cards.allIntegrations.title', 'All Integrations')}
            </h3>
            <p className="text-foreground/80 mb-4 text-sm">
              {t('integrations.cards.allIntegrations.description', 'Explore all supported AI coding tools and integration patterns')}
            </p>
            <Link href="/integrations" className="text-primary hover:underline text-sm font-medium">
              {t('integrations.cards.allIntegrations.link', 'View integrations →')}
            </Link>
          </GlassCard>
        </div>
      </div>
    </section>
  );
}
