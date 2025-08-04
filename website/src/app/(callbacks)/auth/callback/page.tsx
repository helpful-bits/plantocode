'use client';

import { useEffect } from 'react';
import { CheckCircle } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';

export default function AuthCallbackPage() {
  useEffect(() => {
    const timer = setTimeout(() => {
      window.close();
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <GlassCard className="max-w-md w-full text-center p-8">
        <div className="flex flex-col items-center gap-6">
          <CheckCircle className="w-16 h-16 text-green-500" />
          <div>
            <h1 className="text-2xl font-semibold text-foreground mb-2">
              Authentication Successful
            </h1>
            <p className="text-foreground/80">
              You have been successfully authenticated. This window will close automatically.
            </p>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}