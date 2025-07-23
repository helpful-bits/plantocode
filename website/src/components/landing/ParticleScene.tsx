'use client'

import { useRef, useMemo, useState, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import vertexShader from '@/shaders/particle.vertex'
import fragmentShader from '@/shaders/particle.fragment'

interface ParticleSceneProps {
  count?: number
  mouseIntensity?: number
}

export function ParticleScene({ count = 3000, mouseIntensity = 0.5 }: ParticleSceneProps) {
  // Detect device capabilities for performance optimization
  const isMobile = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768 || 'ontouchstart' in window;
  }, []);
  
  // Reduce particle count on mobile devices
  const optimizedCount = useMemo(() => {
    return isMobile ? Math.min(1500, count) : count;
  }, [count, isMobile]);
  const points = useRef<THREE.Points>(null)
  const mouse = useRef(new THREE.Vector2(0, 0))
  const { viewport, gl } = useThree()
  
  // Detect if bloom should be enabled based on performance
  const enableBloom = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const isHighEnd = navigator.hardwareConcurrency > 4 && window.innerWidth > 1024;
    return isHighEnd;
  }, [])

  // Generate particle attributes
  const { positions, randoms, originalPositions } = useMemo(() => {
    const positions = new Float32Array(optimizedCount * 3)
    const randoms = new Float32Array(optimizedCount)
    const originalPositions = new Float32Array(optimizedCount * 3)

    for (let i = 0; i < optimizedCount; i++) {
      const i3 = i * 3
      
      // Create particles in a larger vertical space for continuous scrolling
      const x = (Math.random() - 0.5) * viewport.width * 2
      const y = (Math.random() - 0.5) * viewport.height * 4 // Double the vertical space
      const z = (Math.random() - 0.5) * 10

      positions[i3] = x
      positions[i3 + 1] = y
      positions[i3 + 2] = z

      originalPositions[i3] = x
      originalPositions[i3 + 1] = y
      originalPositions[i3 + 2] = z

      randoms[i] = Math.random()
    }

    return { positions, randoms, originalPositions }
  }, [optimizedCount, viewport])

  // Detect theme
  const [isDark, setIsDark] = useState(true)
  
  useEffect(() => {
    // Check if dark mode is active
    const checkTheme = () => {
      const isDarkMode = document.documentElement.classList.contains('dark')
      setIsDark(isDarkMode)
      
      // Set WebGL clear color based on theme
      if (isDarkMode) {
        // Dark navy background
        gl.setClearColor(0x141e2a, 1) // Approximate oklch(0.18 0.02 206) in hex
      } else {
        // Pure white background
        gl.setClearColor(0xffffff, 1)
      }
    }
    checkTheme()
    
    // Listen for theme changes
    const observer = new MutationObserver(checkTheme)
    observer.observe(document.documentElement, { 
      attributes: true, 
      attributeFilter: ['class'] 
    })
    
    return () => observer.disconnect()
  }, [gl])

  // Track scroll position and card positions
  const scrollY = useRef(0)
  const isHovering = useRef(false)
  const cardBounds = useRef<Array<{x: number, y: number, width: number, height: number}>>([]);
  
  useEffect(() => {
    // Passive scroll listener for better performance
    const handleScroll = () => {
      scrollY.current = window.scrollY
    }
    
    // Track mouse enter/leave for hover effects
    const handleMouseEnter = () => {
      isHovering.current = true
    }
    const handleMouseLeave = () => {
      isHovering.current = false
    }
    
    // Debounced card position update
    let updateTimer: NodeJS.Timeout;
    const updateCardPositions = () => {
      clearTimeout(updateTimer);
      updateTimer = setTimeout(() => {
        const cards = document.querySelectorAll('.glass, .glass-subtle, .glass-elevated, .glass-intense');
        cardBounds.current = Array.from(cards).map(card => {
          const rect = card.getBoundingClientRect();
          const scrollTop = window.scrollY;
          return {
            x: (rect.left + rect.width / 2 - window.innerWidth / 2) / window.innerWidth * viewport.width,
            y: -(rect.top + rect.height / 2 - window.innerHeight / 2 + scrollTop) / window.innerHeight * viewport.height,
            width: rect.width / window.innerWidth * viewport.width,
            height: rect.height / window.innerHeight * viewport.height
          };
        });
      }, 100); // Debounce by 100ms
    };
    
    // Use passive listeners for better scroll performance
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('scroll', updateCardPositions, { passive: true })
    window.addEventListener('resize', updateCardPositions)
    document.addEventListener('mouseenter', handleMouseEnter)
    document.addEventListener('mouseleave', handleMouseLeave)
    
    // Initial card position update
    updateCardPositions();
    
    return () => {
      clearTimeout(updateTimer);
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('scroll', updateCardPositions)
      window.removeEventListener('resize', updateCardPositions)
      document.removeEventListener('mouseenter', handleMouseEnter)
      document.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [viewport])
  
  // Create shader material
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uMouse: { value: new THREE.Vector2(0, 0) },
        uMouseIntensity: { value: mouseIntensity },
        uIsDark: { value: isDark ? 1.0 : 0.0 },
        uScrollY: { value: 0 },
        uIsHovering: { value: 0.0 },
        uCardPositions: { value: new Float32Array(40) }, // Max 10 cards * 4 values each
        uCardCount: { value: 0 },
        uMouseVelocity: { value: new THREE.Vector2(0, 0) }
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: isDark ? THREE.AdditiveBlending : THREE.NormalBlending
    })
  }, [mouseIntensity, isDark])

  // Frame counter for performance optimization
  const frameCount = useRef(0)
  const lastMouseUpdate = useRef(0)
  const mouseVelocity = useRef({ x: 0, y: 0 })
  const lastMousePos = useRef({ x: 0, y: 0 })
  
  // Update mouse position with frame skipping
  useFrame((state) => {
    if (!points.current) return
    
    frameCount.current++
    
    // Update time uniform every frame for smooth animation
    if (material.uniforms.uTime) {
      material.uniforms.uTime.value = state.clock.elapsedTime
    }

    // Update theme uniform only when changed
    if (material.uniforms.uIsDark && material.uniforms.uIsDark.value !== (isDark ? 1.0 : 0.0)) {
      material.uniforms.uIsDark.value = isDark ? 1.0 : 0.0
    }

    // Enhanced mouse interaction with velocity and adaptive update rate
    const now = state.clock.elapsedTime;
    const shouldUpdateMouse = isMobile ? 
      (frameCount.current % 3 === 0) : // Update every 3 frames on mobile
      (frameCount.current % 2 === 0);  // Update every 2 frames on desktop
      
    if (shouldUpdateMouse) {
      const targetMouse = state.pointer;
      const targetX = targetMouse.x * viewport.width / 2;
      const targetY = targetMouse.y * viewport.height / 2;
      
      // Calculate mouse velocity for enhanced attraction effect
      const deltaTime = now - lastMouseUpdate.current;
      if (deltaTime > 0) {
        mouseVelocity.current.x = (targetX - lastMousePos.current.x) / deltaTime;
        mouseVelocity.current.y = (targetY - lastMousePos.current.y) / deltaTime;
      }
      
      // Smoother interpolation with velocity-based attraction strength
      const velocityMagnitude = Math.sqrt(mouseVelocity.current.x ** 2 + mouseVelocity.current.y ** 2);
      const dynamicLerp = Math.min(0.25, 0.15 + velocityMagnitude * 0.1);
      
      mouse.current.x = THREE.MathUtils.lerp(mouse.current.x, targetX, dynamicLerp);
      mouse.current.y = THREE.MathUtils.lerp(mouse.current.y, targetY, dynamicLerp);
      
      if (material.uniforms.uMouse) {
        material.uniforms.uMouse.value.set(mouse.current.x, mouse.current.y);
      }
      
      // Update mouse intensity based on velocity for dynamic attraction
      if (material.uniforms.uMouseIntensity) {
        const baseIntensity = mouseIntensity;
        const velocityBoost = Math.min(0.5, velocityMagnitude * 0.01);
        material.uniforms.uMouseIntensity.value = baseIntensity + velocityBoost;
      }
      
      // Pass mouse velocity to shader
      if (material.uniforms.uMouseVelocity) {
        material.uniforms.uMouseVelocity.value.set(
          mouseVelocity.current.x, 
          mouseVelocity.current.y
        );
      }
      
      lastMousePos.current = { x: targetX, y: targetY };
      lastMouseUpdate.current = now;
    }
    
    // Update scroll position for parallax effect
    if (material.uniforms.uScrollY) {
      material.uniforms.uScrollY.value = scrollY.current * 0.001
    }
    
    // Update hover state with smooth transition
    if (material.uniforms.uIsHovering) {
      const targetHover = isHovering.current ? 1.0 : 0.0
      material.uniforms.uIsHovering.value = THREE.MathUtils.lerp(
        material.uniforms.uIsHovering.value,
        targetHover,
        0.1
      )
    }
    
    // Update card positions for fluid dynamics (throttled for performance)
    if (frameCount.current % 4 === 0 && material.uniforms.uCardPositions && material.uniforms.uCardCount) {
      const positions = new Float32Array(40);
      const count = Math.min(cardBounds.current.length, 10);
      
      for (let i = 0; i < count; i++) {
        const card = cardBounds.current[i];
        positions[i * 4] = card.x;
        positions[i * 4 + 1] = card.y;
        positions[i * 4 + 2] = card.width;
        positions[i * 4 + 3] = card.height;
      }
      
      material.uniforms.uCardPositions.value = positions;
      material.uniforms.uCardCount.value = count;
    }
  })

  return (
    <>
      <points ref={points}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
          />
          <bufferAttribute
            attach="attributes-aRandom"
            args={[randoms, 1]}
          />
          <bufferAttribute
            attach="attributes-aOriginalPosition"
            args={[originalPositions, 3]}
          />
        </bufferGeometry>
        <primitive object={material} attach="material" />
      </points>

      {enableBloom && (
        <EffectComposer disableNormalPass>
          <Bloom 
            intensity={isMobile ? 0.4 : 0.6}
            luminanceThreshold={0.25}
            luminanceSmoothing={0.9}
            height={isMobile ? 200 : 300}
            kernelSize={isMobile ? 1 : 2}
          />
        </EffectComposer>
      )}
    </>
  )
}