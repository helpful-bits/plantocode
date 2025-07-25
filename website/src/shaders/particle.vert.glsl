uniform float uTime;
uniform float uIsDark;
uniform float uScrollY;
uniform float uScrollOffsetY;
uniform vec2 uViewport;

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
  
  // Scroll offset is already applied in the physics, don't apply it again
  // pos.y += uScrollOffsetY;
  
  // Removed GPU turbulence - it was causing vibration
  
  // Pass to fragment shader
  vHasTarget = aHasTarget;
  vVelocity = aVelocity;
  vNearestAngle = aNearestAngle;
  
  // GPU-based size animations - no CPU updates needed
  float gameTime = uTime * 0.3;
  float currentSize = aParticleSize;
  
  // Breathing effect - reduced frequency
  float breathPhase = gameTime * 0.8 + aRandom * 6.28 + aParticleSize * 2.0;
  float visualBreathing = 1.0 + sin(breathPhase) * 0.02;
  currentSize *= visualBreathing;
  
  // Growing/shrinking animation based on size changes
  float sizePhase = gameTime * 3.0 + aParticleSize * 10.0;
  float growEffect = smoothstep(0.4, 1.2, aParticleSize);
  currentSize *= 1.0 + sin(sizePhase) * growEffect * 0.05;
  
  // Burst effect for large particles
  float burstEffect = smoothstep(1.0, 1.3, aParticleSize);
  if (burstEffect > 0.7) {
    currentSize *= 1.0 + sin(gameTime * 8.0 + aRandom * 3.14) * 0.1 * burstEffect;
  }
  
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  
  // Dynamic point size with velocity enhancement only - NO scroll size changes
  float velocityGlow = 1.0 + length(aVelocity) * 0.5;
  float gameSizeMultiplier = 0.8 + currentSize * 1.2;
  gl_PointSize = 70.0 * gameSizeMultiplier * velocityGlow / length(mvPosition.xyz) * (0.6 + aRandom * 0.4);
  
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
    // Light mode - optimized for additive blending
    // Using lower values that will add up nicely on white background
    if (aGameRole < 1.0) {
      // Chasers: Vibrant teal (lower values for additive)
      vColor = vec3(0.05, 0.25, 0.23) * colorIntensity;
    } else if (aGameRole < 2.0) {
      // Runners: Medium teal (lower values for additive)
      vColor = vec3(0.075, 0.2, 0.19) * colorIntensity;
    } else {
      // Neutral: Soft teal (lower values for additive)
      vColor = vec3(0.1, 0.225, 0.21) * colorIntensity;
    }
  }
  
  // Optimized alpha for performance
  // Light mode now uses lower alpha since we're using additive blending
  float alphaBoost = uIsDark > 0.5 ? 1.0 : 0.6;
  vAlpha = (0.5 + aRandom * 0.4) * (0.7 + currentSize * 0.6) * alphaBoost;
}