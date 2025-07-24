'use client'

import React, { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useScroll } from '@react-three/drei'
import * as THREE from 'three'
import { useTheme } from 'next-themes'
import * as Physics from './particlePhysics'

interface ParticleSceneProps {
  count?: number
  mouseIntensity?: number
  isReducedMotion?: boolean
}

export function ParticleScene({ count = 800, isReducedMotion = false }: ParticleSceneProps) {
  const points = useRef<THREE.Points>(null)
  const group = useRef<THREE.Group>(null)
  const { viewport, mouse } = useThree()
  const scroll = useScroll()

  // Initialize physics state once
  const particleState = useRef<Physics.ParticleState | null>(null)
  
  // Ensure we only initialize after mount with valid viewport
  const [mounted, setMounted] = React.useState(false)
  
  React.useEffect(() => {
    setMounted(true)
  }, [])
  
  // Track previous viewport size for resize detection
  const prevViewport = useRef({ width: 0, height: 0 })
  
  React.useEffect(() => {
    if (mounted && viewport.width > 0 && viewport.height > 0) {
      const viewportChanged = prevViewport.current.width !== viewport.width || 
                            prevViewport.current.height !== viewport.height;
      
      if (!particleState.current) {
        // Initial creation
        try {
          const screenWidth = window.innerWidth;
          particleState.current = Physics.initialiseParticleState(count, viewport, screenWidth)
        } catch (error) {
          console.error('Failed to initialize particle state:', error)
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
            hasTargets: new Float32Array(0)
          }
        }
      } else if (viewportChanged && particleState.current.count > 0) {
        // Handle resize - reposition particles for new viewport
        const widthRatio = viewport.width / prevViewport.current.width;
        const heightRatio = viewport.height / prevViewport.current.height;
        
        // Scale all particle positions to fit new viewport
        for (let i = 0; i < particleState.current.count; i++) {
          const i3 = i * 3;
          // Scale X and Y positions
          particleState.current.positions[i3] *= widthRatio;
          particleState.current.positions[i3 + 1] *= heightRatio;
          
          // Scale base Y positions too
          particleState.current.baseY[i] *= heightRatio;
          
          // Add some random motion to make resize feel dynamic
          particleState.current.velocities[i3] += (Math.random() - 0.5) * 0.05;
          particleState.current.velocities[i3 + 1] += (Math.random() - 0.5) * 0.05;
        }
      }
      
      prevViewport.current = { width: viewport.width, height: viewport.height };
    }
  }, [mounted, count, viewport.width, viewport.height])

  // Detect theme
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  // Enhanced vertex shader with parallax and scroll effects
  const vertexShader = `
    uniform float uTime;
    uniform float uIsDark;
    uniform float uScrollY;

    attribute float aRandom;
    attribute float aGameRole;
    attribute float aParticleSize;
    attribute vec3 aVelocity;
    attribute float aNearestAngle;
    attribute float aNearestDistance;
    attribute float aHasTarget;

    varying float vAlpha;
    varying vec3 vColor;
    varying float vHasTarget;
    varying vec3 vVelocity;
    varying float vNearestAngle;

    void main() {
      vec3 pos = position;
      
      // Pass to fragment shader
      vHasTarget = aHasTarget;
      vVelocity = aVelocity;
      vNearestAngle = aNearestAngle;
      
      // Simple breathing effect based on size
      float gameTime = uTime * 0.3;
      float currentSize = aParticleSize;
      float visualBreathing = 1.0 + sin(gameTime * 1.5 + aRandom * 6.28) * 0.03;
      currentSize *= visualBreathing;
      
      // Size-based burst visual effect
      float burstEffect = smoothstep(1.0, 1.3, aParticleSize);
      if (burstEffect > 0.7) {
        currentSize *= 1.0 + sin(gameTime * 8.0 + aRandom * 3.14) * 0.1 * burstEffect;
      }
      
      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      
      // Dynamic point size with velocity and scroll-based enhancement
      float velocityGlow = 1.0 + length(aVelocity) * 0.5;
      float scrollSizeEffect = 1.0 - uScrollY * 0.3; // Particles shrink as you scroll
      float gameSizeMultiplier = 0.8 + currentSize * 1.2;
      gl_PointSize = 70.0 * gameSizeMultiplier * velocityGlow * scrollSizeEffect / length(mvPosition.xyz) * (0.6 + aRandom * 0.4);
      
      // Teal color variations with velocity glow
      float colorIntensity = 1.0 + length(aVelocity) * 0.3;
      
      if (uIsDark > 0.5) {
        // Dark mode - brighter teal variations
        if (aGameRole < 1.0) {
          // Chasers: Bright cyan-teal
          vColor = vec3(0.2, 0.9, 0.8) * colorIntensity;
        } else if (aGameRole < 2.0) {
          // Runners: Medium teal
          vColor = vec3(0.3, 0.8, 0.7) * colorIntensity;
        } else {
          // Neutral: Deep teal
          vColor = vec3(0.4, 0.7, 0.6) * colorIntensity;
        }
      } else {
        // Light mode - darker teal variations
        if (aGameRole < 1.0) {
          // Chasers: Deep teal
          vColor = vec3(0.1, 0.5, 0.45) * colorIntensity;
        } else if (aGameRole < 2.0) {
          // Runners: Medium dark teal
          vColor = vec3(0.15, 0.4, 0.38) * colorIntensity;
        } else {
          // Neutral: Soft teal
          vColor = vec3(0.2, 0.45, 0.42) * colorIntensity;
        }
      }
      
      float alphaBoost = uIsDark > 0.5 ? 1.0 : 1.8;
      vAlpha = (0.5 + aRandom * 0.4) * (0.7 + currentSize * 0.6) * alphaBoost;
    }
  `

  // Enhanced fragment shader with velocity-based effects
  const fragmentShader = `
    varying float vAlpha;
    varying vec3 vColor;
    varying float vHasTarget;
    varying vec3 vVelocity;
    varying float vNearestAngle;

    void main() {
      vec2 center = gl_PointCoord - vec2(0.5);
      
      // Rotate coordinates based on velocity for stretching effect
      float velocityAngle = atan(vVelocity.y, vVelocity.x);
      float cosAngle = cos(velocityAngle);
      float sinAngle = sin(velocityAngle);
      vec2 rotatedCenter = vec2(
        center.x * cosAngle - center.y * sinAngle,
        center.x * sinAngle + center.y * cosAngle
      );
      
      // Apply stretch based on velocity magnitude
      float velocityMag = length(vVelocity);
      float stretch = 1.0 + velocityMag * 0.3;
      rotatedCenter.x /= stretch;
      
      float distance = length(rotatedCenter);
      
      if (distance > 0.5) {
        discard;
      }
      
      float innerGlow = 1.0 - smoothstep(0.0, 0.2, distance);
      float outerGlow = 1.0 - smoothstep(0.2, 0.5, distance);
      
      // Add teal hunting glow when chasing a target
      float huntGlow = 0.0;
      if (vHasTarget > 0.5) {
        huntGlow = innerGlow * 0.3 * (0.5 + sin(vNearestAngle * 3.0) * 0.5);
      }
      
      float alpha = (innerGlow * 0.9 + outerGlow * 0.3) * vAlpha;
      vec3 finalColor = vColor + (innerGlow * 0.3) + vec3(0.0, huntGlow * 0.8, huntGlow * 0.7);
      
      gl_FragColor = vec4(finalColor, alpha);
    }
  `

  // Create shader material
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uIsDark: { value: isDark ? 1.0 : 0.0 },
        uScrollY: { value: 0 }
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: isDark ? THREE.AdditiveBlending : THREE.NormalBlending
    })
  }, [isDark])

  // Enhanced physics-driven frame loop with scroll and parallax
  useFrame((state, delta) => {
    if (!points.current || !particleState.current) return
    
    // Update uniforms
    if (material.uniforms.uTime) {
      material.uniforms.uTime.value = state.clock.elapsedTime
    }
    if (material.uniforms.uIsDark) {
      material.uniforms.uIsDark.value = isDark ? 1.0 : 0.0
    }
    if (material.uniforms.uScrollY) {
      material.uniforms.uScrollY.value = scroll.offset
    }

    // Step the physics simulation with updated scroll data
    Physics.stepParticleState(
      particleState.current,
      delta,
      state.viewport,
      mouse,
      { y: scroll.offset, velocity: scroll.delta },
      isReducedMotion,
      state.clock.elapsedTime
    );

    // Group position no longer needed - scroll is handled in particle positions

    // Flag buffers for GPU update
    const attributes = points.current.geometry.attributes;
    if (attributes.position) attributes.position.needsUpdate = true;
    if (attributes.aParticleSize) attributes.aParticleSize.needsUpdate = true;
    if (attributes.aVelocity) attributes.aVelocity.needsUpdate = true;
    if (attributes.aNearestAngle) attributes.aNearestAngle.needsUpdate = true;
    if (attributes.aNearestDistance) attributes.aNearestDistance.needsUpdate = true;
    if (attributes.aHasTarget) attributes.aHasTarget.needsUpdate = true;
  })

  // Safety check
  if (!particleState.current || !particleState.current.positions || particleState.current.positions.length === 0) {
    return null
  }

  return (
    <group ref={group}>
      <points ref={points}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[particleState.current.positions, 3]}
          />
          <bufferAttribute
            attach="attributes-aRandom"
            args={[new Float32Array(count).map(() => Math.random()), 1]}
          />
          <bufferAttribute
            attach="attributes-aGameRole"
            args={[particleState.current.roles, 1]}
          />
          <bufferAttribute
            attach="attributes-aParticleSize"
            args={[particleState.current.sizes, 1]}
          />
          <bufferAttribute
            attach="attributes-aVelocity"
            args={[particleState.current.velocities, 3]}
          />
          <bufferAttribute
            attach="attributes-aNearestAngle"
            args={[particleState.current.nearestAngles, 1]}
          />
          <bufferAttribute
            attach="attributes-aNearestDistance"
            args={[particleState.current.nearestDistances, 1]}
          />
          <bufferAttribute
            attach="attributes-aHasTarget"
            args={[particleState.current.hasTargets, 1]}
          />
        </bufferGeometry>
        <primitive object={material} attach="material" />
      </points>
    </group>
  )
}