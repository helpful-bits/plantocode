export interface ParticleState {
  count: number;
  positions: Float32Array;
  velocities: Float32Array;
  roles: Float32Array;
  sizes: Float32Array;
  energies: Float32Array;
  baseZ: Float32Array;
  baseY: Float32Array; // Store initial Y positions for scroll offset
  // For GPU attributes
  nearestAngles: Float32Array;
  nearestDistances: Float32Array;
  hasTargets: Float32Array;
}

export function initialiseParticleState(count: number, viewport: { width: number; height: number } | null, screenWidth: number): ParticleState {
  // Guard against null viewport
  if (!viewport) {
    viewport = { width: 10, height: 10 };
  }
  // Ensure valid count
  const safeCount = Math.max(1, count);
  
  // Create typed arrays for all particle data
  const positions = new Float32Array(safeCount * 3);
  const velocities = new Float32Array(safeCount * 3);
  const roles = new Float32Array(safeCount);
  const sizes = new Float32Array(safeCount);
  const energies = new Float32Array(safeCount);
  const baseZ = new Float32Array(safeCount);
  const baseY = new Float32Array(safeCount);
  const nearestAngles = new Float32Array(safeCount);
  const nearestDistances = new Float32Array(safeCount);
  const hasTargets = new Float32Array(safeCount);
  
  // Use safe dimensions
  const width = viewport?.width || 10;
  const height = viewport?.height || 10;
  
  for (let i = 0; i < safeCount; i++) {
    const i3 = i * 3;
    // Screen-aware edge distribution
    const isWideScreen = screenWidth > (viewport?.width || 10) * 1.2;
    let edgeChoice;
    if (isWideScreen) {
      // On wide screens, 80% chance for left/right edges, 20% for top/bottom
      edgeChoice = Math.random() < 0.8 ? (Math.random() < 0.5 ? 1 : 3) : (Math.random() < 0.5 ? 0 : 2);
    } else {
      // On narrower screens, equal chance for all edges
      edgeChoice = Math.floor(Math.random() * 4);
    }
    const progress = Math.random();
    
    // Assign game behaviors - particles have roles in the catching game
    const roleChance = Math.random();
    let gameRole: number;
    if (roleChance < 0.3) {
      gameRole = 0; // 30% chasers
    } else if (roleChance < 0.8) {
      gameRole = 1; // 50% runners
    } else {
      gameRole = 2; // 20% neutral
    }
    const particleSize = 0.45 + Math.random() * 0.15; // More consistent starting size
    const huntingEnergy = Math.random(); // Energy for chasing/running
    
    roles[i] = gameRole;
    sizes[i] = particleSize;
    energies[i] = huntingEnergy;
    
    // Initialize tracking arrays
    nearestAngles[i] = 0; // angle
    nearestDistances[i] = 10; // distance (far)
    hasTargets[i] = 0; // target exists
    
    // Initialize velocities to zero
    velocities[i3] = 0;
    velocities[i3 + 1] = 0;
    velocities[i3 + 2] = 0;
    
    // Keep particles strictly at edges
    const edgeOffset = Math.random() * 1.5; // Random offset from edge
    
    const initialZ = (Math.random() - 0.5) * 2;
    let initialY;
    
    if (edgeChoice === 0) { // Top edge
      positions[i3] = (progress - 0.5) * width * 0.9; // Use 90% of width
      initialY = height * 0.5 - edgeOffset;
      positions[i3 + 1] = initialY;
      positions[i3 + 2] = initialZ;
    } else if (edgeChoice === 1) { // Right edge
      positions[i3] = width * 0.5 - edgeOffset;
      initialY = (progress - 0.5) * height * 0.95; // Use 95% of height for better coverage
      positions[i3 + 1] = initialY;
      positions[i3 + 2] = initialZ;
    } else if (edgeChoice === 2) { // Bottom edge
      positions[i3] = (progress - 0.5) * width * 0.9; // Use 90% of width
      initialY = -height * 0.5 + edgeOffset;
      positions[i3 + 1] = initialY;
      positions[i3 + 2] = initialZ;
    } else { // Left edge
      positions[i3] = -width * 0.5 + edgeOffset;
      initialY = (progress - 0.5) * height * 0.95; // Use 95% of height for better coverage
      positions[i3 + 1] = initialY;
      positions[i3 + 2] = initialZ;
    }
    
    baseZ[i] = initialZ;
    baseY[i] = initialY;
  }

  return {
    count: safeCount,
    positions,
    velocities,
    roles,
    sizes,
    energies,
    baseZ,
    baseY,
    nearestAngles,
    nearestDistances,
    hasTargets
  };
}

