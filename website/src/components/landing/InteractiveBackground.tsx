'use client'

import { Canvas } from '@react-three/fiber'
import { ScrollControls } from '@react-three/drei'
import * as THREE from 'three'
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
  const height = window.innerHeight;
  const isMobile = width < 768 || 'ontouchstart' in window;
  const isTablet = width < 1024;
  const cores = navigator.hardwareConcurrency || 4;
  const hasLowMemory = (navigator as any).deviceMemory <= 4;
  const pixelRatio = window.devicePixelRatio || 1;
  
  // More conservative for CPU simulation
  const screenArea = width * height;
  const baseCount = Math.min(screenArea / 6000, 500);
  
  if (isMobile) return Math.round(Math.min(200, baseCount * 0.7));
  if (isTablet || cores <= 4 || hasLowMemory || pixelRatio > 2) {
    return Math.round(Math.min(400, baseCount * 0.8));
  }
  if (cores > 8 && width > 1920) return Math.round(Math.min(800, baseCount * 1.2));
  
  return Math.round(Math.min(500, baseCount));
}

export function InteractiveBackground({ 
  particleCount, 
  mouseIntensity = 0.2,
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
    
    // Add resize event listener with debouncing
    let resizeTimeout: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        setAdaptiveCount(getAdaptiveParticleCount());
        // Trigger a visual effect on resize by adding a class
        document.body.classList.add('resizing');
        setTimeout(() => document.body.classList.remove('resizing'), 500);
      }, 300);
    };
    
    window.addEventListener('resize', handleResize);
    mediaQuery.addEventListener('change', handleChange);
    
    return () => {
      clearTimeout(resizeTimeout);
      window.removeEventListener('resize', handleResize);
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  // Enhanced reduced motion - slower animation instead of static gradient
  if (prefersReducedMotion) {
    return (
      <div className={`fixed inset-0 -z-10 pointer-events-none ${className}`}>
        <Canvas
          camera={{ 
            position: [0, 0, 5], 
            fov: 75,
            near: 0.1,
            far: 100
          }}
          gl={{
            antialias: false,
            alpha: true,
            powerPreference: "high-performance",
            preserveDrawingBuffer: false,
            stencil: false,
            depth: false,
            logarithmicDepthBuffer: false
          }}
          dpr={typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio, 2)}
          performance={{
            min: 0.5,
            max: 1,
            debounce: 200
          }}
          resize={{ debounce: 0 }}
          onCreated={({ gl, camera }) => {
            gl.outputColorSpace = THREE.SRGBColorSpace;
            gl.setClearColor(0x000000, 0);
            camera.updateProjectionMatrix();
          }}
        >
          <ScrollControls pages={3} damping={4}>
            <Suspense fallback={null}>
              <ParticleScene 
                key={adaptiveCount}
                count={Math.round((particleCount || adaptiveCount) * 0.5)} 
                mouseIntensity={mouseIntensity * 0.3}
                isReducedMotion={true}
              />
            </Suspense>
          </ScrollControls>
        </Canvas>
      </div>
    );
  }

  return (
    <div className={`fixed inset-0 -z-10 pointer-events-none ${className}`}>
      <Canvas
        camera={{ 
          position: [0, 0, 5], 
          fov: 75,
          near: 0.1,
          far: 100
        }}
        gl={{
          antialias: false,
          alpha: true,
          powerPreference: "high-performance",
          preserveDrawingBuffer: false,
          stencil: false,
          depth: false,
          logarithmicDepthBuffer: false
        }}
        dpr={typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio, 2)}
        performance={{
          min: 0.5,
          max: 1,
          debounce: 200
        }}
        resize={{ debounce: 0 }}
        onCreated={({ gl, camera }) => {
          // Optimize WebGL context
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.setClearColor(0x000000, 0); // Ensure transparent background
          
          // Optimize camera settings
          camera.updateProjectionMatrix();
          
        }}
      >
        <ScrollControls pages={3} damping={4}>
          <Suspense fallback={null}>
            <ParticleScene 
              key={adaptiveCount}
              count={particleCount || adaptiveCount} 
              mouseIntensity={mouseIntensity}
              isReducedMotion={false}
            />
          </Suspense>
        </ScrollControls>
      </Canvas>
      
    </div>
  )
}