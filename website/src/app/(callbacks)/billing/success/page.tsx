'use client';

import { CheckCircle } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';

export default function BillingSuccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <GlassCard className="max-w-md w-full text-center p-8">
        <div className="flex flex-col items-center gap-6">
          <CheckCircle className="w-16 h-16 text-green-500" />
          <div>
            <h1 className="text-2xl font-semibold text-foreground mb-2">
              Payment Successful
            </h1>
            <p className="text-foreground/80">
              Your payment has been processed successfully. Your account balance will be reflected in the app shortly.
            </p>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}