class SpatialHash {
  private cellSize: number;
  private grid: Map<string, number[]>;
  
  constructor(cellSize: number = 1.0) {
    this.cellSize = cellSize;
    this.grid = new Map();
  }
  
  clear() {
    this.grid.clear();
  }
  
  insert(index: number, x: number, y: number) {
    const cellX = Math.floor(x / this.cellSize);
    const cellY = Math.floor(y / this.cellSize);
    const key = `${cellX},${cellY}`;
    
    if (!this.grid.has(key)) {
      this.grid.set(key, []);
    }
    this.grid.get(key)!.push(index);
  }
  
  queryNeighbors(x: number, y: number): number[] {
    const cellX = Math.floor(x / this.cellSize);
    const cellY = Math.floor(y / this.cellSize);
    const neighbors: number[] = [];
    
    // Check 3x3 grid around the point
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = `${cellX + dx},${cellY + dy}`;
        const cell = this.grid.get(key);
        if (cell) {
          neighbors.push(...cell);
        }
      }
    }
    
    return neighbors;
  }
}

export { SpatialHash };

export function handleViewportResize(
  state: ParticleState,
  oldViewport: { width: number; height: number },
  newViewport: { width: number; height: number }
) {
  if (state.count === 0) return;
  
  const widthRatio = newViewport.width / oldViewport.width;
  const heightRatio = newViewport.height / oldViewport.height;
  
  // Reposition particles to maintain relative positions
  for (let i = 0; i < state.count; i++) {
    const i3 = i * 3;
    
    // Scale positions
    state.positions[i3] *= widthRatio;
    state.positions[i3 + 1] *= heightRatio;
    
    // Scale base Y positions
    state.baseY[i] *= heightRatio;
    
    // Add burst of energy on resize for visual feedback
    const burstStrength = 0.1;
    state.velocities[i3] += (Math.random() - 0.5) * burstStrength * Math.abs(widthRatio - 1);
    state.velocities[i3 + 1] += (Math.random() - 0.5) * burstStrength * Math.abs(heightRatio - 1);
    
    // If viewport got smaller, ensure particles aren't stuck in the middle
    const centerZoneX = newViewport.width * 0.3;
    const centerZoneY = newViewport.height * 0.25;
    
    if (Math.abs(state.positions[i3]) < centerZoneX && 
        Math.abs(state.positions[i3 + 1]) < centerZoneY) {
      // Push particles out of center if they ended up there after resize
      const angle = Math.atan2(state.positions[i3 + 1], state.positions[i3]);
      state.positions[i3] = Math.cos(angle) * centerZoneX * 1.1;
      state.positions[i3 + 1] = Math.sin(angle) * centerZoneY * 1.1;
      
      // Give them velocity away from center
      state.velocities[i3] = Math.cos(angle) * 0.05;
      state.velocities[i3 + 1] = Math.sin(angle) * 0.05;
    }
  }
}

// Create a single, shared SpatialHash instance for performance
const globalSpatialHash = new SpatialHash(2.0);

