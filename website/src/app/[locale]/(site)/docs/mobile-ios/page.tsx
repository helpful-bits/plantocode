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
    slug: '/docs/mobile-ios',
    title: t['mobileIos.meta.title'],
    description: t['mobileIos.meta.description'],
  });
}

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

interface PackageInfo {
  name: string;
  path: string;
  description: string;
  components: string[];
}

export default async function MobileIosDocPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessagesFor(locale, ['docs']);

  const packageStructure = t['mobileIos.packageStructure'] as {
    heading: string;
    description: string;
    packages: PackageInfo[];
  };

  const auth = t['mobileIos.auth'] as {
    heading: string;
    description: string;
    flow: string[];
    tokenManagement: {
      heading: string;
      items: string[];
    };
  };

  const deviceLink = t['mobileIos.deviceLink'] as {
    heading: string;
    description: string;
    protocol: {
      heading: string;
      steps: string[];
    };
    messageTypes: {
      heading: string;
      items: string[];
    };
    reconnection: {
      heading: string;
      description: string;
    };
  };

  const rpcRouting = t['mobileIos.rpcRouting'] as {
    heading: string;
    description: string;
    commands: {
      heading: string;
      items: string[];
    };
    implementation: {
      heading: string;
      description: string;
    };
  };

  const offlineQueue = t['mobileIos.offlineQueue'] as {
    heading: string;
    description: string;
    architecture: {
      heading: string;
      items: string[];
    };
    supportedActions: {
      heading: string;
      items: string[];
    };
  };

  const localStorage = t['mobileIos.localStorage'] as {
    heading: string;
    description: string;
    database: {
      heading: string;
      path: string;
      tables: string[];
    };
    migrations: {
      heading: string;
      description: string;
    };
  };

  return (
    <DocsArticle
      title={t['mobileIos.title']}
      description={t['mobileIos.description']}
      date={t['mobileIos.date']}
      readTime={t['mobileIos.readTime']}
      category={t['mobileIos.category']}
    >
      <p className="text-base text-muted-foreground leading-relaxed mb-8">
        {t['mobileIos.intro']}
      </p>

      <DocsMediaBlock
        className="mb-12"
        title={t['mobileIos.visuals.app.title']}
        description={t['mobileIos.visuals.app.description']}
        imageSrc={t['mobileIos.visuals.app.imageSrc']}
        imageAlt={t['mobileIos.visuals.app.imageAlt']}
        caption={t['mobileIos.visuals.app.caption']}
      />

      {/* Swift Package Structure */}
      <section className="space-y-4 mb-12">
        <h2 className="text-2xl font-bold">{packageStructure.heading}</h2>
        <p className="text-muted-foreground leading-relaxed">{packageStructure.description}</p>
        <div className="grid gap-4">
          {packageStructure.packages.map((pkg, i) => (
            <GlassCard key={i} className="p-5">
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-lg font-semibold text-primary">{pkg.name}</h3>
                <code className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                  {pkg.path}
                </code>
              </div>
              <p className="text-muted-foreground text-sm mb-3">{pkg.description}</p>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground text-sm">
                {pkg.components.map((component, j) => (
                  <li key={j}>{component}</li>
                ))}
              </ul>
            </GlassCard>
          ))}
        </div>
      </section>

      {/* Auth0 PKCE Integration */}
      <section className="space-y-4 mb-12">
        <h2 className="text-2xl font-bold">{auth.heading}</h2>
        <p className="text-muted-foreground leading-relaxed">{auth.description}</p>

        <GlassCard className="p-5">
          <h3 className="text-lg font-semibold text-blue-400 mb-3">Authentication Flow</h3>
          <ol className="list-decimal pl-5 space-y-2 text-muted-foreground text-sm">
            {auth.flow.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </GlassCard>

        <GlassCard className="p-5">
          <h3 className="text-lg font-semibold text-green-400 mb-3">{auth.tokenManagement.heading}</h3>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground text-sm">
            {auth.tokenManagement.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </GlassCard>
      </section>

      {/* Device Linking via WebSocket Relay */}
      <section className="space-y-4 mb-12">
        <h2 className="text-2xl font-bold">{deviceLink.heading}</h2>
        <p className="text-muted-foreground leading-relaxed">{deviceLink.description}</p>

        <div className="grid md:grid-cols-2 gap-4">
          <GlassCard className="p-5">
            <h3 className="text-lg font-semibold text-purple-400 mb-3">{deviceLink.protocol.heading}</h3>
            <ol className="list-decimal pl-5 space-y-2 text-muted-foreground text-sm">
              {deviceLink.protocol.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </GlassCard>

          <GlassCard className="p-5">
            <h3 className="text-lg font-semibold text-cyan-400 mb-3">{deviceLink.messageTypes.heading}</h3>
            <ul className="list-disc pl-5 space-y-2 text-muted-foreground text-sm">
              {deviceLink.messageTypes.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </GlassCard>
        </div>

        <GlassCard className="p-4 bg-muted/20">
          <h4 className="font-semibold mb-2">{deviceLink.reconnection.heading}</h4>
          <p className="text-muted-foreground text-sm">{deviceLink.reconnection.description}</p>
        </GlassCard>
      </section>

      {/* RPC Command Routing */}
      <section className="space-y-4 mb-12">
        <h2 className="text-2xl font-bold">{rpcRouting.heading}</h2>
        <p className="text-muted-foreground leading-relaxed">{rpcRouting.description}</p>

        <GlassCard className="p-5">
          <h3 className="text-lg font-semibold text-amber-400 mb-3">{rpcRouting.commands.heading}</h3>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground text-sm">
            {rpcRouting.commands.items.map((item, i) => (
              <li key={i}><code className="text-primary">{item.split(':')[0]}</code>: {item.split(':').slice(1).join(':')}</li>
            ))}
          </ul>
        </GlassCard>

        <GlassCard className="p-4 bg-muted/20">
          <h4 className="font-semibold mb-2">{rpcRouting.implementation.heading}</h4>
          <p className="text-muted-foreground text-sm">{rpcRouting.implementation.description}</p>
        </GlassCard>
      </section>

      {/* Offline Action Queue */}
      <section className="space-y-4 mb-12">
        <h2 className="text-2xl font-bold">{offlineQueue.heading}</h2>
        <p className="text-muted-foreground leading-relaxed">{offlineQueue.description}</p>

        <div className="grid md:grid-cols-2 gap-4">
          <GlassCard className="p-5">
            <h3 className="text-lg font-semibold text-blue-400 mb-3">{offlineQueue.architecture.heading}</h3>
            <ul className="list-disc pl-5 space-y-2 text-muted-foreground text-sm">
              {offlineQueue.architecture.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </GlassCard>

          <GlassCard className="p-5">
            <h3 className="text-lg font-semibold text-green-400 mb-3">{offlineQueue.supportedActions.heading}</h3>
            <ul className="list-disc pl-5 space-y-2 text-muted-foreground text-sm">
              {offlineQueue.supportedActions.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </GlassCard>
        </div>
      </section>

      {/* SQLite Local Storage */}
      <section className="space-y-4 mb-12">
        <h2 className="text-2xl font-bold">{localStorage.heading}</h2>
        <p className="text-muted-foreground leading-relaxed">{localStorage.description}</p>

        <GlassCard className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-primary">{localStorage.database.heading}</h3>
            <code className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
              {localStorage.database.path}
            </code>
          </div>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground text-sm">
            {localStorage.database.tables.map((table, i) => (
              <li key={i}>{table}</li>
            ))}
          </ul>
        </GlassCard>

        <GlassCard className="p-4 bg-muted/20">
          <h4 className="font-semibold mb-2">{localStorage.migrations.heading}</h4>
          <p className="text-muted-foreground text-sm">{localStorage.migrations.description}</p>
        </GlassCard>
      </section>

      {/* Mobile Sessions */}
      <section className="space-y-4 mb-12">
        <h2 className="text-2xl font-bold">{t['mobileIos.sessions.heading']}</h2>
        <p className="text-muted-foreground leading-relaxed">{t['mobileIos.sessions.description']}</p>
        <GlassCard className="p-5">
          <h3 className="text-lg font-semibold text-purple-400 mb-3">Session Lifecycle</h3>
          <ol className="list-decimal pl-5 space-y-2 text-muted-foreground text-sm">
            {(t['mobileIos.sessions.lifecycle'] as string[]).map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </GlassCard>
      </section>

      {/* Workflow Entry Points */}
      <section className="space-y-4 mb-12">
        <h2 className="text-2xl font-bold">{t['mobileIos.workflows.heading']}</h2>
        <p className="text-muted-foreground leading-relaxed">{t['mobileIos.workflows.description']}</p>
        <GlassCard className="p-5">
          <ul className="space-y-2 text-muted-foreground text-sm font-mono">
            {(t['mobileIos.workflows.items'] as string[]).map((item, i) => (
              <li key={i} className="border-b border-border/30 pb-2 last:border-0 last:pb-0">
                {item}
              </li>
            ))}
          </ul>
        </GlassCard>
      </section>

      {/* Region Settings */}
      <section className="space-y-4 mb-6">
        <h2 className="text-2xl font-bold">{t['mobileIos.region.heading']}</h2>
        <p className="text-muted-foreground leading-relaxed">{t['mobileIos.region.description']}</p>
        <GlassCard className="p-4 bg-muted/20">
          <p className="text-muted-foreground text-sm">{t['mobileIos.region.implementation']}</p>
        </GlassCard>
      </section>
    </DocsArticle>
  );
}
