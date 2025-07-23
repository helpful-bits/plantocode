'use client'

import { Canvas } from '@react-three/fiber'
import { ParticleScene } from './ParticleScene'
import { Suspense, useEffect, useState } from 'react'

interface InteractiveBackgroundProps {
  particleCount?: number
  mouseIntensity?: number
  className?: string
}

function getAdaptiveParticleCount(): number {
  if (typeof window === 'undefined') return 200;
  
  const width = window.innerWidth;
  const isMobile = width < 768;
  const isTablet = width < 1024;
  const isLowEnd = navigator.hardwareConcurrency <= 4;
  const hasLowMemory = (navigator as any).deviceMemory <= 4;
  
  if (isMobile) return 100;  // Reduced from 200
  if (isTablet || isLowEnd || hasLowMemory) return 200;  // Reduced from 300
  return 300; // Reduced from 500 for better performance
}

export function InteractiveBackground({ 
  particleCount, 
  mouseIntensity = 0.5,
  className = ""
}: InteractiveBackgroundProps) {
  const [adaptiveCount, setAdaptiveCount] = useState(300);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  
  useEffect(() => {
    setAdaptiveCount(getAdaptiveParticleCount());
    
    // Check for reduced motion preference
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    
    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);
  
  // Show static gradient for reduced motion
  if (prefersReducedMotion) {
    return (
      <div className={`fixed inset-0 -z-10 ${className}`}>
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10 dark:from-primary/10 dark:via-transparent dark:to-primary/20" />
      </div>
    );
  }
  return (
    <div className={`fixed inset-0 -z-10 bg-background dark:bg-background ${className}`}>
      <Canvas
        camera={{ 
          position: [0, 0, 5], 
          fov: 75,
          near: 0.1,
          far: 100
        }}
        gl={{
          antialias: false,
          alpha: false, // No transparency - use solid background
          powerPreference: "high-performance",
          preserveDrawingBuffer: false
        }}
        dpr={1}
        onCreated={({ gl }) => {
          // Set initial background based on theme
          const isDark = document.documentElement.classList.contains('dark')
          if (isDark) {
            gl.setClearColor(0x141e2a, 1) // Dark navy
          } else {
            gl.setClearColor(0xffffff, 1) // White
          }
        }}
      >
        <Suspense fallback={null}>
          <ParticleScene 
            count={particleCount || adaptiveCount} 
            mouseIntensity={mouseIntensity}
          />
        </Suspense>
      </Canvas>
      
    </div>
  )
}