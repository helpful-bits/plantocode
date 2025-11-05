import { Metadata } from 'next';
import { FeatureBaseLink } from '@/components/support/FeatureBaseSSO';
import GlassCard from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Mail, HelpCircle } from 'lucide-react';
import { cdnUrl } from '@/lib/cdn';
import { ObfuscatedEmail } from '@/components/ui/ObfuscatedEmail';

import { loadMessages, type Locale } from '@/lib/i18n';
import { locales } from '@/i18n/config';

export const metadata: Metadata = {
  title: 'PlanToCode Support - Help & Troubleshooting',
  description: 'Get help with PlanToCode installation, Claude Code, Cursor, and Codex integration. Troubleshooting and feature requests. 24h response time.',
  keywords: [
    'plantocode support',
    'plantocode help',
    'claude code help',
    'cursor integration help',
    'installation support',
    'troubleshooting',
    'feature requests',
  ],
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: 'https://www.plantocode.com/support',
    languages: {
      'en-US': 'https://www.plantocode.com/support',
      'en': 'https://www.plantocode.com/support',
    },
  },
  openGraph: {
    title: 'PlanToCode Support - Help & Troubleshooting',
    description: 'Get help with PlanToCode installation, Claude Code, Cursor, and Codex integration. Troubleshooting and feature requests. 24h response time.',
    url: 'https://www.plantocode.com/support',
    siteName: 'PlanToCode',
    type: 'website',
    locale: 'en_US',
    images: [{
      url: cdnUrl('/images/og-image.png'),
      width: 1200,
      height: 630,
      alt: 'PlanToCode - AI Planning for Code',
    }],
  },
};


export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default async function SupportPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <GlassCard className="max-w-md w-full p-8">
        <div className="space-y-8">
          <header className="text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <HelpCircle className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-foreground">{t['support.hero.title']}</h1>
            <p className="text-muted-foreground">
              {t['support.hero.subtitle']}
            </p>
          </header>

          <div className="space-y-6">
            <div className="text-center">
              <Button variant="cta" size="lg" asChild className="w-full">
                <ObfuscatedEmail
                  user="support"
                  domain="plantocode.com"
                  className="flex items-center gap-2"
                >
                  <Mail className="w-5 h-5" />
                  {t['support.button']}
                </ObfuscatedEmail>
              </Button>
              <p className="text-sm text-muted-foreground mt-2">
                <ObfuscatedEmail user="support" domain="plantocode.com" />
              </p>
            </div>

            <div className="border-t border-border pt-6">
              <p className="text-sm text-muted-foreground text-center mb-4">{t['support.resources.title']}</p>
              <div className="grid grid-cols-2 gap-3">
                <FeatureBaseLink
                  href="help"
                  className="flex items-center justify-center px-3 py-2 border border-border rounded-lg hover:bg-muted/50 transition-colors text-sm font-medium"
                  target="_blank"
                >
                  {t['support.resources.help']}
                </FeatureBaseLink>
                <FeatureBaseLink
                  href="feedback"
                  className="flex items-center justify-center px-3 py-2 border border-border rounded-lg hover:bg-muted/50 transition-colors text-sm font-medium"
                  target="_blank"
                >
                  {t['support.resources.feedback']}
                </FeatureBaseLink>
                <FeatureBaseLink
                  href="roadmap"
                  className="flex items-center justify-center px-3 py-2 border border-border rounded-lg hover:bg-muted/50 transition-colors text-sm font-medium"
                  target="_blank"
                >
                  {t['support.resources.roadmap']}
                </FeatureBaseLink>
                <FeatureBaseLink
                  href="changelog"
                  className="flex items-center justify-center px-3 py-2 border border-border rounded-lg hover:bg-muted/50 transition-colors text-sm font-medium"
                  target="_blank"
                >
                  {t['support.resources.changelog']}
                </FeatureBaseLink>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}