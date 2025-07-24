'use client';

import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
// import { useScroll } from '@react-three/drei'
import * as THREE from 'three';
import { useTheme } from 'next-themes';
import * as Physics from './particlePhysics';
import vertexShader from '@/shaders/particle.vert.glsl';
import fragmentShader from '@/shaders/particle.frag.glsl';

interface ParticleSceneProps {
  count?: number
  mouseIntensity?: number
  isReducedMotion?: boolean
}

export function ParticleScene({ count = 800, isReducedMotion = false }: ParticleSceneProps) {
  const points = useRef<THREE.Points>(null);
  const group = useRef<THREE.Group>(null);
  const { viewport, mouse } = useThree();
  // const scroll = useScroll()
  const [scrollData, setScrollData] = React.useState({ offset: 0, delta: 0 });

  React.useEffect(() => {
    let lastScrollY = 0;
    let lastTime = performance.now();

    const handleScroll = () => {
      const currentTime = performance.now();
      const deltaTime = (currentTime - lastTime) / 1000; // Convert to seconds
      const scrollY = window.scrollY;
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrollOffset = scrollHeight > 0 ? scrollY / scrollHeight : 0;

      // Calculate velocity in viewport heights per second
      const scrollVelocity = deltaTime > 0 ? (scrollY - lastScrollY) / window.innerHeight / deltaTime : 0;

      setScrollData({
        offset: scrollOffset,
        delta: scrollVelocity, // This is now in viewport heights per second
      });

      lastScrollY = scrollY;
      lastTime = currentTime;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Initial call

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Initialize physics state once
  const particleState = useRef<Physics.ParticleState | null>(null);

  // Track previous viewport size for resize detection
  const prevViewport = useRef({ width: 0, height: 0 });

  // Lazy initialize particle state when viewport is ready
  if (!particleState.current && viewport.width > 0 && viewport.height > 0) {
    try {
      // const viewportChanged = prevViewport.current.width !== viewport.width ||
      //                       prevViewport.current.height !== viewport.height;

      const screenWidth = window.innerWidth;
      particleState.current = Physics.initialiseParticleState(count, viewport, screenWidth);
    } catch (error) {
      console.error('Failed to initialize particle state:', error);
      // Fallback: create a minimal valid state
      particleState.current = {
        count: 0,
        positions: new Float32Array(0),
        velocities: new Float32Array(0),
        roles: new Float32Array(0),
        sizes: new Float32Array(0),
        energies: new Float32Array(0),
        baseZ: new Float32Array(0),
        baseY: new Float32Array(0),
        nearestAngles: new Float32Array(0),
        nearestDistances: new Float32Array(0),
        hasTargets: new Float32Array(0),
        randomSeeds: new Float32Array(0),
      };
    }
    prevViewport.current = { width: viewport.width, height: viewport.height };
  }

  // Detect theme
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // Create shader material
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uIsDark: { value: isDark ? 1.0 : 0.0 },
        uScrollY: { value: 0 },
        uScrollOffsetY: { value: 0 },
        uViewport: { value: [0, 0] }, // Will be updated in useFrame
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: isDark ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
  }, [isDark]);

  // Cleanup material on unmount
  React.useEffect(() => {
    return () => {
      material.dispose();
    };
  }, [material]);

  // Enhanced physics-driven frame loop with scroll and parallax
  useFrame((state, delta) => {
    if (!points.current || !particleState.current) return;

    // Update uniforms
    if (material.uniforms.uTime) {
      material.uniforms.uTime.value = state.clock.elapsedTime;
    }
    if (material.uniforms.uIsDark) {
      material.uniforms.uIsDark.value = isDark ? 1.0 : 0.0;
    }
    if (material.uniforms.uScrollY) {
      material.uniforms.uScrollY.value = scrollData.offset;
    }
    if (material.uniforms.uScrollOffsetY) {
      material.uniforms.uScrollOffsetY.value = scrollData.offset * 2.0; // SCROLL_Y_MULTIPLIER
    }
    if (material.uniforms.uViewport) {
      material.uniforms.uViewport.value = [state.viewport.width, state.viewport.height];
    }

    // Check for viewport changes and handle resize
    if (prevViewport.current.width !== state.viewport.width ||
        prevViewport.current.height !== state.viewport.height) {
      if (prevViewport.current.width > 0 && prevViewport.current.height > 0) {
        Physics.handleViewportResize(
          particleState.current,
          prevViewport.current,
          state.viewport,
        );
      }
      prevViewport.current = { width: state.viewport.width, height: state.viewport.height };
    }

    // Calculate migration factor
    const migration = Math.min(scrollData.offset * 3, 1); // 0 to 1 as user scrolls through first third

    // Step the physics simulation with updated scroll data
    Physics.stepParticleState(
      particleState.current,
      delta,
      state.viewport,
      mouse,
      { y: scrollData.offset, velocity: scrollData.delta },
      isReducedMotion,
      state.clock.elapsedTime,
      { migration, offset: scrollData.offset },
    );

    // Group position no longer needed - scroll is handled in particle positions

    // Flag buffers for GPU update - only update essentials
    const attributes = points.current.geometry.attributes;
    if (attributes.position) attributes.position.needsUpdate = true;

    // Only update these if game mechanics are active
    const gameActive = particleState.current && particleState.current.roles &&
      particleState.current.roles.some((role, i) => role < 2 && (particleState.current?.hasTargets[i] ?? 0) > 0);
    if (gameActive) {
      if (attributes.aParticleSize) attributes.aParticleSize.needsUpdate = true;
      if (attributes.aVelocity) attributes.aVelocity.needsUpdate = true;
      if (attributes.aNearestAngle) attributes.aNearestAngle.needsUpdate = true;
      if (attributes.aNearestDistance) attributes.aNearestDistance.needsUpdate = true;
      if (attributes.aHasTarget) attributes.aHasTarget.needsUpdate = true;
    }
  });

  // Safety check
  if (!particleState.current || !particleState.current.positions || particleState.current.positions.length === 0) {
    return null;
  }

  return (
    <group ref={group}>
      <points ref={points}>
        <bufferGeometry>
          <bufferAttribute
            args={[particleState.current.positions, 3]}
            attach="attributes-position"
          />
          <bufferAttribute
            args={[Float32Array.from({ length: count }, () => Math.random()), 1]}
            attach="attributes-aRandom"
          />
          <bufferAttribute
            args={[particleState.current.roles, 1]}
            attach="attributes-aGameRole"
          />
          <bufferAttribute
            args={[particleState.current.sizes, 1]}
            attach="attributes-aParticleSize"
          />
          <bufferAttribute
            args={[particleState.current.velocities, 3]}
            attach="attributes-aVelocity"
          />
          <bufferAttribute
            args={[particleState.current.nearestAngles, 1]}
            attach="attributes-aNearestAngle"
          />
          <bufferAttribute
            args={[particleState.current.nearestDistances, 1]}
            attach="attributes-aNearestDistance"
          />
          <bufferAttribute
            args={[particleState.current.hasTargets, 1]}
            attach="attributes-aHasTarget"
          />
        </bufferGeometry>
        <primitive attach="material" object={material} />
      </points>
    </group>
  );
}