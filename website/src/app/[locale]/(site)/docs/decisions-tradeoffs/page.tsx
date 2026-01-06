import type { Metadata } from 'next';
import { DocsArticle } from '@/components/docs/DocsArticle';
import { DocsMediaBlock } from '@/components/docs/DocsMediaBlock';
import { GlassCard } from '@/components/ui/GlassCard';
import { loadMessagesFor, type Locale } from '@/lib/i18n';
import { locales } from '@/i18n/config';
import { generatePageMetadata } from '@/content/metadata';

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessagesFor(locale, ['docs']);

  return generatePageMetadata({
    locale,
    slug: '/docs/decisions-tradeoffs',
    title: t['decisionsTradeoffs.meta.title'],
    description: t['decisionsTradeoffs.meta.description'],
  });
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

interface TechnologySection {
  title: string;
  description: string;
  benefits: string[];
  tradeoffs: string[];
  implementation?: string;
}

export default async function DecisionsTradeoffsPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessagesFor(locale, ['docs']);

  const tauriSection = t['decisionsTradeoffs.sections.tauri'] as TechnologySection;
  const sqliteSection = t['decisionsTradeoffs.sections.sqlite'] as TechnologySection;
  const llmProxySection = t['decisionsTradeoffs.sections.llmProxy'] as TechnologySection;
  const websocketSection = t['decisionsTradeoffs.sections.websocket'] as TechnologySection;

  return (
    <DocsArticle
      title={t['decisionsTradeoffs.title']}
      description={t['decisionsTradeoffs.description']}
      date={t['decisionsTradeoffs.date']}
      readTime={t['decisionsTradeoffs.readTime']}
      category={t['decisionsTradeoffs.category']}
    >
      <p className="text-base text-muted-foreground leading-relaxed mb-8">
        {t['decisionsTradeoffs.intro']}
      </p>

      <DocsMediaBlock
        className="mb-12"
        title={t['decisionsTradeoffs.visuals.tradeoffMatrix.title']}
        description={t['decisionsTradeoffs.visuals.tradeoffMatrix.description']}
        imageSrc={t['decisionsTradeoffs.visuals.tradeoffMatrix.imageSrc']}
        imageAlt={t['decisionsTradeoffs.visuals.tradeoffMatrix.imageAlt']}
        caption={t['decisionsTradeoffs.visuals.tradeoffMatrix.caption']}
      />

      {/* Tauri v2 Section */}
      <section className="space-y-4 mb-10">
        <h2 className="text-2xl font-bold">{tauriSection.title}</h2>
        <p className="text-muted-foreground leading-relaxed">{tauriSection.description}</p>

        <div className="grid md:grid-cols-2 gap-4 mt-4">
          <GlassCard className="p-5">
            <h3 className="text-lg font-semibold text-green-400 mb-3">Benefits</h3>
            <ul className="list-disc pl-5 space-y-2 text-muted-foreground text-sm">
              {tauriSection.benefits.map((benefit, i) => (
                <li key={i}>{benefit}</li>
              ))}
            </ul>
          </GlassCard>
          <GlassCard className="p-5">
            <h3 className="text-lg font-semibold text-amber-400 mb-3">Tradeoffs</h3>
            <ul className="list-disc pl-5 space-y-2 text-muted-foreground text-sm">
              {tauriSection.tradeoffs.map((tradeoff, i) => (
                <li key={i}>{tradeoff}</li>
              ))}
            </ul>
          </GlassCard>
        </div>
      </section>

      {/* SQLite Section */}
      <section className="space-y-4 mb-10">
        <h2 className="text-2xl font-bold">{sqliteSection.title}</h2>
        <p className="text-muted-foreground leading-relaxed">{sqliteSection.description}</p>

        <div className="grid md:grid-cols-2 gap-4 mt-4">
          <GlassCard className="p-5">
            <h3 className="text-lg font-semibold text-green-400 mb-3">Benefits</h3>
            <ul className="list-disc pl-5 space-y-2 text-muted-foreground text-sm">
              {sqliteSection.benefits.map((benefit, i) => (
                <li key={i}>{benefit}</li>
              ))}
            </ul>
          </GlassCard>
          <GlassCard className="p-5">
            <h3 className="text-lg font-semibold text-amber-400 mb-3">Tradeoffs</h3>
            <ul className="list-disc pl-5 space-y-2 text-muted-foreground text-sm">
              {sqliteSection.tradeoffs.map((tradeoff, i) => (
                <li key={i}>{tradeoff}</li>
              ))}
            </ul>
          </GlassCard>
        </div>
        {sqliteSection.implementation && (
          <p className="text-sm text-muted-foreground mt-3 p-3 bg-muted/30 rounded-lg">
            <strong>Implementation:</strong> {sqliteSection.implementation}
          </p>
        )}
      </section>

      {/* LLM Proxy Section */}
      <section className="space-y-4 mb-10">
        <h2 className="text-2xl font-bold">{llmProxySection.title}</h2>
        <p className="text-muted-foreground leading-relaxed">{llmProxySection.description}</p>

        <div className="grid md:grid-cols-2 gap-4 mt-4">
          <GlassCard className="p-5">
            <h3 className="text-lg font-semibold text-green-400 mb-3">Benefits</h3>
            <ul className="list-disc pl-5 space-y-2 text-muted-foreground text-sm">
              {llmProxySection.benefits.map((benefit, i) => (
                <li key={i}>{benefit}</li>
              ))}
            </ul>
          </GlassCard>
          <GlassCard className="p-5">
            <h3 className="text-lg font-semibold text-amber-400 mb-3">Tradeoffs</h3>
            <ul className="list-disc pl-5 space-y-2 text-muted-foreground text-sm">
              {llmProxySection.tradeoffs.map((tradeoff, i) => (
                <li key={i}>{tradeoff}</li>
              ))}
            </ul>
          </GlassCard>
        </div>
        {llmProxySection.implementation && (
          <p className="text-sm text-muted-foreground mt-3 p-3 bg-muted/30 rounded-lg">
            <strong>Implementation:</strong> {llmProxySection.implementation}
          </p>
        )}
      </section>

      {/* WebSocket Relay Section */}
      <section className="space-y-4 mb-10">
        <h2 className="text-2xl font-bold">{websocketSection.title}</h2>
        <p className="text-muted-foreground leading-relaxed">{websocketSection.description}</p>

        <div className="grid md:grid-cols-2 gap-4 mt-4">
          <GlassCard className="p-5">
            <h3 className="text-lg font-semibold text-green-400 mb-3">Benefits</h3>
            <ul className="list-disc pl-5 space-y-2 text-muted-foreground text-sm">
              {websocketSection.benefits.map((benefit, i) => (
                <li key={i}>{benefit}</li>
              ))}
            </ul>
          </GlassCard>
          <GlassCard className="p-5">
            <h3 className="text-lg font-semibold text-amber-400 mb-3">Tradeoffs</h3>
            <ul className="list-disc pl-5 space-y-2 text-muted-foreground text-sm">
              {websocketSection.tradeoffs.map((tradeoff, i) => (
                <li key={i}>{tradeoff}</li>
              ))}
            </ul>
          </GlassCard>
        </div>
        {websocketSection.implementation && (
          <p className="text-sm text-muted-foreground mt-3 p-3 bg-muted/30 rounded-lg">
            <strong>Implementation:</strong> {websocketSection.implementation}
          </p>
        )}
      </section>

      {/* Operational Consequences */}
      <section className="space-y-4 mb-10">
        <h2 className="text-2xl font-bold">{t['decisionsTradeoffs.operational.heading']}</h2>
        <GlassCard className="p-6">
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
            {(t['decisionsTradeoffs.operational.items'] as string[]).map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </GlassCard>
      </section>

      {/* Security Boundaries */}
      <section className="space-y-4 mb-10">
        <h2 className="text-2xl font-bold">{t['decisionsTradeoffs.securityBoundaries.heading']}</h2>
        <p className="text-muted-foreground leading-relaxed">{t['decisionsTradeoffs.securityBoundaries.description']}</p>
        <GlassCard className="p-6">
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
            {(t['decisionsTradeoffs.securityBoundaries.items'] as string[]).map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </GlassCard>
      </section>

      {/* When to Reconsider */}
      <section className="space-y-4 mb-6">
        <h2 className="text-2xl font-bold">{t['decisionsTradeoffs.whenToReconsider.heading']}</h2>
        <p className="text-muted-foreground leading-relaxed">{t['decisionsTradeoffs.whenToReconsider.description']}</p>
        <GlassCard className="p-6">
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
            {(t['decisionsTradeoffs.whenToReconsider.items'] as string[]).map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </GlassCard>
      </section>
    </DocsArticle>
  );
}
