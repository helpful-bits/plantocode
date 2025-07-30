import * as THREE from 'three';

/**
 * Creates initial particle textures for GPU computation.
 * All physics constants are now defined in the shaders.
 *
 * @param textureSize - Size of the square texture (width and height)
 * @param count - Number of particles (actual count, not texture size squared)
 * @param viewport - Viewport dimensions {width, height}
 * @returns Object containing position, velocity, and metadata textures
 */
export function createInitialParticleTextures(
  textureSize: number,
  _count: number,
  viewport: { width: number; height: number } | null,
  leaderCount: number,
  followerCount: number
): {
  positionTexture: THREE.DataTexture;
  velocityTexture: THREE.DataTexture;
  metadataTexture: THREE.DataTexture;
} {
  // Guard against null viewport
  if (!viewport) {
    viewport = { width: 10, height: 10 };
  }

  // Calculate total count
  const totalCount = leaderCount + followerCount;
  // Ensure valid count
  const safeCount = Math.max(1, totalCount);

  // Use safe dimensions
  const width = viewport?.width || 10;
  const height = viewport?.height || 10;

  // Create textures manually with the correct size
  const size = textureSize * textureSize * 4; // RGBA
  const positionData = new Float32Array(size);
  const velocityData = new Float32Array(size);
  const metadataData = new Float32Array(size);

  // Create DataTextures
  const positionTexture = new THREE.DataTexture(positionData, textureSize, textureSize, THREE.RGBAFormat, THREE.FloatType);
  const velocityTexture = new THREE.DataTexture(velocityData, textureSize, textureSize, THREE.RGBAFormat, THREE.FloatType);
  const metadataTexture = new THREE.DataTexture(metadataData, textureSize, textureSize, THREE.RGBAFormat, THREE.FloatType);
  

  // Initialize particles
  for (let i = 0; i < safeCount; i++) {
    const i4 = i * 4; // Each particle uses 4 floats (RGBA)
    const isLeader = i < leaderCount;

    let posX, posY, posZ, baseY;
    const initialLifetime = 8.0 + Math.random() * 4.0; // Match shader lifetime

    if (isLeader) {
      // Leaders - calculate starting position on Bézier curve path
      const leaderIndex = i;
      const t = leaderIndex / leaderCount; // Normalized position on curve [0, 1]
      
      // Calculate viewport dimensions with 6vh inset (matching shader)
      const halfViewport = { x: width * 0.5, y: height * 0.5 };
      const insetPixels = Math.max(height * 0.06, 20); // 6vh with minimum
      const insetHalfViewport = { 
        x: halfViewport.x - insetPixels, 
        y: halfViewport.y - insetPixels 
      };
      
      // Four-segment Bézier curve (matching velocity shader)
      const cornerRadius = insetPixels * 1.5;
      const localT = (t * 4.0) % 1.0; // Progress within current segment
      const segment = Math.floor(t * 4.0);
      
      let p0: { x: number; y: number }, p1: { x: number; y: number }, 
          p2: { x: number; y: number }, p3: { x: number; y: number };
      
      if (segment === 0) {
        // Top edge, moving right
        p0 = { x: -insetHalfViewport.x + cornerRadius, y: insetHalfViewport.y };
        p1 = { x: -insetHalfViewport.x + cornerRadius * 2.5, y: insetHalfViewport.y };
        p2 = { x: insetHalfViewport.x - cornerRadius * 2.5, y: insetHalfViewport.y };
        p3 = { x: insetHalfViewport.x - cornerRadius, y: insetHalfViewport.y };
      } else if (segment === 1) {
        // Right edge, moving down
        p0 = { x: insetHalfViewport.x, y: insetHalfViewport.y - cornerRadius };
        p1 = { x: insetHalfViewport.x, y: insetHalfViewport.y - cornerRadius * 2.5 };
        p2 = { x: insetHalfViewport.x, y: -insetHalfViewport.y + cornerRadius * 2.5 };
        p3 = { x: insetHalfViewport.x, y: -insetHalfViewport.y + cornerRadius };
      } else if (segment === 2) {
        // Bottom edge, moving left
        p0 = { x: insetHalfViewport.x - cornerRadius, y: -insetHalfViewport.y };
        p1 = { x: insetHalfViewport.x - cornerRadius * 2.5, y: -insetHalfViewport.y };
        p2 = { x: -insetHalfViewport.x + cornerRadius * 2.5, y: -insetHalfViewport.y };
        p3 = { x: -insetHalfViewport.x + cornerRadius, y: -insetHalfViewport.y };
      } else {
        // Left edge, moving up
        p0 = { x: -insetHalfViewport.x, y: -insetHalfViewport.y + cornerRadius };
        p1 = { x: -insetHalfViewport.x, y: -insetHalfViewport.y + cornerRadius * 2.5 };
        p2 = { x: -insetHalfViewport.x, y: insetHalfViewport.y - cornerRadius * 2.5 };
        p3 = { x: -insetHalfViewport.x, y: insetHalfViewport.y - cornerRadius };
      }
      
      // Evaluate cubic Bézier curve position
      const t1 = 1.0 - localT;
      posX = p0.x * t1 * t1 * t1 + 
             3.0 * p1.x * t1 * t1 * localT + 
             3.0 * p2.x * t1 * localT * localT + 
             p3.x * localT * localT * localT;
      posY = p0.y * t1 * t1 * t1 + 
             3.0 * p1.y * t1 * t1 * localT + 
             3.0 * p2.y * t1 * localT * localT + 
             p3.y * localT * localT * localT;
      
      posZ = -5; // Keep all particles at same z-depth
      baseY = posY;
    } else {
      // Followers - distribute near edges to match edge attraction (90% from center)
      const angle = Math.random() * Math.PI * 2;
      const radius = (0.8 + Math.random() * 0.15) * Math.min(width, height) * 0.5;
      posX = Math.cos(angle) * radius;
      posY = Math.sin(angle) * radius;
      posZ = -5; // Keep all particles at same z-depth
      baseY = posY;
    }

    // Pack position texture: x, y, z, currentLifetime
    positionData[i4] = posX!;
    positionData[i4 + 1] = posY!;
    positionData[i4 + 2] = posZ!;
    positionData[i4 + 3] = initialLifetime;

    // Pack velocity texture: all zeros initially
    velocityData[i4] = 0.0;
    velocityData[i4 + 1] = 0.0;
    velocityData[i4 + 2] = 0.0;
    velocityData[i4 + 3] = 0.0;

    // Pack metadata texture: animationOffset, randomSeed, baseY, isLeader flag
    metadataData[i4] = Math.random() * 100; // animationOffset
    metadataData[i4 + 1] = Math.random(); // randomSeed
    metadataData[i4 + 2] = baseY!; // baseY
    metadataData[i4 + 3] = isLeader ? 1.0 : 0.0; // isLeader flag
  }

  // Mark textures as needing upload
  positionTexture.needsUpdate = true;
  velocityTexture.needsUpdate = true;
  metadataTexture.needsUpdate = true;

  return {
    positionTexture,
    velocityTexture,
    metadataTexture,
  };
}

