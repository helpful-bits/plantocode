'use client';

import { useEffect } from 'react';
import { LogOut } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';

export default function Auth0LoggedOutPage() {
  useEffect(() => {
    const timer = setTimeout(() => {
      window.close();
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <GlassCard className="max-w-md w-full text-center p-8">
        <div className="flex flex-col items-center gap-6">
          <LogOut className="w-16 h-16 text-blue-500" />
          <div>
            <h1 className="text-2xl font-semibold text-foreground mb-2">
              Successfully Logged Out
            </h1>
            <p className="text-foreground/80">
              You have been logged out from Vibe Manager. This window will close automatically.
            </p>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}