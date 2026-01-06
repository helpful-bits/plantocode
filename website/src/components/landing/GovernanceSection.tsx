'use client';

import { GlassCard } from '@/components/ui/GlassCard';
import { useMessages } from '@/components/i18n/useMessages';

export function GovernanceSection() {
  const { t } = useMessages();

  return (
    <section>
      <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">
          {t('governance.title')}
        </h2>
        <p className="text-lg text-center text-foreground/80 mb-12 max-w-3xl mx-auto">
          {t('governance.subtitle')}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <GlassCard className="p-6">
            <h3 className="text-xl font-semibold mb-3">
              {t('governance.cards.filePlans.title')}
            </h3>
            <p className="text-foreground/80">
              {t('governance.cards.filePlans.description')}
            </p>
          </GlassCard>
          <GlassCard className="p-6">
            <h3 className="text-xl font-semibold mb-3">
              {t('governance.cards.workflow.title')}
            </h3>
            <p className="text-foreground/80">
              {t('governance.cards.workflow.description')}
            </p>
          </GlassCard>
          <GlassCard className="p-6">
            <h3 className="text-xl font-semibold mb-3">
              {t('governance.cards.handoff.title')}
            </h3>
            <p className="text-foreground/80">
              {t('governance.cards.handoff.description')}
            </p>
          </GlassCard>
        </div>
      </div>
    </section>
  );
}
