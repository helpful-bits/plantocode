'use client';

import { Canvas } from '@react-three/fiber';
// import { ScrollControls } from '@react-three/drei'
import * as THREE from 'three';
import { ParticleScene } from './ParticleScene';
import { useEffect, useState } from 'react';
import { useParticleConfig } from '@/hooks/useParticleConfig';

// Load test utility in development
if (process.env.NODE_ENV === 'development') {
  import('@/utils/particle-config-test');
}

interface InteractiveBackgroundProps {
  className?: string
}

export function InteractiveBackground({
  className = '',
}: InteractiveBackgroundProps) {
  const { config, getResponsiveAgentCounts } = useParticleConfig();
  const [agentCounts, setAgentCounts] = useState({ leaders: 2, followers: 160 });
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setAgentCounts(getResponsiveAgentCounts());

    // Check for reduced motion preference
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl || !gl.getExtension('EXT_color_buffer_half_float')) {
      setPrefersReducedMotion(true);
    }

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    // Add resize listener for responsive particle counts
    const handleResize = () => {
      setAgentCounts(getResponsiveAgentCounts());
    };

    mediaQuery.addEventListener('change', handleChange);
    window.addEventListener('resize', handleResize);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
      window.removeEventListener('resize', handleResize);
    };
  }, [getResponsiveAgentCounts]);

  // Always render fallback on server and before mount
  if (!mounted || prefersReducedMotion) {
    return (
      <div className={`fixed inset-0 -z-10 pointer-events-none ${className}`}>
        <div className="w-full h-full bg-background" />
      </div>
    );
  }

  return (
    <div id="particle-container" className={`fixed inset-0 -z-10 pointer-events-none ${className}`}>
      <Canvas
          camera={{
            position: [0, 0, 5],
            fov: 75,
            near: 0.1,
            far: 100,
          }}
          dpr={typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio, 2)}
          gl={{
            antialias: false,
            alpha: true,
            powerPreference: 'high-performance',
            preserveDrawingBuffer: false,
            stencil: false,
            depth: false,
            logarithmicDepthBuffer: false,
            // Request WebGL2 for better float texture support
          }}
          performance={{
            min: 0.5,
            max: 1,
            debounce: 200,
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
          <ParticleScene
            key={agentCounts.leaders + agentCounts.followers}
            leaderCount={agentCounts.leaders}
            followerCount={agentCounts.followers}
            forceWeights={config.forceWeights}
            physicsConstants={config.physicsConstants}
          />
        </Canvas>
    </div>
  );
}