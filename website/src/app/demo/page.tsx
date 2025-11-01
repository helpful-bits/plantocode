'use client';

import { useState } from 'react';
import { Header } from '@/components/landing/Header';
import { ErrorBoundary } from '@/components/interactive-demo/ErrorBoundary';
import { HowItWorksInteractive } from '@/components/interactive-demo/HowItWorksInteractive';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/GlassCard';
import { VideoModal } from '@/components/ui/VideoModal';
import Link from 'next/link';
import { Camera, Play } from 'lucide-react';
import { useScrollTracking } from '@/hooks/useScrollTracking';
import { track } from '@/lib/track';

export default function DemoPage() {
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
      {/* Background gradient */}
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--background-gradient)' }} />

      {/* Page content */}
      <div className="relative z-0 bg-transparent">
        <Header />

        <main className="flex-grow">
          <section className="pt-20 sm:pt-24 pb-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-8">
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-500 dark:from-teal-400 dark:via-cyan-400 dark:to-blue-400 bg-clip-text text-transparent">
                  Interactive demo
                </h1>
                <p className="text-lg sm:text-xl text-description-muted max-w-3xl mx-auto mb-6">
                  See how PlanToCode plans and runs code changes.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
                  <Button variant="cta" size="sm" onClick={handleVideoOpen} className="flex items-center gap-2">
                    <Play className="w-4 h-4" />
                    View Short Demo
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/screenshots" className="flex items-center gap-2">
                      <Camera className="w-4 h-4" />
                      View Real Screenshots
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </section>

          <ErrorBoundary>
            <HowItWorksInteractive />
          </ErrorBoundary>

          {/* Screenshots CTA */}
          <section className="py-16 px-4">
            <GlassCard className="max-w-3xl mx-auto p-8 sm:p-12 text-center" highlighted>
              <h2 className="text-2xl sm:text-3xl font-bold mb-4">Want to See More?</h2>
              <p className="text-lg text-foreground/80 mb-8 max-w-2xl mx-auto">
                Explore real screenshots from actual workflows - file discovery, implementation plans, terminal sessions, and more.
              </p>
              <Button variant="cta" size="lg" asChild>
                <Link href="/screenshots" className="flex items-center gap-2">
                  <Camera className="w-5 h-5" />
                  View All Screenshots
                </Link>
              </Button>
            </GlassCard>
          </section>
        </main>
      </div>

      <VideoModal
        isOpen={showVideo}
        onClose={() => setShowVideo(false)}
        videoPath="/assets/videos/hero-section-16by9.mp4"
      />
    </>
  );
}