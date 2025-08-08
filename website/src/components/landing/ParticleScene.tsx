'use client';

import React, { useRef, useMemo, useLayoutEffect, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useTheme } from 'next-themes';
import { useFBO } from '@react-three/drei';
import { useLenis } from 'lenis/react';
import positionComputeShader from '@/graphics/gpgpu/position.frag.glsl';
import velocityComputeShader from '@/graphics/gpgpu/velocity.frag.glsl';
import { createInitialParticleTextures, buildVelocityUniforms } from './particleGPGPU';
import { useParticleConfig } from '@/hooks/useParticleConfig';
import vertexShader from '@/graphics/particle.vert.glsl';
import fragmentShader from '@/graphics/particle.frag.glsl';
import { SafeZone } from '@/lib/particle-config';
interface ParticleSceneProps {
  leaderCount: number
  followerCount: number
  forceWeights?: {
    seek: number
    alignment: number
    separation: number
    centerRepulsion: number
    cohesion: number
  }
  physicsConstants?: {
    MAX_SPEED: number
    DRAG_COEFFICIENT: number
    SEEK_MAX_FORCE: number
    SEPARATION_RADIUS: number
    SEPARATION_FORCE: number
    SCROLL_IMPULSE_STRENGTH: number
  }
}

export function ParticleScene({ leaderCount, followerCount, forceWeights, physicsConstants }: ParticleSceneProps) {
  const totalCount = leaderCount + followerCount;
  const points = useRef<THREE.Points>(null);
  const group = useRef<THREE.Group>(null);
  const { viewport, mouse, gl } = useThree();
  const scrollData = useRef({ offset: 0, delta: 0 });
  
  // Use default weights if not provided
  const weights = forceWeights || {
    seek: 0.6,
    alignment: 0.3,
    separation: 1.2,
    centerRepulsion: 2.0,
    cohesion: 0.4
  };
  
  // Use default physics constants if not provided
  const physics = physicsConstants || {
    MAX_SPEED: 80.0,
    DRAG_COEFFICIENT: 0.95,
    SEEK_MAX_FORCE: 0.8,
    SEPARATION_RADIUS: 50.0,
    SEPARATION_FORCE: 0.8,
    SCROLL_IMPULSE_STRENGTH: 50.0
  };

  useLenis((lenis) => {
    scrollData.current = {
      offset: lenis.progress,
      delta: lenis.velocity,
    };
  });

  const { resolvedTheme, theme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const { } = useParticleConfig();

  const textureSize = Math.ceil(Math.sqrt(totalCount));

  const textureType = useMemo(() => {
    const isWebGL2 = gl.capabilities.isWebGL2;
    if (!isWebGL2) return THREE.HalfFloatType;
    
    const hasFullFloatRT = gl.extensions.get('EXT_color_buffer_float');
    const hasHalfFloatRT = gl.extensions.get('EXT_color_buffer_half_float');
    
    // Prefer full float for better precision to avoid accumulated errors
    if (hasFullFloatRT) {
      return THREE.FloatType;
    }
    
    // Fall back to half float if available
    if (hasHalfFloatRT) {
      return THREE.HalfFloatType;
    }
    
    // Worst case: use unsigned byte (will have precision issues)
    return THREE.UnsignedByteType;
  }, [gl]);

  const fboSettings = useMemo(() => ({
    type: textureType,
    format: THREE.RGBAFormat,
    magFilter: THREE.NearestFilter,
    minFilter: THREE.NearestFilter,
    generateMipmaps: false,
    depthBuffer: false,
    stencilBuffer: false,
  }), [textureType]);

  const posFBO1 = useFBO(textureSize, textureSize, fboSettings);
  const posFBO2 = useFBO(textureSize, textureSize, fboSettings);
  const velFBO1 = useFBO(textureSize, textureSize, fboSettings);
  const velFBO2 = useFBO(textureSize, textureSize, fboSettings);

  const pos = useRef({ read: posFBO1, write: posFBO2 });
  const vel = useRef({ read: velFBO1, write: velFBO2 });

  const metadataTexture = useRef<THREE.DataTexture | null>(null);

  const positionComputeMaterial = useMemo(() => {
    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        texturePosition: { value: null },
        textureVelocity: { value: null },
        textureAttributes: { value: null },
        resolution: { value: new THREE.Vector2(textureSize, textureSize) },
        uDeltaTime: { value: 0 },
        uViewportBounds: { value: new THREE.Vector2(viewport.width / 2, viewport.height / 2) },
        uTime: { value: 0 },
        uLeaderCount: { value: leaderCount },
        uTotalCount: { value: totalCount },
      },
      vertexShader: `
        void main() {
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: positionComputeShader,
    });
    return material;
  }, [textureSize, viewport, totalCount]);

  const velocityComputeMaterial = useMemo(() => {
    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: buildVelocityUniforms({
        textureSize: new THREE.Vector2(textureSize, textureSize),
        viewport: new THREE.Vector2(viewport.width, viewport.height),
        leaderCount: leaderCount,
        totalCount: totalCount,
        weights: {
          cohesion: weights.cohesion,
          alignment: weights.alignment,
          separation: weights.separation,
          seek: weights.seek,
          centerRepulsion: weights.centerRepulsion,
        },
        physics: {
          maxSpeed: physics.MAX_SPEED,
          dragCoefficient: physics.DRAG_COEFFICIENT,
          seekMaxForce: physics.SEEK_MAX_FORCE,
          separationRadius: physics.SEPARATION_RADIUS,
          separationForce: physics.SEPARATION_FORCE,
          scrollImpulseStrength: physics.SCROLL_IMPULSE_STRENGTH,
        },
        safeZone: SafeZone,
      }),
      vertexShader: `
        void main() {
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: velocityComputeShader,
    });
    return material;
  }, [textureSize, viewport, leaderCount, weights, physics, totalCount]);


  const particleMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      uniforms: {
        uTime: { value: 0 },
        uIsDark: { value: isDark ? 1.0 : 0.0 },
        uViewport: { value: new THREE.Vector2(viewport.width, viewport.height) },
        texturePosition: { value: null },
        textureVelocity: { value: null },
        textureAttributes: { value: null },
        uTextureSize: { value: new THREE.Vector2(textureSize, textureSize) },
        uLeaderColor: { value: new THREE.Color() },
        uFollowerBaseColor: { value: new THREE.Color() },
        uFollowerHighlightColor: { value: new THREE.Color() },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: isDark ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
  }, [isDark, textureSize, viewport]);

  const computeCamera = useMemo(() => {
    return new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }, []);

  const fullscreenQuad = useMemo(() => {
    return new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  }, []);

  // Update particle colors from CSS variables
  useLayoutEffect(() => {
    const style = getComputedStyle(document.documentElement);
    if (particleMaterial) {
      // Get the computed color values with proper trimming
      const leaderColor = style.getPropertyValue('--particle-leader-color').trim();
      const followerBaseColor = style.getPropertyValue('--particle-follower-base-color').trim();
      const followerHighlightColor = style.getPropertyValue('--particle-follower-highlight-color').trim();
      
      // Set colors - Three.js setStyle supports oklch
      particleMaterial.uniforms.uLeaderColor!.value.setStyle(leaderColor);
      particleMaterial.uniforms.uFollowerBaseColor!.value.setStyle(followerBaseColor);
      particleMaterial.uniforms.uFollowerHighlightColor!.value.setStyle(followerHighlightColor);
    }
  }, [theme, particleMaterial]);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();

    const positions = new Float32Array(totalCount * 3);
    const uvs = new Float32Array(totalCount * 2);
    const ids = new Float32Array(totalCount);

    for (let i = 0; i < totalCount; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;

      const x = (i % textureSize) / textureSize;
      const y = Math.floor(i / textureSize) / textureSize;
      uvs[i * 2] = x;
      uvs[i * 2 + 1] = y;

      ids[i] = i;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setAttribute('aId', new THREE.BufferAttribute(ids, 1));

    return geo;
  }, [totalCount, textureSize]);

  useLayoutEffect(() => {
    if (!gl || !viewport) return;

    // Calculate actual viewport size at particle depth for initialization
    const distance = 10; // Camera at z=5, particles at z=-5
    const vFov = 75 * Math.PI / 180;
    const visibleHeight = 2 * Math.tan(vFov / 2) * distance;
    const visibleWidth = visibleHeight * viewport.aspect;
    
    const { positionTexture, velocityTexture, metadataTexture: metaTex } = createInitialParticleTextures(
      textureSize,
      totalCount,
      { width: visibleWidth, height: visibleHeight },
      leaderCount,
      followerCount
    );

    metadataTexture.current = metaTex;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        glslVersion: THREE.GLSL3,
        uniforms: { inputTexture: { value: null } },
        vertexShader: `
          void main() {
            gl_Position = vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          precision highp float;
          uniform sampler2D inputTexture;
          layout(location = 0) out vec4 fragColor;
          void main() {
            vec2 uv = gl_FragCoord.xy / vec2(${textureSize}.0);
            fragColor = texture(inputTexture, uv);
          }
        `,
      }),
    );
    scene.add(quad);

    gl.setRenderTarget(pos.current.read);
    quad.material.uniforms.inputTexture!.value = positionTexture;
    gl.render(scene, camera);

    gl.setRenderTarget(vel.current.read);
    quad.material.uniforms.inputTexture!.value = velocityTexture;
    gl.render(scene, camera);

    gl.setRenderTarget(null);

    quad.geometry.dispose();
    quad.material.dispose();
    positionTexture.dispose();
    velocityTexture.dispose();
  }, [gl, viewport, textureSize, totalCount, leaderCount, followerCount]);

  // Visibility tracking
  const isVisibleRef = useRef(true);
  const accumulatorRef = useRef(0);
  const frameTimeRef = useRef(0);
  const adaptiveUniformsRef = useRef({ noiseStrength: 5.0 });
  
  // Track document visibility
  useEffect(() => {
    const handleVisibilityChange = () => {
      isVisibleRef.current = document.visibilityState === 'visible';
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Swap utility function for ping-ponging FBOs
  const swapFBO = (ref: React.MutableRefObject<{ read: any; write: any }>) => {
    const temp = ref.current.read;
    ref.current.read = ref.current.write;
    ref.current.write = temp;
  };

  useFrame((state, delta) => {
    if (!metadataTexture.current) return;
    
    // Early return if tab is not visible
    if (!isVisibleRef.current) return;
    
    // Track frame time for adaptive quality
    frameTimeRef.current = delta;
    
    // Adaptive quality based on frame time
    if (delta > 0.03) { // Less than 33fps
      adaptiveUniformsRef.current.noiseStrength = Math.max(1.0, adaptiveUniformsRef.current.noiseStrength * 0.95);
    } else if (delta < 0.02) { // More than 50fps
      adaptiveUniformsRef.current.noiseStrength = Math.min(5.0, adaptiveUniformsRef.current.noiseStrength * 1.02);
    }
    
    // Calculate actual viewport size at particle depth (z = -5)
    // Camera is at z = 5, particles at z = -5, so distance = 10
    const distance = 10; // Camera to particle distance
    const vFov = 75 * Math.PI / 180; // Convert FOV to radians
    const visibleHeight = 2 * Math.tan(vFov / 2) * distance;
    const visibleWidth = visibleHeight * state.viewport.aspect;
    
    // Fixed timestep accumulator for consistent simulation at 60Hz
    const fixedTimeStep = 1 / 60;
    accumulatorRef.current += Math.min(delta, 0.1); // Cap delta to prevent spiral of death
    
    // Only run simulation at fixed timestep
    if (accumulatorRef.current < fixedTimeStep) {
      // Still update render uniforms even when not simulating
      particleMaterial.uniforms.uTime!.value = state.clock.elapsedTime;
      particleMaterial.uniforms.uIsDark!.value = isDark ? 1.0 : 0.0;
      particleMaterial.uniforms.uViewport!.value.set(visibleWidth, visibleHeight);
      return;
    }
    
    // Run simulation step(s)
    while (accumulatorRef.current >= fixedTimeStep) {
      accumulatorRef.current -= fixedTimeStep;

    // Pass 1: Update velocities
    velocityComputeMaterial.uniforms.texturePosition!.value = pos.current.read.texture;
    velocityComputeMaterial.uniforms.textureVelocity!.value = vel.current.read.texture;
    velocityComputeMaterial.uniforms.textureAttributes!.value = metadataTexture.current;
    velocityComputeMaterial.uniforms.uTime!.value = state.clock.elapsedTime;
    velocityComputeMaterial.uniforms.uDeltaTime!.value = delta;
    velocityComputeMaterial.uniforms.uMouse!.value.set(mouse.x, mouse.y);
    velocityComputeMaterial.uniforms.uScrollVelocity!.value = scrollData.current.delta; // Full scroll influence
    velocityComputeMaterial.uniforms.uViewport!.value.set(visibleWidth, visibleHeight);
    velocityComputeMaterial.uniforms.uSafeZone!.value.set(SafeZone.width, SafeZone.height);
    velocityComputeMaterial.uniforms.uNoiseScale!.value = 0.002;
    velocityComputeMaterial.uniforms.uNoiseStrength!.value = adaptiveUniformsRef.current.noiseStrength;

    fullscreenQuad.material = velocityComputeMaterial;
    gl.setRenderTarget(vel.current.write);
    gl.render(fullscreenQuad, computeCamera);
    swapFBO(vel);

    // Pass 2: Update positions using new velocities
    positionComputeMaterial.uniforms.texturePosition!.value = pos.current.read.texture;
    positionComputeMaterial.uniforms.textureVelocity!.value = vel.current.read.texture;
    positionComputeMaterial.uniforms.textureAttributes!.value = metadataTexture.current;
    positionComputeMaterial.uniforms.uDeltaTime!.value = fixedTimeStep;
    positionComputeMaterial.uniforms.uTime!.value = state.clock.elapsedTime;
    positionComputeMaterial.uniforms.uViewportBounds!.value.set(visibleWidth / 2, visibleHeight / 2);

    fullscreenQuad.material = positionComputeMaterial;
    gl.setRenderTarget(pos.current.write);
    gl.render(fullscreenQuad, computeCamera);
    swapFBO(pos);

    gl.setRenderTarget(null);
    }

    // Always update render uniforms
    particleMaterial.uniforms.uTime!.value = state.clock.elapsedTime;
    particleMaterial.uniforms.uIsDark!.value = isDark ? 1.0 : 0.0;
    particleMaterial.uniforms.uViewport!.value.set(visibleWidth, visibleHeight);
    particleMaterial.uniforms.texturePosition!.value = pos.current.read.texture;
    particleMaterial.uniforms.textureVelocity!.value = vel.current.read.texture;
    particleMaterial.uniforms.textureAttributes!.value = metadataTexture.current;
    
  });

  React.useEffect(() => {
    return () => {
      if (particleMaterial) particleMaterial.dispose();
      if (geometry) geometry.dispose();
      if (positionComputeMaterial) positionComputeMaterial.dispose();
      if (velocityComputeMaterial) velocityComputeMaterial.dispose();
      if (metadataTexture.current) metadataTexture.current.dispose();
      if (fullscreenQuad.geometry) fullscreenQuad.geometry.dispose();
    };
  }, [particleMaterial, geometry, positionComputeMaterial, velocityComputeMaterial, fullscreenQuad]);

  if (!geometry || !particleMaterial) {
    return null;
  }

  return (
    <group ref={group}>
      <points ref={points} geometry={geometry} material={particleMaterial} />
    </group>
  );
}