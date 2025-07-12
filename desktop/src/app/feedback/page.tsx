import { Loader2, MessageCircle } from 'lucide-react';
import { useFeaturebase } from '@/hooks/use-featurebase';
import { useTheme } from '@/app/components/theme-provider';
import { useEffect, useState } from 'react';

export default function FeedbackPage() {
  const { theme } = useTheme();
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    // Resolve the actual theme based on system preference if needed
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      setResolvedTheme(mediaQuery.matches ? 'dark' : 'light');
      
      const handleChange = (e: MediaQueryListEvent) => {
        setResolvedTheme(e.matches ? 'dark' : 'light');
      };
      
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    } else {
      setResolvedTheme(theme as 'light' | 'dark');
      return undefined;
    }
  }, [theme]);

  const { loading, error } = useFeaturebase({
    mode: 'portal',
    containerId: 'featurebase-widget-container',
    theme: resolvedTheme
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Initializing feedback widget...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center max-w-md">
          <MessageCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-xl font-semibold mb-2">Feedback Widget Unavailable</h2>
          <p className="text-muted-foreground mb-4">
            There was an issue loading the feedback widget. Please try refreshing the page.
          </p>
          <p className="text-sm text-muted-foreground">
            Error: {error.message}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div 
      id="featurebase-widget-container" 
      data-featurebase-embed 
      className="w-full -mx-6 -mt-4 -mb-8"
      style={{ minHeight: 'calc(100vh - 120px)' }}
    />
  );
}