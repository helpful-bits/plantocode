import type { Metadata } from 'next';
import { locales } from '@/i18n/config';
import { loadMessages, type Locale } from '@/lib/i18n';

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await loadMessages(locale);

  return generatePageMetadata({
    locale,
    slug: '/legal/restricted',
    title: t['legal.restricted.meta.title'],
    description: t['legal.restricted.meta.description'],
  });
}

import { MapPin } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { ObfuscatedEmail } from '@/components/ui/ObfuscatedEmail';
import { generatePageMetadata } from '@/content/metadata';

export function generateStaticParams() {
  return locales.map((locale: Locale) => ({ locale }));
}

export default function RestrictedRegionPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <GlassCard className="max-w-lg w-full p-8">
        <div className="flex flex-col items-center gap-6 text-center">
          <MapPin className="w-16 h-16 text-red-500" />
          
          <div>
            <h1 className="text-2xl font-semibold text-foreground mb-3">
              Service Not Available in Your Region
            </h1>
            <p className="text-foreground/80 mb-6">
              PlanToCode is currently only available in select regions.
            </p>
          </div>

          <GlassCard className="w-full p-6 bg-red-500/5 border-red-500/20">
            <p className="text-sm font-medium mb-4 text-foreground">
              Available regions:
            </p>
            <ul className="space-y-3 text-left">
              <li className="flex items-center gap-3">
                <span className="text-xl">🇪🇺</span>
                <span className="text-foreground/80">European Union / EEA</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="text-xl">🇬🇧</span>
                <span className="text-foreground/80">United Kingdom</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="text-xl">🇺🇸</span>
                <span className="text-foreground/80">United States</span>
              </li>
            </ul>
          </GlassCard>

          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              We detected that you are accessing from a region where our service is not currently offered.
            </p>
            <p className="font-mono text-xs bg-muted/30 px-3 py-1 rounded">
              Error Code: GEO_RESTRICTION_001
            </p>
          </div>

          <div className="flex flex-col items-center gap-4 w-full mt-4">
            <Button asChild variant="default" size="lg" className="w-full sm:w-auto">
              <ObfuscatedEmail user="legal" domain="plantocode.com">
                Contact Support
              </ObfuscatedEmail>
            </Button>

            <p className="text-xs text-muted-foreground">
              If you believe this is an error, please contact our support team
            </p>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}