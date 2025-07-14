"use client";

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Step {
  title: string;
  description: string;
  video: string;
  poster: string;
}

interface HowItWorksProps {
  steps?: Step[];
}

const defaultSteps: Step[] = [];

function OptimizedVideo({ video, poster }: { video: string; poster: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isLoaded) {
            setIsLoaded(true);
          }
        });
      },
      { threshold: 0.1 }
    );

    observer.observe(videoElement);

    return () => {
      observer.disconnect();
    };
  }, [isLoaded]);

  return (
    <video
      ref={videoRef}
      className="w-full max-w-lg rounded-lg border shadow-lg aspect-video"
      controls
      poster={poster}
      preload="metadata"
      style={{ width: '100%', height: 'auto' }}
    >
      {isLoaded && (
        <>
          <source src={video.replace('.mp4', '.webm')} type="video/webm" />
          <source src={video} type="video/mp4" />
        </>
      )}
      Your browser does not support the video tag.
    </video>
  );
}

export function HowItWorks({ steps = defaultSteps }: HowItWorksProps) {
  return (
    <section id="how-it-works" className="py-16 px-4 bg-secondary/30">
      <div className="container mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">How It Works</h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            From task description to implementation plan in minutes
          </p>
        </div>
        
        <div className="space-y-12">
          {steps.map((step, index) => (
            <Card key={index} className="overflow-hidden">
              <div className={`flex flex-col ${index % 2 === 0 ? 'lg:flex-row' : 'lg:flex-row-reverse'} gap-8`}>
                <div className="flex-1">
                  <CardHeader>
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold text-xl">
                        {index + 1}
                      </div>
                      <CardTitle className="text-2xl">{step.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground text-lg leading-relaxed">{step.description}</p>
                  </CardContent>
                </div>
                
                <div className="flex-1">
                  <div className="h-full flex items-center justify-center p-6">
                    <OptimizedVideo video={step.video} poster={step.poster} />
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}