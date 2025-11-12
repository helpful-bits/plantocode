'use client';

import { useState } from 'react';
import { ErrorBoundary } from '@/components/interactive-demo/ErrorBoundary';
import { HowItWorksInteractive } from '@/components/interactive-demo/HowItWorksInteractive';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/GlassCard';
import { VideoModal } from '@/components/ui/VideoModal';
import { Link } from '@/i18n/navigation';
import { Camera, Play } from 'lucide-react';
import { useScrollTracking } from '@/hooks/useScrollTracking';
import { track } from '@/lib/track';

interface DemoPageClientProps {
  t: Record<string, any>;
}

export function DemoPageClient({ t }: DemoPageClientProps) {
  const [showVideo, setShowVideo] = useState(false);

  // Track scroll depth on demo page
  useScrollTracking({ enabled: true });

  // Track demo start when video opens
  const handleVideoOpen = () => {
    setShowVideo(true);
    track({ event: 'demo_start', props: { location: 'demo_page_hero' } });
  };

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8">
        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
          <Button variant="cta" size="sm" onClick={handleVideoOpen} className="flex items-center gap-2">
            <Play className="w-4 h-4" />
            {t['demo.hero.video']}
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/screenshots" className="flex items-center gap-2">
              <Camera className="w-4 h-4" />
              {t['demo.hero.screenshots']}
            </Link>
          </Button>
        </div>
      </div>

      <ErrorBoundary>
        <HowItWorksInteractive />
      </ErrorBoundary>

      {/* Screenshots CTA */}
      <section className="py-16 px-4">
        <GlassCard className="max-w-3xl mx-auto p-8 sm:p-12 text-center" highlighted>
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">{t['demo.cta.title']}</h2>
          <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
            {t['demo.cta.description']}
          </p>
          <Button variant="cta" size="lg" asChild>
            <Link href="/screenshots" className="flex items-center gap-2">
              <Camera className="w-5 h-5" />
              {t['demo.cta.button']}
            </Link>
          </Button>
        </GlassCard>
      </section>

      <VideoModal
        isOpen={showVideo}
        onClose={() => setShowVideo(false)}
        videoPath="/assets/videos/hero-demo.mp4"
      />
    </>
  );
}
