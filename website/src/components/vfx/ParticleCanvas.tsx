"use client";

import "@react-three/fiber";
import { useRef, useMemo, useEffect, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";



interface ParticlesProps { 
  count: number;
}

function Particles({ count }: ParticlesProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  // Check for dark mode
  useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    };
    
    checkDarkMode();
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    
    return () => observer.disconnect();
  }, []);

  const { geometry, material } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      // More spread out distribution for subtlety
      positions[i3] = (Math.random() - 0.5) * 300; // x
      positions[i3 + 1] = (Math.random() - 0.5) * 300; // y
      positions[i3 + 2] = (Math.random() - 0.5) * 300; // z
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const material = new THREE.PointsMaterial({
      transparent: true,
      size: 0.08,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    
    return { positions, geometry, material };
  }, [count]);

  useEffect(() => {
    material.color.setHex(isDarkMode ? 0x65a8b8 : 0x0f7e8c);
    material.opacity = isDarkMode ? 0.03 : 0.02;
  }, [isDarkMode, material]);

  useFrame((_, delta) => {
    if (pointsRef.current) {
      // Optimized rotation with reduced motion support
      const rotationSpeed = prefersReducedMotion() ? 0 : 1;
      pointsRef.current.rotation.y += delta * 0.008 * rotationSpeed;
      pointsRef.current.rotation.x += delta * 0.003 * rotationSpeed;
    }
  });

  // Check for reduced motion preference
  const prefersReducedMotion = () => {
    return typeof window !== 'undefined' && 
           window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  };

  return (
    <primitive 
      ref={pointsRef} 
      object={new THREE.Points(geometry, material)}
    />
  );
}

export function ParticleCanvas() {
  const [devicePixelRatio, setDevicePixelRatio] = useState(1);
  const [particleCount, setParticleCount] = useState(15000);

  // Optimize particle count based on device capabilities
  useEffect(() => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    setDevicePixelRatio(dpr);

    // Adjust particle count based on device performance
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    
    if (gl && gl instanceof WebGLRenderingContext) {
      const renderer = gl.getParameter(gl.RENDERER);
      const isLowEnd = renderer && (
        renderer.includes('Intel') ||
        renderer.includes('PowerVR') ||
        renderer.includes('Mali')
      );
      
      // Reduce particles on lower-end devices
      if (isLowEnd) {
        setParticleCount(8000);
      } else if (dpr > 1.5) {
        setParticleCount(12000);
      }
    }

    // Further reduce on mobile
    if (window.innerWidth < 768) {
      setParticleCount(prev => prev * 0.6);
    }
  }, []);

  return (
    <div 
      className="fixed inset-0 z-0 pointer-events-none" 
      style={{ 
        position: 'relative', 
        width: '100%', 
        height: '100%', 
        overflow: 'hidden',
        willChange: 'transform',
        transform: 'translateZ(0)', // Force GPU acceleration
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 8], fov: 60 }}
        style={{ display: 'block', width: '100%', height: '100%' }}
        dpr={[1, devicePixelRatio]}
        gl={{ 
          antialias: devicePixelRatio <= 1.5, // Disable antialiasing on high DPI
          alpha: true,
          powerPreference: 'high-performance',
          failIfMajorPerformanceCaveat: true,
        }}
        performance={{ min: 0.5 }} // Reduce frame rate if needed
        frameloop="demand" // Only render when necessary
      >
        <ambientLight intensity={0.3} />
        <Particles count={particleCount} />
      </Canvas>
    </div>
  );
}