function respawnParticle(index: number, state: ParticleState, viewport: { width: number; height: number }, screenWidth: number) {
  const i3 = index * 3;
  const edgeChoice = Math.floor(Math.random() * 4);
  const progress = Math.random();
  
  const width = viewport.width || 10;
  const height = viewport.height || 10;
  
  // Reset size and velocity
  state.sizes[index] = 0.4 + Math.random() * 0.15; // Start with more consistent size
  state.velocities[i3] = 0;
  state.velocities[i3 + 1] = 0;
  state.velocities[i3 + 2] = 0;
  
  // Get current scroll offset - STRONGER
  const scrollOffsetY = (typeof window !== 'undefined') ? 
    (window.pageYOffset || document.documentElement.scrollTop || 0) / window.innerHeight * viewport.height * 6 : 0;
  
  let maxOffset = 1.0; // Tight for large screens
  if (screenWidth < 768) {
    maxOffset = 2.0; // More room on small screens
  } else if (screenWidth < 1024) {
    maxOffset = 1.5; // Medium screens
  }
  const edgeOffset = Math.random() * maxOffset; // Random offset from edge
  
  let newY;
  if (edgeChoice === 0) { // Top edge
    state.positions[i3] = (progress - 0.5) * width * 0.9;
    newY = height * 0.5 - edgeOffset;
    state.positions[i3 + 1] = newY + scrollOffsetY; // Apply scroll offset
    state.positions[i3 + 2] = (Math.random() - 0.5) * 2;
  } else if (edgeChoice === 1) { // Right edge
    state.positions[i3] = width * 0.5 - edgeOffset;
    newY = (progress - 0.5) * height * 0.95;
    state.positions[i3 + 1] = newY + scrollOffsetY; // Apply scroll offset
    state.positions[i3 + 2] = (Math.random() - 0.5) * 2;
  } else if (edgeChoice === 2) { // Bottom edge
    state.positions[i3] = (progress - 0.5) * width * 0.9;
    newY = -height * 0.5 + edgeOffset;
    state.positions[i3 + 1] = newY + scrollOffsetY; // Apply scroll offset
    state.positions[i3 + 2] = (Math.random() - 0.5) * 2;
  } else { // Left edge
    state.positions[i3] = -width * 0.5 + edgeOffset;
    newY = (progress - 0.5) * height * 0.95;
    state.positions[i3 + 1] = newY + scrollOffsetY; // Apply scroll offset
    state.positions[i3 + 2] = (Math.random() - 0.5) * 2;
  }
  
  // Store the base Y position (without scroll offset)
  state.baseY[index] = newY;
}