export function buildVelocityUniforms({
  textureSize,
  viewport,
  leaderCount,
  weights,
  physics,
  safeZone,
}: {
  textureSize: THREE.Vector2;
  viewport: THREE.Vector2;
  leaderCount: number;
  weights: any;
  physics: any;
  safeZone: { width: number; height: number };
}) {
  return {
    texturePosition: { value: null },
    textureVelocity: { value: null },
    textureAttributes: { value: null },
    resolution: { value: textureSize },
    uTime: { value: 0.0 },
    uDeltaTime: { value: 0.0 },
    uMouse: { value: new THREE.Vector2(0, 0) },
    uScrollVelocity: { value: 0.0 },
    uViewport: { value: viewport },
    uLeaderCount: { value: leaderCount },
    uSeekForceWeight: { value: weights.seek },
    uAlignmentForceWeight: { value: weights.alignment },
    uSeparationForceWeight: { value: weights.separation },
    uEdgeAttractionWeight: { value: weights.edgeAttraction },
    uCenterRepulsionWeight: { value: weights.centerRepulsion },
    uMaxSpeed: { value: physics.maxSpeed },
    uDragCoefficient: { value: physics.dragCoefficient },
    uSeekMaxForce: { value: physics.seekMaxForce },
    uSeparationRadius: { value: physics.separationRadius },
    uSeparationForce: { value: physics.separationForce },
    uPatrolSpeed: { value: physics.patrolSpeed },
    uScrollImpulseStrength: { value: physics.scrollImpulseStrength },
    uSafeZone: { value: new THREE.Vector2(safeZone.width, safeZone.height) },
    uNoiseScale: { value: 0.002 },
    uNoiseStrength: { value: 5.0 },
  };
}