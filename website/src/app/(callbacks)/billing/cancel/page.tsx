'use client';

import { XCircle } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';

export default function BillingCancelPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <GlassCard className="max-w-md w-full text-center p-8">
        <div className="flex flex-col items-center gap-6">
          <XCircle className="w-16 h-16 text-red-500" />
          <div>
            <h1 className="text-2xl font-semibold text-foreground mb-2">
              Payment Cancelled
            </h1>
            <p className="text-foreground/80">
              Your payment has been cancelled. You have not been charged.
            </p>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}