export function stepParticleState(
  state: ParticleState,
  delta: number,
  viewport: { width: number; height: number },
  mouse: { x: number; y: number },
  scroll: { y: number; velocity: number },
  isReducedMotion?: boolean,
  elapsedTime: number = 0
) {
  const spatialHash = globalSpatialHash;
  
  // Clear the spatial hash for the new frame
  spatialHash.clear();
  
  // Calculate parallax offset based on scroll position - MAXIMUM DEPTH
  const parallaxZ = scroll.y * 50; // Maximum Z-axis parallax for depth
  
  // Add scroll-based size modulation for depth perception
  const scrollDepthEffect = 1.0 + scroll.y * 0.3; // Particles appear to get smaller as you scroll
  
  // Get screen width once for edge calculations
  const screenWidth = (typeof window !== 'undefined') ? window.innerWidth : 1920;
  
  
  // Calculate scroll offset for Y position - EXTREME PARALLAX
  const scrollOffsetY = scroll.y * viewport.height * 10; // Even more dramatic vertical movement
  
  // Populate spatial hash with scroll-adjusted positions
  for (let i = 0; i < state.count; i++) {
    const i3 = i * 3;
    const posX = state.positions[i3] ?? 0;
    const posY = (state.baseY[i] ?? 0) + scrollOffsetY;
    spatialHash.insert(i, posX, posY);
  }
  
  // Process each particle
  for (let i = 0; i < state.count; i++) {
    const i3 = i * 3;
    const myRole = state.roles[i] ?? 0;
    const mySize = state.sizes[i] ?? 0.5;
    const myX = state.positions[i3] ?? 0;
    const myY = (state.baseY[i] ?? 0) + scrollOffsetY; // Use scroll-adjusted Y
    
    // Find nearest valid target using spatial hash
    const candidates = spatialHash.queryNeighbors(myX, myY);
    let nearestDistance = Infinity;
    let nearestAngle = 0;
    let foundTarget = false;
    let nearestTargetIndex = -1;
    
    for (const j of candidates) {
      if (i === j) continue;
      
      const otherRole = state.roles[j] ?? 0;
      const otherSize = state.sizes[j] ?? 0.5;
      const otherX = state.positions[j * 3] ?? 0;
      const otherY = state.positions[j * 3 + 1] ?? 0;
      
      const dx = otherX - myX;
      const dy = otherY - myY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      let isValidTarget = false;
      
      if (myRole < 1.0) {
        // Chasers look for smaller prey
        isValidTarget = otherSize < mySize * 0.9 && distance < 4.0;
      } else {
        // Runners and neutrals look for nearby chasers to avoid
        isValidTarget = otherRole < 1.0 && distance < 3.5;
      }
      
      if (isValidTarget && distance < nearestDistance) {
        nearestDistance = distance;
        nearestAngle = Math.atan2(dy, dx);
        foundTarget = true;
        nearestTargetIndex = j;
      }
    }
    
    // Store nearest target info
    state.nearestAngles[i] = nearestAngle;
    state.nearestDistances[i] = Math.min(nearestDistance, 10.0);
    state.hasTargets[i] = foundTarget ? 1.0 : 0.0;
    
    // Calculate acceleration based on role and target
    let accelX = 0;
    let accelY = 0;
    
    const huntingIntensity = state.energies[i] * (1.0 + Math.sin(elapsedTime * 0.8 + i) * 0.3);
    
    if (myRole < 1.0) {
      // CHASERS - pursuit behavior
      const baseChaseSpeed = (0.02 + mySize * 0.01) * huntingIntensity;
      
      if (foundTarget) {
        const pursuitDirectionX = Math.cos(nearestAngle);
        const pursuitDirectionY = Math.sin(nearestAngle);
        const pursuitIntensity = Math.max(0, (4.0 - nearestDistance) / 4.0);
        
        accelX = pursuitDirectionX * baseChaseSpeed * (1.0 + pursuitIntensity * 0.2);
        accelY = pursuitDirectionY * baseChaseSpeed * (1.0 + pursuitIntensity * 0.2);
        
        // Final sprint when very close
        if (nearestDistance < 1.2) {
          const sprintBoost = (1.2 - nearestDistance) / 1.2 * 0.04;
          accelX += pursuitDirectionX * sprintBoost;
          accelY += pursuitDirectionY * sprintBoost;
        }
      } else {
        // Search pattern
        const searchAngle = elapsedTime * 0.2 + i;
        accelX = Math.cos(searchAngle) * 0.01;
        accelY = Math.sin(searchAngle) * 0.01;
      }
      
    } else if (myRole < 2.0) {
      // RUNNERS - escape behavior
      const baseEscapeSpeed = 0.015 + (1.0 - mySize) * 0.01;
      
      if (foundTarget) {
        const escapeDirectionX = -Math.cos(nearestAngle);
        const escapeDirectionY = -Math.sin(nearestAngle);
        const panicLevel = Math.max(0, (3.5 - nearestDistance) / 3.5);
        
        accelX = escapeDirectionX * baseEscapeSpeed * (1.0 + panicLevel * 0.2);
        accelY = escapeDirectionY * baseEscapeSpeed * (1.0 + panicLevel * 0.2);
        
        // Emergency escape when very close
        if (nearestDistance < 1.0) {
          const emergencyEscape = (1.0 - nearestDistance) * 0.03;
          accelX += escapeDirectionX * emergencyEscape;
          accelY += escapeDirectionY * emergencyEscape;
        }
      } else {
        // Casual movement
        accelX = Math.cos(elapsedTime * 0.15 + i) * 0.008;
        accelY = Math.sin(elapsedTime * 0.1 + i) * 0.008;
      }
      
    } else {
      // NEUTRAL - mild avoidance
      const neutralSpeed = 0.01;
      
      if (foundTarget) {
        const avoidanceDirectionX = -Math.cos(nearestAngle);
        const avoidanceDirectionY = -Math.sin(nearestAngle);
        const cautionLevel = Math.max(0, (4.0 - nearestDistance) / 4.0);
        
        accelX = avoidanceDirectionX * neutralSpeed * cautionLevel * 0.5;
        accelY = avoidanceDirectionY * neutralSpeed * cautionLevel * 0.5;
        
        const wanderIntensity = 1.0 - cautionLevel * 0.7;
        accelX += Math.cos(elapsedTime * 0.1 + i) * 0.008 * wanderIntensity;
        accelY += Math.sin(elapsedTime * 0.08 + i) * 0.008 * wanderIntensity;
      } else {
        // Pure peaceful wandering
        accelX = Math.cos(elapsedTime * 0.1 + i) * 0.008;
        accelY = Math.sin(elapsedTime * 0.08 + i) * 0.008;
      }
    }
    
    // Apply external forces (mouse)
    const mouseDistance = Math.sqrt((myX - mouse.x * 2.5) ** 2 + (myY - mouse.y * 2.5) ** 2);
    if (mouseDistance < 1.5) {
      const influenceStrength = (1.5 - mouseDistance) / 1.5;
      const gentleForceX = (myX - mouse.x * 2.5) / mouseDistance;
      const gentleForceY = (myY - mouse.y * 2.5) / mouseDistance;
      accelX += gentleForceX * influenceStrength * 0.01;
      accelY += gentleForceY * influenceStrength * 0.01;
    }
    
    // POWERFUL SCROLL FORCES with natural physics
    const scrollInfluence = Math.min(scroll.y / 0.05, 1.0); // Very fast ramp-up
    const scrollVel = scroll.velocity; // Use actual scroll velocity for momentum
    const viewportWidth = viewport.width / 2;
    const viewportHeight = viewport.height / 2;

    // 1. Direct scroll momentum transfer - particles inherit scroll motion
    accelY -= scrollVel * 5.0; // Strong upward push when scrolling down
    
    // 2. Vortex effect - particles spiral outward on scroll
    const distFromCenter = Math.sqrt(myX * myX + myY * myY);
    const vortexStrength = scrollInfluence * 0.5 * (1.0 - distFromCenter / (viewportWidth * 1.5));
    if (vortexStrength > 0) {
        // Tangential force for spiral
        const angle = Math.atan2(myY, myX);
        accelX += Math.cos(angle + Math.PI/2) * vortexStrength + Math.cos(angle) * vortexStrength * 0.5;
        accelY += Math.sin(angle + Math.PI/2) * vortexStrength + Math.sin(angle) * vortexStrength * 0.5;
    }
    
    // 3. Wave propagation - ripple effect from scroll
    const wavePhase = elapsedTime * 2.0 + distFromCenter * 0.1;
    const waveAmplitude = scrollInfluence * 0.2;
    accelX += Math.cos(wavePhase) * waveAmplitude * Math.sign(myX || 1);
    accelY += Math.sin(wavePhase) * waveAmplitude * 0.5;
    
    // 4. Turbulence increases with scroll
    const turbulence = scrollInfluence * 0.3 + scrollVel * 0.1;
    accelX += (Math.random() - 0.5) * turbulence;
    accelY += (Math.random() - 0.5) * turbulence;

    // 2. Boundary repulsion force (soft walls)
    const boundaryPadding = 1.0;
    const repulsionStrength = 0.02;

    if (myX > viewportWidth - boundaryPadding) accelX -= (repulsionStrength / (viewportWidth - myX));
    if (myX < -viewportWidth + boundaryPadding) accelX += (repulsionStrength / (myX + viewportWidth));
    if (myY > viewportHeight - boundaryPadding) accelY -= (repulsionStrength / (viewportHeight - myY));
    if (myY < -viewportHeight + boundaryPadding) accelY += (repulsionStrength / (myY + viewportHeight));
    
    // 3. INVISIBLE WALL - Keep particles away from center
    const centerExclusionZoneX = viewportWidth * 0.6; // 60% of half-width = 30% total width
    const centerExclusionZoneY = viewportHeight * 0.5; // 50% of half-height = 25% total height
    const centerRepulsion = 0.1;
    
    // If particle is within the center exclusion zone, push it out
    if (Math.abs(myX) < centerExclusionZoneX && Math.abs(myY) < centerExclusionZoneY) {
      // Calculate distance from center
      const distFromCenterX = Math.abs(myX);
      const distFromCenterY = Math.abs(myY);
      
      // Determine which edge is closer and push towards it
      if (distFromCenterX / centerExclusionZoneX < distFromCenterY / centerExclusionZoneY) {
        // Closer to left/right edge of exclusion zone
        const pushForce = centerRepulsion * (1.0 - distFromCenterX / centerExclusionZoneX);
        accelX += Math.sign(myX || 1) * pushForce;
      } else {
        // Closer to top/bottom edge of exclusion zone
        const pushForce = centerRepulsion * (1.0 - distFromCenterY / centerExclusionZoneY);
        accelY += Math.sign(myY || 1) * pushForce;
      }
    }
    
    // Apply reduced motion damping if needed - less damping during scroll
    const scrollDamping = 1.0 - Math.min(Math.abs(scroll.velocity) * 0.5, 0.3);
    const dampingFactor = isReducedMotion ? 0.9 : 0.98 * scrollDamping;
    
    // Clamp delta to prevent large jumps and slow down overall simulation
    const clampedDelta = Math.min(delta * 60, 1.0) * 0.2; // Further reduced speed multiplier
    
    // Update velocity
    const velX = (state.velocities[i3] ?? 0) + accelX * clampedDelta;
    const velY = (state.velocities[i3 + 1] ?? 0) + accelY * clampedDelta;
    state.velocities[i3] = velX * dampingFactor;
    state.velocities[i3 + 1] = velY * dampingFactor;
    
    // Update position
    let posX = (state.positions[i3] ?? 0) + (state.velocities[i3] ?? 0) * clampedDelta;
    let posY = (state.positions[i3 + 1] ?? 0) + (state.velocities[i3 + 1] ?? 0) * clampedDelta;
    const posZ = state.positions[i3 + 2] ?? 0;
    
    // HARD BOUNDARY for center exclusion - never allow particles in the middle
    const centerZoneX = viewport.width * 0.3; // 30% of half-width
    const centerZoneY = viewport.height * 0.25; // 25% of half-height
    
    // Check if particle is entering or inside the forbidden zone
    const prevX = state.positions[i3] ?? 0;
    const prevY = state.positions[i3 + 1] ?? 0;
    const wasOutside = Math.abs(prevX) >= centerZoneX || Math.abs(prevY) >= centerZoneY;
    const isInside = Math.abs(posX) < centerZoneX && Math.abs(posY) < centerZoneY;
    
    if (isInside) {
      if (wasOutside) {
        // Particle just hit the boundary - calculate proper reflection
        
        // Find intersection point with the boundary
        const t = Math.max(
          Math.abs(prevX) >= centerZoneX ? (Math.sign(prevX) * centerZoneX - prevX) / (posX - prevX) : 0,
          Math.abs(prevY) >= centerZoneY ? (Math.sign(prevY) * centerZoneY - prevY) / (posY - prevY) : 0
        );
        
        // Determine which boundary was hit
        const hitX = Math.abs(prevX + t * (posX - prevX)) >= centerZoneX * 0.99;
        const hitY = Math.abs(prevY + t * (posY - prevY)) >= centerZoneY * 0.99;
        
        if (hitX && !hitY) {
          // Hit vertical boundary - reflect X velocity
          state.velocities[i3] = -(state.velocities[i3] ?? 0) * 0.7; // 0.7 = damping factor
          posX = prevX + (state.velocities[i3] ?? 0) * clampedDelta;
        } else if (hitY && !hitX) {
          // Hit horizontal boundary - reflect Y velocity
          state.velocities[i3 + 1] = -(state.velocities[i3 + 1] ?? 0) * 0.7;
          posY = prevY + (state.velocities[i3 + 1] ?? 0) * clampedDelta;
        } else {
          // Hit corner - reflect both
          state.velocities[i3] = -(state.velocities[i3] ?? 0) * 0.7;
          state.velocities[i3 + 1] = -(state.velocities[i3 + 1] ?? 0) * 0.7;
          posX = prevX + (state.velocities[i3] ?? 0) * clampedDelta;
          posY = prevY + (state.velocities[i3 + 1] ?? 0) * clampedDelta;
        }
      } else {
        // Particle was already inside (shouldn't happen but just in case)
        // Push it to the nearest boundary
        if (Math.abs(posX) / centerZoneX < Math.abs(posY) / centerZoneY) {
          posX = Math.sign(posX || 1) * centerZoneX;
        } else {
          posY = Math.sign(posY || 1) * centerZoneY;
        }
      }
    }
    
    state.positions[i3] = posX;
    state.positions[i3 + 1] = posY;
    
    // Apply parallax offset for visual effect - fix accumulation bug
    state.positions[i3 + 2] = state.baseZ[i] + parallaxZ;
    
    // Update baseY to track the particle's new relative position
    state.baseY[i] = posY - scrollOffsetY;
    
    // Handle eating (only for chasers) - made harder to catch
    if (myRole < 1.0 && foundTarget && nearestTargetIndex >= 0 && nearestDistance < 0.2) {
      const preySize = state.sizes[nearestTargetIndex] ?? 0.5;
      if (preySize < mySize * 0.7) { // Prey must be significantly smaller
        // Eating event!
        state.sizes[i] = Math.min(mySize + 0.05, 1.5); // Grow slower
        respawnParticle(nearestTargetIndex, state, viewport, screenWidth);
      }
    }
    
    // Auto-burst when too big - increased threshold
    const currentSize = state.sizes[i] ?? 0.5;
    if (currentSize > 1.3) {
      respawnParticle(i, state, viewport, screenWidth);
    }
  }
}