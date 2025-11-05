'use client';

import { GlassCard } from '@/components/ui/GlassCard';
import { useMessages } from '@/components/i18n/useMessages';

export function GovernanceSection() {
  const { t } = useMessages();

  return (
    <section className="py-16 px-4">
      <div className="container mx-auto max-w-6xl">
        <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">
          {t('governance.title', 'Human-in-the-loop Governance')}
        </h2>
        <p className="text-lg text-center text-foreground/80 mb-12 max-w-3xl mx-auto">
          {t('governance.subtitle', 'Maintain full control over AI-generated implementation plans. Review, edit, approve, and audit every step before execution.')}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <GlassCard className="p-6">
            <h3 className="text-xl font-semibold mb-3">
              {t('governance.cards.filePlans.title', 'File-by-file Plans with Exact Paths')}
            </h3>
            <p className="text-foreground/80">
              {t('governance.cards.filePlans.description', 'Implementation plans break down changes on a file-by-file basis with exact repository paths, ensuring complete visibility into what will be modified.')}
            </p>
          </GlassCard>
          <GlassCard className="p-6">
            <h3 className="text-xl font-semibold mb-3">
              {t('governance.cards.workflow.title', 'Review, Edit & Approve Workflow')}
            </h3>
            <p className="text-foreground/80">
              {t('governance.cards.workflow.description', 'Team leads and stakeholders can review proposed changes, directly edit plan details, request modifications, and approve plans before execution.')}
            </p>
          </GlassCard>
          <GlassCard className="p-6">
            <h3 className="text-xl font-semibold mb-3">
              {t('governance.cards.handoff.title', 'Safe Handoff to Agents')}
            </h3>
            <p className="text-foreground/80">
              {t('governance.cards.handoff.description', 'Once approved, plans are securely transmitted to your chosen coding agent or assigned to developers, preventing regressions and ensuring alignment with requirements.')}
            </p>
          </GlassCard>
        </div>
      </div>
    </section>
  );
}
