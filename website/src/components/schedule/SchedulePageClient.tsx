'use client';

import { useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Calendar } from 'lucide-react';
import { ObfuscatedEmail } from '@/components/ui/ObfuscatedEmail';

interface SchedulePageClientProps {
  t: Record<string, any>;
}

export function SchedulePageClient({ t }: SchedulePageClientProps) {
  useEffect(() => {
    // Load Cal.com embed script
    const script = document.createElement('script');
    script.src = 'https://app.cal.com/embed/embed.js';
    script.async = true;

    script.onload = () => {
      // Initialize Cal.com after script loads
      if (typeof window !== 'undefined' && (window as any).Cal) {
        (window as any).Cal('init');
      }
    };

    document.head.appendChild(script);

    return () => {
      // Cleanup script on unmount
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, []);

  return (
    <GlassCard className="p-8 sm:p-12" highlighted>
      <div className="flex justify-center mb-6">
        <div className="p-4 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10">
          <Calendar className="w-8 h-8 text-primary" />
        </div>
      </div>

      {/* Cal.com embed container */}
      <div className="cal-container">
        <div
          data-cal-namespace="plantocode"
          data-cal-link="plantocode/architect-consultation"
          data-cal-config='{"layout":"month_view"}'
          style={{ width: '100%', height: '700px', overflow: 'scroll' }}
          className="rounded-lg overflow-hidden"
        />
      </div>

      <div className="mt-8 text-center">
        <p className="text-sm text-foreground/60">
          {t['schedule.footer']}{' '}
          <ObfuscatedEmail
            user="architects"
            domain="plantocode.com"
            className="text-primary hover:underline"
          />
        </p>
      </div>
    </GlassCard>
  );
}
