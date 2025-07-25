import {
  NORMAL_SIZE, RUNNER_SIZE, MIN_PARTICLE_SIZE, MAX_PARTICLE_SIZE,
  SIZE_BURST_THRESHOLD, SIZE_GROWTH_AMOUNT, PREY_SIZE_RATIO, CATCH_SIZE_RATIO,
  CHASE_STRENGTH, ESCAPE_STRENGTH, NEUTRAL_SPEED, SEARCH_PATTERN_SPEED,
  CASUAL_MOVEMENT_SPEED, SPRINT_BOOST_THRESHOLD, SPRINT_BOOST_STRENGTH,
  EMERGENCY_ESCAPE_THRESHOLD, EMERGENCY_ESCAPE_STRENGTH, MOUSE_INFLUENCE_RADIUS,
  MOUSE_INFLUENCE_STRENGTH, CENTER_EXCLUSION_X, CENTER_EXCLUSION_Y,
  MOBILE_EDGE_ATTRACTION, MOBILE_CORNER_PREFERENCE, MOBILE_CENTER_REPULSION,
  DESKTOP_EDGE_ATTRACTION,
  CENTER_REPULSION, VELOCITY_DAMPING,
  REDUCED_MOTION_DAMPING,
  RESIZE_VELOCITY_SCALE, CELL_SIZE,
  SCROLL_Y_MULTIPLIER, SCROLL_INFLUENCE_DIVISOR, SCROLL_MOMENTUM_MULTIPLIER,
  VORTEX_STRENGTH_MULTIPLIER, VORTEX_RADIUS_MULTIPLIER, WAVE_SPEED_MULTIPLIER,
  WAVE_AMPLITUDE_MULTIPLIER, WAVE_DISTANCE_SCALE, TURBULENCE_BASE,
  TURBULENCE_VELOCITY_SCALE, SCROLL_VELOCITY_DAMPING, SEPARATION_DISTANCE,
  SEPARATION_STRENGTH, CHASER_DETECTION_RANGE,
  RUNNER_DETECTION_RANGE, NEUTRAL_AVOIDANCE_RANGE, CATCH_DISTANCE,
  CHASER_RATIO, RUNNER_RATIO, EDGE_OFFSET_MAX, EDGE_OFFSET_SMALL_SCREEN,
  EDGE_OFFSET_MEDIUM_SCREEN, SMALL_SCREEN_WIDTH, MEDIUM_SCREEN_WIDTH,
  WIDTH_USAGE_RATIO, HEIGHT_USAGE_RATIO, WIDE_SCREEN_RATIO, WIDE_SCREEN_EDGE_CHANCE,
  BOUNDARY_PADDING,
  BOUNDARY_REPULSION_STRENGTH, DELTA_CLAMP, SIMULATION_SPEED, PURSUIT_INTENSITY_RANGE,
  PURSUIT_INTENSITY_BOOST, PANIC_LEVEL_RANGE, PANIC_LEVEL_BOOST,
  CAUTION_LEVEL_MULTIPLIER, WANDER_INTENSITY_REDUCTION, HUNTING_INTENSITY_VARIATION,
  HUNTING_INTENSITY_FREQUENCY, SEARCH_ANGLE_SPEED, CASUAL_MOVEMENT_X_SPEED,
  CASUAL_MOVEMENT_Y_SPEED, NEUTRAL_WANDER_X_SPEED, NEUTRAL_WANDER_Y_SPEED,
} from './particleConstants';

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
  randomSeeds: Float32Array;
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
  const randomSeeds = new Float32Array(safeCount);

  // Use safe dimensions
  const width = viewport?.width || 10;
  const height = viewport?.height || 10;

  for (let i = 0; i < safeCount; i++) {
    const i3 = i * 3;
    // Screen-aware edge distribution
    const isWideScreen = screenWidth > (viewport?.width || 10) * WIDE_SCREEN_RATIO;
    let edgeChoice;
    if (isWideScreen) {
      // On wide screens, 80% chance for left/right edges, 20% for top/bottom
      edgeChoice = Math.random() < WIDE_SCREEN_EDGE_CHANCE ? (Math.random() < 0.5 ? 1 : 3) : (Math.random() < 0.5 ? 0 : 2);
    } else {
      // On narrower screens, equal chance for all edges
      edgeChoice = Math.floor(Math.random() * 4);
      // On mobile, particles MUST spawn at extreme edges only
      if (screenWidth < 768) {
        // 90% chance for corners, 10% for edge centers
        if (Math.random() < 0.9) {
          // Spawn in corners
          const corner = Math.floor(Math.random() * 4);
          edgeChoice = corner;
        } else {
          edgeChoice = Math.floor(Math.random() * 4);
        }
      }
    }
    // On mobile, distribute particles evenly along edges, not just corners
    const progress = Math.random(); // Always random distribution

    // Assign game behaviors - particles have roles in the catching game
    const roleChance = Math.random();
    let gameRole: number;
    if (roleChance < CHASER_RATIO) {
      gameRole = 0; // 15% chasers
    } else if (roleChance < CHASER_RATIO + RUNNER_RATIO) {
      gameRole = 1; // 35% runners
    } else {
      gameRole = 2; // 50% neutral
    }
    const particleSize = NORMAL_SIZE + Math.random() * RUNNER_SIZE; // More consistent starting size
    const huntingEnergy = Math.random(); // Energy for chasing/running

    roles[i] = gameRole;
    sizes[i] = particleSize;
    energies[i] = huntingEnergy;

    // Initialize tracking arrays
    nearestAngles[i] = 0; // angle
    nearestDistances[i] = 10; // distance (far)
    hasTargets[i] = 0; // target exists
    randomSeeds[i] = Math.random() * 1000 + i * 0.1; // Unique seed per particle

    // Initialize velocities to zero
    velocities[i3] = 0;
    velocities[i3 + 1] = 0;
    velocities[i3 + 2] = 0;

    // Keep particles strictly at edges
    const edgeOffset = Math.random() * EDGE_OFFSET_MAX; // Random offset from edge

    const initialZ = (Math.random() - 0.5) * 2;
    let initialY;

    if (edgeChoice === 0) { // Top edge
      positions[i3] = (progress - 0.5) * width * WIDTH_USAGE_RATIO; // Use 90% of width
      initialY = height * 0.5 - edgeOffset;
      positions[i3 + 1] = initialY;
      positions[i3 + 2] = initialZ;
    } else if (edgeChoice === 1) { // Right edge
      positions[i3] = width * 0.5 - edgeOffset;
      initialY = (progress - 0.5) * height * HEIGHT_USAGE_RATIO; // Use 95% of height for better coverage
      positions[i3 + 1] = initialY;
      positions[i3 + 2] = initialZ;
    } else if (edgeChoice === 2) { // Bottom edge
      positions[i3] = (progress - 0.5) * width * WIDTH_USAGE_RATIO; // Use 90% of width
      initialY = -height * 0.5 + edgeOffset;
      positions[i3 + 1] = initialY;
      positions[i3 + 2] = initialZ;
    } else { // Left edge
      positions[i3] = -width * 0.5 + edgeOffset;
      initialY = (progress - 0.5) * height * HEIGHT_USAGE_RATIO; // Use 95% of height for better coverage
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
    hasTargets,
    randomSeeds,
  };
}

class SpatialHash {
  private cellSize: number;
  private grid: Map<number, number[]>;
  private arrayPool: number[][];

  constructor(cellSize: number = CELL_SIZE) {
    this.cellSize = cellSize;
    this.grid = new Map();
    this.arrayPool = [];
  }

  private hashKey(cellX: number, cellY: number): number {
    // Use prime numbers for better distribution
    return (cellX * 73856093) ^ (cellY * 19349663);
  }

  clear() {
    // Return arrays to pool instead of creating new ones
    for (const arr of this.grid.values()) {
      arr.length = 0;
      this.arrayPool.push(arr);
    }
    this.grid.clear();
  }

  insert(index: number, x: number, y: number) {
    const cellX = Math.floor(x / this.cellSize);
    const cellY = Math.floor(y / this.cellSize);
    const key = this.hashKey(cellX, cellY);

    let bucket = this.grid.get(key);
    if (!bucket) {
      // Reuse array from pool if available
      bucket = this.arrayPool.pop() || [];
      this.grid.set(key, bucket);
    }
    bucket.push(index);
  }

  queryNeighbors(x: number, y: number): number[] {
    const cellX = Math.floor(x / this.cellSize);
    const cellY = Math.floor(y / this.cellSize);
    const neighbors: number[] = [];

    // Check 3x3 grid around the point
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = this.hashKey(cellX + dx, cellY + dy);
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
  newViewport: { width: number; height: number },
) {
  if (state.count === 0) return;

  const widthRatio = newViewport.width / oldViewport.width;
  const heightRatio = newViewport.height / oldViewport.height;

  // Reposition particles to maintain relative positions
  for (let i = 0; i < state.count; i++) {
    const i3 = i * 3;

    // Scale positions
    if (state.positions) {
      const posX = state.positions[i3];
      const posY = state.positions[i3 + 1];
      if (posX !== undefined) {
        state.positions[i3] = posX * widthRatio;
      }
      if (posY !== undefined) {
        state.positions[i3 + 1] = posY * heightRatio;
      }
    }

    // Scale base Y positions
    if (state.baseY) {
      const baseY = state.baseY[i];
      if (baseY !== undefined) {
        state.baseY[i] = baseY * heightRatio;
      }
    }

    // Responsive exclusion zone for resize handling
    const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const isMobile = screenWidth < 768;
    const isTablet = screenWidth < 1024;
    
    let exclusionMultiplierX, exclusionMultiplierY;
    if (isMobile) {
      exclusionMultiplierX = 1.2; // 60% on mobile - same as simulation
      exclusionMultiplierY = 1.2; // 60% on mobile
    } else if (isTablet) {
      exclusionMultiplierX = 1.7; // 85% on tablet
      exclusionMultiplierY = 1.7; // 85% on tablet
    } else {
      exclusionMultiplierX = CENTER_EXCLUSION_X; // 80% on desktop
      exclusionMultiplierY = CENTER_EXCLUSION_Y; // 70% on desktop
    }
    
    const centerExclusionX = newViewport.width / 2 * exclusionMultiplierX;
    const centerExclusionY = newViewport.height / 2 * exclusionMultiplierY;

    if (state.positions) {
      const posX = state.positions[i3] ?? 0;
      const baseY = state.baseY[i] ?? 0;
      
      // Check if particle is within the exclusion zone
      const centerDistX = Math.abs(posX) / centerExclusionX;
      const centerDistY = Math.abs(baseY) / centerExclusionY;
      
      if (centerDistX < 1.0 && centerDistY < 1.0) {
        // Push particles to edge of exclusion zone
        const angle = Math.atan2(baseY || 1, posX || 1);
        const targetX = Math.cos(angle) * centerExclusionX * 1.1;
        const targetY = Math.sin(angle) * centerExclusionY * 1.1;
        
        // Smooth transition instead of immediate teleport
        const moveSpeed = 0.1; // 10% per frame
        state.positions[i3] = posX + (targetX - posX) * moveSpeed;
        state.baseY[i] = baseY + (targetY - baseY) * moveSpeed;
        state.positions[i3 + 1] = state.baseY[i] ?? 0; // Update render Y too

        // Give them velocity away from center
        state.velocities[i3] = Math.cos(angle) * RESIZE_VELOCITY_SCALE * 2;
        state.velocities[i3 + 1] = Math.sin(angle) * RESIZE_VELOCITY_SCALE * 2;
      }
    }

    // Ensure particles are within viewport bounds after resize
    const maxX = newViewport.width - 0.5;
    const maxY = newViewport.height - 0.5;

    if (state.positions) {
      if (state.positions[i3] !== undefined) {
        state.positions[i3] = Math.max(-maxX, Math.min(maxX, state.positions[i3] ?? 0));
      }
      if (state.positions[i3 + 1] !== undefined) {
        state.positions[i3 + 1] = Math.max(-maxY, Math.min(maxY, state.positions[i3 + 1] ?? 0));
      }
    }
    if (state.baseY && state.baseY[i] !== undefined) {
      state.baseY[i] = Math.max(-maxY, Math.min(maxY, state.baseY[i] ?? 0));
    }
  }
}

// Create a single, shared SpatialHash instance for performance
const globalSpatialHash = new SpatialHash(CELL_SIZE);

// Respawn particle at a specific edge (0=top, 1=right, 2=bottom, 3=left)
function respawnParticleAtEdge(index: number, state: ParticleState, viewport: { width: number; height: number }, _screenWidth: number, edge: number) {
  const i3 = index * 3;
  const width = viewport.width || 10;
  const height = viewport.height || 10;

  // Reset all particle properties to ensure clean state
  state.sizes[index] = MIN_PARTICLE_SIZE + Math.random() * RUNNER_SIZE;
  state.velocities[i3] = 0;
  state.velocities[i3 + 1] = 0;
  state.velocities[i3 + 2] = 0;

  // Reset tracking attributes
  state.nearestAngles[index] = 0;
  state.nearestDistances[index] = 999;
  state.hasTargets[index] = 0;

  // Position based on edge
  const edgeOffset = Math.random() * 0.5; // Small random offset from edge

  // Responsive spawning exclusion based on screen size
  const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const isMobile = screenWidth < 768;
  const isTablet = screenWidth < 1024;
  
  let centerExclusionX, centerExclusionY;
  if (isMobile) {
    // Mobile: Spawn closer to middle - only exclude center 50%
    centerExclusionX = width * 0.25; // 50% of screen width
    centerExclusionY = height * 0.25; // 50% of screen height
  } else if (isTablet) {
    // Tablet: Exclude center 60%
    centerExclusionX = width * 0.3;
    centerExclusionY = height * 0.3;
  } else {
    // Desktop: Exclude center 75% to force edge spawning
    centerExclusionX = width * 0.375;
    centerExclusionY = height * 0.375;
  }
  
  switch(edge) {
    case 0: // Top
      // On mobile, spawn along entire top edge
      let topX;
      if (isMobile) {
        topX = (Math.random() - 0.5) * width * 0.95; // Use almost full width
      } else {
        // Desktop: avoid center
        topX = Math.random() < 0.5 
          ? -width / 2 + Math.random() * (width / 2 - centerExclusionX)
          : centerExclusionX + Math.random() * (width / 2 - centerExclusionX);
      }
      state.positions[i3] = topX;
      state.positions[i3 + 1] = -height / 2 + edgeOffset;
      // On mobile, particles should have minimal initial velocity
      if (isMobile) {
        state.velocities[i3 + 1] = 0; // No vertical movement
        state.velocities[i3] = Math.sign(topX) * 0.02; // Very gentle movement along edge
      } else {
        state.velocities[i3 + 1] = 0.02; // Very slight downward on desktop
        state.velocities[i3] = Math.sign(topX) * 0.05;
      }
      break;
    case 1: // Right
      state.positions[i3] = width / 2 - edgeOffset;
      // On mobile, spawn along entire right edge
      let rightY;
      if (isMobile) {
        rightY = (Math.random() - 0.5) * height * 0.95; // Use almost full height
      } else {
        // Desktop: avoid center
        rightY = Math.random() < 0.5
          ? -height / 2 + Math.random() * (height / 2 - centerExclusionY)
          : centerExclusionY + Math.random() * (height / 2 - centerExclusionY);
      }
      state.positions[i3 + 1] = rightY;
      // On mobile, minimal movement
      if (isMobile) {
        state.velocities[i3] = 0; // No horizontal movement inward
        state.velocities[i3 + 1] = Math.sign(rightY) * 0.02; // Very gentle movement along edge
      } else {
        state.velocities[i3] = -0.02; // Very slight leftward on desktop
        state.velocities[i3 + 1] = Math.sign(rightY) * 0.02;
      }
      break;
    case 2: // Bottom
      // On mobile, spawn along entire bottom edge
      let bottomX;
      if (isMobile) {
        bottomX = (Math.random() - 0.5) * width * 0.95; // Use almost full width
      } else {
        // Desktop: avoid center
        bottomX = Math.random() < 0.5
          ? -width / 2 + Math.random() * (width / 2 - centerExclusionX)
          : centerExclusionX + Math.random() * (width / 2 - centerExclusionX);
      }
      state.positions[i3] = bottomX;
      state.positions[i3 + 1] = height / 2 - edgeOffset;
      // On mobile, minimal movement
      if (isMobile) {
        state.velocities[i3 + 1] = 0; // No vertical movement inward
        state.velocities[i3] = Math.sign(bottomX) * 0.02; // Very gentle movement along edge
      } else {
        state.velocities[i3 + 1] = -0.02; // Very slight upward on desktop
        state.velocities[i3] = Math.sign(bottomX) * 0.05;
      }
      break;
    case 3: // Left
      state.positions[i3] = -width / 2 + edgeOffset;
      // On mobile, spawn along entire left edge
      let leftY;
      if (isMobile) {
        leftY = (Math.random() - 0.5) * height * 0.95; // Use almost full height
      } else {
        // Desktop: avoid center
        leftY = Math.random() < 0.5
          ? -height / 2 + Math.random() * (height / 2 - centerExclusionY)
          : centerExclusionY + Math.random() * (height / 2 - centerExclusionY);
      }
      state.positions[i3 + 1] = leftY;
      // On mobile, minimal movement
      if (isMobile) {
        state.velocities[i3] = 0; // No horizontal movement inward
        state.velocities[i3 + 1] = Math.sign(leftY) * 0.02; // Very gentle movement along edge
      } else {
        state.velocities[i3] = 0.02; // Very slight rightward on desktop
        state.velocities[i3 + 1] = Math.sign(leftY) * 0.02;
      }
      break;
  }

  // Set baseY to match the new position
  const newY = state.positions[i3 + 1];
  if (newY !== undefined) {
    // baseY is the true position (scroll is handled separately)
    state.baseY[index] = newY;
  }

  // Random Z depth
  const newZ = (Math.random() - 0.5) * 2;
  state.positions[i3 + 2] = newZ;
  state.baseZ[index] = newZ;

  // Reassign role
  const roleChance = Math.random();
  if (roleChance < CHASER_RATIO) {
    state.roles[index] = 0; // Chaser
  } else if (roleChance < CHASER_RATIO + RUNNER_RATIO) {
    state.roles[index] = 1; // Runner
  } else {
    state.roles[index] = 2; // Neutral
  }
  state.energies[index] = Math.random();
}

function respawnParticle(index: number, state: ParticleState, viewport: { width: number; height: number }, screenWidth: number) {
  const i3 = index * 3;
  const edgeChoice = Math.floor(Math.random() * 4);
  const progress = Math.random();

  const width = viewport.width || 10;
  const height = viewport.height || 10;

  // Reset size and velocity
  state.sizes[index] = MIN_PARTICLE_SIZE + Math.random() * RUNNER_SIZE; // Start with more consistent size
  state.velocities[i3] = 0;
  state.velocities[i3 + 1] = 0;
  state.velocities[i3 + 2] = 0;

  // Don't apply scroll offset during respawn - it's handled by the physics system

  let maxOffset = 1.0; // Tight for large screens
  if (screenWidth < SMALL_SCREEN_WIDTH) {
    maxOffset = EDGE_OFFSET_SMALL_SCREEN; // More room on small screens
  } else if (screenWidth < MEDIUM_SCREEN_WIDTH) {
    maxOffset = EDGE_OFFSET_MEDIUM_SCREEN; // Medium screens
  }
  const edgeOffset = Math.random() * maxOffset; // Random offset from edge

  let newY;
  if (edgeChoice === 0) { // Top edge
    state.positions[i3] = (progress - 0.5) * width * WIDTH_USAGE_RATIO;
    newY = height * 0.5 - edgeOffset;
    state.positions[i3 + 1] = newY; // Don't apply scroll offset here
    state.positions[i3 + 2] = (Math.random() - 0.5) * 2;
  } else if (edgeChoice === 1) { // Right edge
    state.positions[i3] = width * 0.5 - edgeOffset;
    newY = (progress - 0.5) * height * HEIGHT_USAGE_RATIO;
    state.positions[i3 + 1] = newY; // Don't apply scroll offset here
    state.positions[i3 + 2] = (Math.random() - 0.5) * 2;
  } else if (edgeChoice === 2) { // Bottom edge
    state.positions[i3] = (progress - 0.5) * width * WIDTH_USAGE_RATIO;
    newY = -height * 0.5 + edgeOffset;
    state.positions[i3 + 1] = newY; // Don't apply scroll offset here
    state.positions[i3 + 2] = (Math.random() - 0.5) * 2;
  } else { // Left edge
    state.positions[i3] = -width * 0.5 + edgeOffset;
    newY = (progress - 0.5) * height * HEIGHT_USAGE_RATIO;
    state.positions[i3 + 1] = newY; // Don't apply scroll offset here
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
  elapsedTime: number = 0,
  scrollFactors?: { migration: number; offset: number },
) {
  const spatialHash = globalSpatialHash;

  // Clear the spatial hash for the new frame
  spatialHash.clear();

  // Calculate scroll offset ONCE at the top of the function
  const scrollOffsetY = scroll.y * SCROLL_Y_MULTIPLIER; // Subtle vertical movement

  // Track visible particles
  let visibleParticleCount = 0;

  // Add scroll-based size modulation for depth perception
  // const scrollDepthEffect = 1.0 + scroll.y * SCROLL_DEPTH_EFFECT; // Particles appear to get smaller as you scroll

  // Get screen dimensions once at the start
  const screenWidth = (typeof window !== 'undefined') ? window.innerWidth : 1920;
  const screenHeight = (typeof window !== 'undefined') ? window.innerHeight : 1080;
  const isMobile = screenWidth < 768;
  const isTablet = screenWidth < 1024;
  const isSmallHeight = screenHeight < 700;

  // Get viewport dimensions for boundary checks
  const viewportWidth = viewport.width / 2;
  const viewportHeight = viewport.height / 2;

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
    const myY = (state.baseY[i] ?? 0) + scrollOffsetY; // Use scroll-adjusted Y for game logic
    const myBaseY = state.baseY[i] ?? 0; // Base Y for boundary calculations

    // Find nearest valid target using spatial hash
    const candidates = spatialHash.queryNeighbors(myX, myY);
    let nearestDistSquared = Infinity;
    let nearestAngle = 0;
    let foundTarget = false;
    let nearestTargetIndex = -1;

    for (const j of candidates) {
      if (i === j) continue;

      const otherRole = state.roles[j] ?? 0;
      const otherSize = state.sizes[j] ?? 0.5;
      const otherX = state.positions[j * 3] ?? 0;
      const otherY = (state.baseY[j] ?? 0) + scrollOffsetY;

      const dx = otherX - myX;
      const dy = otherY - myY;
      const distSquared = dx * dx + dy * dy;

      let isValidTarget = false;

      if (myRole < 1.0) {
        // Chasers look for smaller prey
        isValidTarget = otherSize < mySize * CATCH_SIZE_RATIO && distSquared < CHASER_DETECTION_RANGE * CHASER_DETECTION_RANGE;
      } else {
        // Runners and neutrals look for nearby chasers to avoid
        isValidTarget = otherRole < 1.0 && distSquared < RUNNER_DETECTION_RANGE * RUNNER_DETECTION_RANGE;
      }

      if (isValidTarget && distSquared < nearestDistSquared) {
        nearestDistSquared = distSquared;
        // Only calculate angle if we'll use it
        nearestAngle = Math.atan2(dy, dx);
        foundTarget = true;
        nearestTargetIndex = j;
      }
    }

    // Store nearest target info
    state.nearestAngles[i] = nearestAngle;
    // Store actual distance (not squared) for shader use
    const nearestDistance = foundTarget ? Math.sqrt(nearestDistSquared) : 10.0;
    state.nearestDistances[i] = Math.min(nearestDistance, 10.0);
    state.hasTargets[i] = foundTarget ? 1.0 : 0.0;

    // Calculate acceleration based on role and target
    let accelX = 0;
    let accelY = 0;

    const huntingIntensity = (state.energies[i] ?? 0) * (1.0 + Math.sin(elapsedTime * HUNTING_INTENSITY_FREQUENCY + i) * HUNTING_INTENSITY_VARIATION);

    if (myRole < 1.0) {
      // CHASERS - pursuit behavior
      const chaseMultiplier = isMobile ? 1.5 : 1.2; // Enhanced chase on all devices
      const baseChaseSpeed = (CHASE_STRENGTH + mySize * 0.01) * huntingIntensity * chaseMultiplier;

      if (foundTarget) {
        const pursuitDirectionX = Math.cos(nearestAngle);
        const pursuitDirectionY = Math.sin(nearestAngle);
        const pursuitIntensity = Math.max(0, (PURSUIT_INTENSITY_RANGE - nearestDistance) / PURSUIT_INTENSITY_RANGE);

        accelX = pursuitDirectionX * baseChaseSpeed * (1.0 + pursuitIntensity * PURSUIT_INTENSITY_BOOST);
        accelY = pursuitDirectionY * baseChaseSpeed * (1.0 + pursuitIntensity * PURSUIT_INTENSITY_BOOST);

        // Final sprint when very close
        if (nearestDistance < SPRINT_BOOST_THRESHOLD) {
          const sprintBoost = (SPRINT_BOOST_THRESHOLD - nearestDistance) / SPRINT_BOOST_THRESHOLD * SPRINT_BOOST_STRENGTH;
          accelX += pursuitDirectionX * sprintBoost;
          accelY += pursuitDirectionY * sprintBoost;
        }
      } else {
        // Search pattern
        const searchAngle = elapsedTime * SEARCH_ANGLE_SPEED + i;
        accelX = Math.cos(searchAngle) * SEARCH_PATTERN_SPEED;
        accelY = Math.sin(searchAngle) * SEARCH_PATTERN_SPEED;
      }

    } else if (myRole < 2.0) {
      // RUNNERS - escape behavior
      const escapeMultiplier = isMobile ? 1.5 : 1.2; // Enhanced escape on all devices
      const baseEscapeSpeed = (ESCAPE_STRENGTH + (1.0 - mySize) * 0.01) * escapeMultiplier;

      if (foundTarget) {
        const escapeDirectionX = -Math.cos(nearestAngle);
        const escapeDirectionY = -Math.sin(nearestAngle);
        const panicLevel = Math.max(0, (PANIC_LEVEL_RANGE - nearestDistance) / PANIC_LEVEL_RANGE);

        accelX = escapeDirectionX * baseEscapeSpeed * (1.0 + panicLevel * PANIC_LEVEL_BOOST);
        accelY = escapeDirectionY * baseEscapeSpeed * (1.0 + panicLevel * PANIC_LEVEL_BOOST);

        // Emergency escape when very close
        if (nearestDistance < EMERGENCY_ESCAPE_THRESHOLD) {
          const emergencyEscape = (EMERGENCY_ESCAPE_THRESHOLD - nearestDistance) * EMERGENCY_ESCAPE_STRENGTH;
          accelX += escapeDirectionX * emergencyEscape;
          accelY += escapeDirectionY * emergencyEscape;
        }
      } else {
        // Casual movement
        accelX = Math.cos(elapsedTime * CASUAL_MOVEMENT_X_SPEED + i) * CASUAL_MOVEMENT_SPEED;
        accelY = Math.sin(elapsedTime * CASUAL_MOVEMENT_Y_SPEED + i) * CASUAL_MOVEMENT_SPEED;
      }

    } else {
      // NEUTRAL - mild avoidance
      const neutralSpeed = NEUTRAL_SPEED;

      if (foundTarget) {
        const avoidanceDirectionX = -Math.cos(nearestAngle);
        const avoidanceDirectionY = -Math.sin(nearestAngle);
        const cautionLevel = Math.max(0, (NEUTRAL_AVOIDANCE_RANGE - nearestDistance) / NEUTRAL_AVOIDANCE_RANGE);

        accelX = avoidanceDirectionX * neutralSpeed * cautionLevel * CAUTION_LEVEL_MULTIPLIER;
        accelY = avoidanceDirectionY * neutralSpeed * cautionLevel * CAUTION_LEVEL_MULTIPLIER;

        const wanderIntensity = 1.0 - cautionLevel * WANDER_INTENSITY_REDUCTION;
        accelX += Math.cos(elapsedTime * NEUTRAL_WANDER_X_SPEED + i) * CASUAL_MOVEMENT_SPEED * wanderIntensity;
        accelY += Math.sin(elapsedTime * NEUTRAL_WANDER_Y_SPEED + i) * CASUAL_MOVEMENT_SPEED * wanderIntensity;
      } else {
        // Pure peaceful wandering
        accelX = Math.cos(elapsedTime * NEUTRAL_WANDER_X_SPEED + i) * CASUAL_MOVEMENT_SPEED;
        accelY = Math.sin(elapsedTime * NEUTRAL_WANDER_Y_SPEED + i) * CASUAL_MOVEMENT_SPEED;
      }
    }

    // PARTICLE SEPARATION - prevent clumping
    // Check nearby particles and push away from those too close
    const separationMultiplier = isMobile ? 1.5 : 1.2; // Enhanced separation on all devices
    for (const j of candidates) {
      if (i === j) continue;

      const otherX = state.positions[j * 3] ?? 0;
      const otherY = (state.baseY[j] ?? 0) + scrollOffsetY;

      const sepDx = myX - otherX;
      const sepDy = myY - otherY;
      const sepDistSquared = sepDx * sepDx + sepDy * sepDy;
      const sepDist = Math.sqrt(sepDistSquared);

      // Apply separation force if too close
      if (sepDist < SEPARATION_DISTANCE && sepDist > 0.001) {
        const sepForce = (SEPARATION_DISTANCE - sepDist) / SEPARATION_DISTANCE * SEPARATION_STRENGTH * separationMultiplier;
        const sepNormX = sepDx / sepDist;
        const sepNormY = sepDy / sepDist;

        accelX += sepNormX * sepForce;
        accelY += sepNormY * sepForce;
      }
    }

    // Apply lateral migration force based on scroll - DISABLED on mobile
    if (!isMobile && scrollFactors) {
      const migrationStrength = 0.01;
      const edgeDistance = viewport.width / 2 - Math.abs(myX);
      accelX += scrollFactors.migration * edgeDistance * migrationStrength * Math.sign(myX);
    }

    // Apply external forces (mouse) - DISABLED on mobile
    if (!isMobile) {
      const mouseDistance = Math.sqrt((myX - mouse.x * 2.5) ** 2 + (myY - mouse.y * 2.5) ** 2);
      if (mouseDistance < MOUSE_INFLUENCE_RADIUS) {
        const influenceStrength = (MOUSE_INFLUENCE_RADIUS - mouseDistance) / MOUSE_INFLUENCE_RADIUS;
        const gentleForceX = (myX - mouse.x * 2.5) / mouseDistance;
        const gentleForceY = (myY - mouse.y * 2.5) / mouseDistance;
        accelX += gentleForceX * influenceStrength * MOUSE_INFLUENCE_STRENGTH;
        accelY += gentleForceY * influenceStrength * MOUSE_INFLUENCE_STRENGTH;
      }
    }

    // POWERFUL SCROLL FORCES with natural physics - REDUCED on mobile
    const scrollMultiplier = isMobile ? 0.1 : 1.0; // Much less scroll influence on mobile
    const scrollInfluence = Math.min(scroll.y / SCROLL_INFLUENCE_DIVISOR, 1.0) * scrollMultiplier;
    const scrollVel = scroll.velocity * scrollMultiplier; // Reduced scroll velocity impact

    // 1. Direct scroll momentum transfer - particles inherit scroll motion
    accelY -= scrollVel * SCROLL_MOMENTUM_MULTIPLIER; // Strong upward push when scrolling down

    // 2. Vortex effect - particles spiral outward on scroll
    const distSqFromCenter = myX * myX + myY * myY;
    const maxDistSq = (viewportWidth * VORTEX_RADIUS_MULTIPLIER) * (viewportWidth * VORTEX_RADIUS_MULTIPLIER);
    const vortexStrength = scrollInfluence * VORTEX_STRENGTH_MULTIPLIER * Math.max(0, 1.0 - distSqFromCenter / maxDistSq);
    if (vortexStrength > 0) {
      // Tangential force for spiral - calculate sin/cos once
      const angle = Math.atan2(myY, myX);
      const cosAngle = Math.cos(angle);
      const sinAngle = Math.sin(angle);
      accelX += (-sinAngle * vortexStrength + cosAngle * vortexStrength * 0.5);
      accelY += (cosAngle * vortexStrength + sinAngle * vortexStrength * 0.5);
    }

    // 3. Wave propagation - ripple effect from scroll
    const distFromCenter = Math.sqrt(distSqFromCenter); // Only calculate if needed
    const wavePhase = elapsedTime * WAVE_SPEED_MULTIPLIER + distFromCenter * WAVE_DISTANCE_SCALE;
    const waveAmplitude = scrollInfluence * WAVE_AMPLITUDE_MULTIPLIER;
    if (waveAmplitude > 0.001) { // Skip if amplitude is negligible
      accelX += Math.cos(wavePhase) * waveAmplitude * Math.sign(myX || 1);
      accelY += Math.sin(wavePhase) * waveAmplitude * 0.5;
    }

    // 4. Enhanced turbulence with more variation - reduced on all devices
    const turbulenceMultiplier = isMobile ? 0.1 : 0.5; // Less turbulence everywhere
    const baseTurbulence = TURBULENCE_BASE * (0.5 + Math.random() * 0.5) * turbulenceMultiplier;
    const turbulence = baseTurbulence + scrollVel * TURBULENCE_VELOCITY_SCALE * turbulenceMultiplier;
    const seed = state.randomSeeds[i] ?? 0;
    const noiseTime = elapsedTime * 0.2; // Varied speed
    // Use multiple octaves for more organic motion
    const noise1X = Math.sin(noiseTime * 1.0 + seed * 2.0) * 0.6;
    const noise1Y = Math.cos(noiseTime * 1.0 + seed * 2.0 + Math.PI/2) * 0.6;
    const noise2X = Math.sin(noiseTime * 2.3 + seed * 3.0) * 0.3;
    const noise2Y = Math.cos(noiseTime * 2.3 + seed * 3.0 + Math.PI/3) * 0.3;
    const noise3X = Math.sin(noiseTime * 0.5 + seed * 5.0) * 0.1;
    const noise3Y = Math.cos(noiseTime * 0.5 + seed * 5.0 + Math.PI/4) * 0.1;

    accelX += (noise1X + noise2X + noise3X) * turbulence;
    accelY += (noise1Y + noise2Y + noise3Y) * turbulence;

    // 2. Boundary repulsion force - MODIFIED for mobile to prevent escape
    const boundaryPadding = isMobile ? 0.5 : BOUNDARY_PADDING; // Tighter boundary on mobile
    const repulsionStrength = BOUNDARY_REPULSION_STRENGTH;
    const boundaryZone = isMobile ? boundaryPadding : boundaryPadding * 3; // Tighter zone on mobile

    // Right boundary
    if (myX > viewportWidth - boundaryZone) {
      const dist = viewportWidth - myX;
      const force = repulsionStrength * Math.exp(-dist / boundaryPadding);
      accelX -= force;
      // Add some inward velocity if very close to edge - but not on mobile
      if (!isMobile && dist < boundaryPadding) {
        state.velocities[i3] = Math.min(state.velocities[i3] ?? 0, -0.05);
      }
    }
    // Left boundary
    if (myX < -viewportWidth + boundaryZone) {
      const dist = myX + viewportWidth;
      const force = repulsionStrength * Math.exp(-dist / boundaryPadding);
      accelX += force;
      // Add some inward velocity if very close to edge - but not on mobile
      if (!isMobile && dist < boundaryPadding) {
        state.velocities[i3] = Math.max(state.velocities[i3] ?? 0, 0.05);
      }
    }
    // Bottom boundary - use base Y
    if (myBaseY > viewportHeight - boundaryZone) {
      const dist = viewportHeight - myBaseY;
      const force = repulsionStrength * Math.exp(-dist / boundaryPadding);
      accelY -= force;
      // Add some inward velocity if very close to edge - but not on mobile
      if (!isMobile && dist < boundaryPadding) {
        state.velocities[i3 + 1] = Math.min(state.velocities[i3 + 1] ?? 0, -0.05);
      }
    }
    // Top boundary - use base Y
    if (myBaseY < -viewportHeight + boundaryZone) {
      const dist = myBaseY + viewportHeight;
      const force = repulsionStrength * Math.exp(-dist / boundaryPadding);
      accelY += force;
      // Add some inward velocity if very close to edge - but not on mobile
      if (!isMobile && dist < boundaryPadding) {
        state.velocities[i3 + 1] = Math.max(state.velocities[i3 + 1] ?? 0, 0.05);
      }
    }

    // 3. INVISIBLE WALL - Keep particles away from center
    // Using screen size variables declared at the top
    
    // Dynamic exclusion zone based on screen size
    let exclusionMultiplierX = CENTER_EXCLUSION_X; // Default: 1.6 (80% of screen)
    let exclusionMultiplierY = CENTER_EXCLUSION_Y; // Default: 1.4 (70% of screen)
    
    if (isMobile) {
      // Mobile: Smaller exclusion zone (60% of screen) to allow particles closer to center
      exclusionMultiplierX = 1.2; // 60% of total width
      exclusionMultiplierY = 1.2; // 60% of total height
    } else if (isTablet) {
      // Tablet: Moderate exclusion zone (65% x 65%)
      exclusionMultiplierX = 1.3;
      exclusionMultiplierY = 1.3;
    } else if (screenWidth < 1400) {
      // Small desktop: (60% x 55%)
      exclusionMultiplierX = CENTER_EXCLUSION_X;
      exclusionMultiplierY = CENTER_EXCLUSION_Y;
    }
    
    // Further reduce on small height screens
    if (isSmallHeight) {
      exclusionMultiplierY *= 0.7;
    }
    
    const centerExclusionZoneX = viewportWidth * exclusionMultiplierX;
    const centerExclusionZoneY = viewportHeight * exclusionMultiplierY;
    // Tablet uses intermediate repulsion
    const centerRepulsion = isMobile ? MOBILE_CENTER_REPULSION : (isTablet ? CENTER_REPULSION * 0.5 : CENTER_REPULSION);

    // Calculate elliptical distance from center
    const centerDistX = Math.abs(myX) / centerExclusionZoneX;
    const centerDistY = Math.abs(myBaseY) / centerExclusionZoneY;
    
    // Ellipse equation: (x/a)² + (y/b)² = 1
    const ellipticalDistance = Math.sqrt(centerDistX * centerDistX + centerDistY * centerDistY);

    // Check if particle is within the elliptical exclusion zone
    if (ellipticalDistance < 1.0) {
      // Smooth gradient repulsion based on elliptical distance
      const smooth = 1.0 - ellipticalDistance;
      
      // Smoothstep function for gentle force curve
      const smoothstep = smooth * smooth * (3.0 - 2.0 * smooth);
      
      // Calculate normalized direction from center
      const dirX = centerDistX > 0 ? myX / Math.abs(myX) : 1;
      const dirY = centerDistY > 0 ? myBaseY / Math.abs(myBaseY) : 1;
      
      // Apply forces radially from ellipse center
      let forceX = dirX * centerDistX * smoothstep * centerRepulsion;
      let forceY = dirY * centerDistY * smoothstep * centerRepulsion;
      
      // Add velocity damping on tablets to prevent oscillation
      if (isTablet) {
        const velX = state.velocities[i3] ?? 0;
        const velY = state.velocities[i3 + 1] ?? 0;
        forceX -= velX * 0.3; // Damping
        forceY -= velY * 0.3; // Damping
      }

      accelX += forceX;
      accelY += forceY;

      // Very gentle minimum velocity to ensure particles drift outward
      if (centerDistX < 0.5) {
        const minVelX = Math.sign(myX || 1) * 0.015; // Very gentle push
        if (Math.abs(state.velocities[i3] ?? 0) < Math.abs(minVelX)) {
          state.velocities[i3] = minVelX;
        }
      }
      if (centerDistY < 0.5) {
        const minVelY = Math.sign(myBaseY || 1) * 0.015; // Very gentle push
        if (Math.abs(state.velocities[i3 + 1] ?? 0) < Math.abs(minVelY)) {
          state.velocities[i3 + 1] = minVelY;
        }
      }

      // Emergency push for particles too close to center
      if (ellipticalDistance < 0.3) {
        const angle = Math.atan2(myBaseY || 1, myX || 1);
        const emergencyMultiplier = isMobile ? 5.0 : (isTablet ? 7.0 : 10.0); // Gradual increase
        const emergencyForce = centerRepulsion * emergencyMultiplier;
        
        // Apply very strong force on desktop
        accelX += Math.cos(angle) * emergencyForce;
        accelY += Math.sin(angle) * emergencyForce;
        
        // Strong outward velocity on desktop
        const outwardVel = isMobile ? 0.1 : (isTablet ? 0.15 : 0.3);
        state.velocities[i3] = Math.cos(angle) * outwardVel;
        state.velocities[i3 + 1] = Math.sin(angle) * outwardVel;
      }
    } else if (ellipticalDistance < 1.2) {
      // Gentle edge gradient for particles near the ellipse boundary
      const edgeDist = 1.2 - ellipticalDistance;
      const edgeForce = edgeDist * centerRepulsion * 0.1;
      
      // Apply force radially
      const dirX = myX === 0 ? 0 : myX / Math.abs(myX);
      const dirY = myBaseY === 0 ? 0 : myBaseY / Math.abs(myBaseY);
      
      accelX += dirX * centerDistX * edgeForce;
      accelY += dirY * centerDistY * edgeForce;
    }

    // EDGE ATTRACTION - Apply on desktop and tablets (with different strengths)
    if (!isMobile) { // Desktop and tablet
      // Calculate distance to nearest edge (correctly)
      const distToLeftEdge = myX + viewportWidth; // Distance from left edge
      const distToRightEdge = viewportWidth - myX; // Distance from right edge  
      const distToTopEdge = myBaseY + viewportHeight; // Distance from top edge
      const distToBottomEdge = viewportHeight - myBaseY; // Distance from bottom edge
      
      // Find closest edge
      const minHorizontalDist = Math.min(distToLeftEdge, distToRightEdge);
      const minVerticalDist = Math.min(distToTopEdge, distToBottomEdge);
      
      // Attraction strength increases as particle moves away from edge
      const edgeAttractionStrength = isMobile ? MOBILE_EDGE_ATTRACTION : MOBILE_EDGE_ATTRACTION * 0.5;
      const optimalEdgeDistance = isMobile ? viewportWidth * 0.02 : viewportWidth * 0.04; // Very tight on mobile
      
      // Horizontal edge attraction - keep particles INSIDE viewport
      const leftEdgeTarget = -viewportWidth + optimalEdgeDistance;
      const rightEdgeTarget = viewportWidth - optimalEdgeDistance;
      
      // Edge attraction - different strength for tablet vs desktop
      const edgeStrength = isTablet ? DESKTOP_EDGE_ATTRACTION * 0.3 : DESKTOP_EDGE_ATTRACTION;
      
      // Horizontal attraction - continuous force
      const xFromCenter = Math.abs(myX) / viewportWidth;
      if (xFromCenter < 0.7) {
        // Strong push from center
        const pushStrength = 1.0 - xFromCenter;
        accelX += Math.sign(myX || 1) * edgeStrength * pushStrength;
      } else {
        // Near edge - maintain position
        const edgeTarget = Math.sign(myX) * (viewportWidth * 0.85);
        const pullStrength = (edgeTarget - myX) * 0.05;
        accelX += pullStrength;
      }
      
      // Vertical attraction - continuous force
      const yFromCenter = Math.abs(myBaseY) / viewportHeight;
      if (yFromCenter < 0.7) {
        // Strong push from center
        const pushStrength = 1.0 - yFromCenter;
        accelY += Math.sign(myBaseY || 1) * edgeStrength * pushStrength;
      } else {
        // Near edge - maintain position
        const edgeTarget = Math.sign(myBaseY) * (viewportHeight * 0.85);
        const pullStrength = (edgeTarget - myBaseY) * 0.05;
        accelY += pullStrength;
      }
    }

    // Apply reduced motion damping if needed - less damping during scroll
    const scrollDamping = 1.0 - Math.min(Math.abs(scroll.velocity) * 0.5, SCROLL_VELOCITY_DAMPING);
    const dampingFactor = isReducedMotion ? REDUCED_MOTION_DAMPING : VELOCITY_DAMPING * scrollDamping;

    // Clamp delta to prevent large jumps and slow down overall simulation
    const clampedDelta = Math.min(delta * 60, DELTA_CLAMP) * SIMULATION_SPEED; // Further reduced speed multiplier

    // Update velocity
    const velX = (state.velocities[i3] ?? 0) + accelX * clampedDelta;
    const velY = (state.velocities[i3 + 1] ?? 0) + accelY * clampedDelta;
    state.velocities[i3] = velX * dampingFactor;
    state.velocities[i3 + 1] = velY * dampingFactor;

    // Update position
    let posX = (state.positions[i3] ?? 0) + (state.velocities[i3] ?? 0) * clampedDelta;
    const baseYCurrent = state.baseY[i] ?? 0;
    let posY = baseYCurrent + (state.velocities[i3 + 1] ?? 0) * clampedDelta;

    // CLAMP positions to viewport to prevent escape - apply to all devices
    const maxEdgeX = viewportWidth - 0.1;
    const maxEdgeY = viewportHeight - 0.1;
    posX = Math.max(-maxEdgeX, Math.min(maxEdgeX, posX));
    posY = Math.max(-maxEdgeY, Math.min(maxEdgeY, posY));

    // Update positions
    state.positions[i3] = posX;
    state.baseY[i] = posY;  // Store the true Y position
    state.positions[i3 + 1] = posY + scrollOffsetY;  // Apply scroll offset for rendering

    // Apply Z-axis parallax for depth effect
    state.positions[i3 + 2] = (state.baseZ[i] ?? 0) + (scrollFactors?.offset ?? 0) * 2.0;

    // Handle eating (only for chasers) - made harder to catch
    if (myRole < 1.0 && foundTarget && nearestTargetIndex >= 0 && nearestDistance < CATCH_DISTANCE) {
      const preySize = state.sizes[nearestTargetIndex] ?? 0.5;
      if (preySize < mySize * PREY_SIZE_RATIO) { // Prey must be significantly smaller
        // Eating event!
        state.sizes[i] = Math.min(mySize + SIZE_GROWTH_AMOUNT, MAX_PARTICLE_SIZE); // Grow slower
        respawnParticle(nearestTargetIndex, state, viewport, screenWidth);
      }
    }

    // Auto-burst when too big - increased threshold
    const currentSize = state.sizes[i] ?? 0.5;
    if (currentSize > SIZE_BURST_THRESHOLD) {
      respawnParticle(i, state, viewport, screenWidth);
    }

    // Viewport culling - respawn particles that leave the visible area
    const viewportPadding = isMobile ? 2.0 : 5.0; // Tighter culling on mobile but not too tight
    const maxX = viewportWidth + viewportPadding;
    const maxY = viewportHeight + viewportPadding;

    // Check if particle is outside viewport bounds using base positions
    const baseX = state.positions[i3] ?? 0;
    const baseY = state.baseY[i] ?? 0;  // Use base Y without scroll offset

    // For Y-axis, we need to consider that particles flow with scroll
    // When scrolling down (positive velocity), particles move up relatively to viewport
    // Respawn at top when they exit bottom, and vice versa
    let needsRespawn = false;
    let respawnEdge = 0;

    if (baseY > maxY) {
      // Particle exited bottom
      needsRespawn = true;
      respawnEdge = scroll.velocity >= 0 ? 0 : 2; // Bias respawn edge based on scroll direction
    } else if (baseY < -maxY) {
      // Particle exited top
      needsRespawn = true;
      respawnEdge = scroll.velocity <= 0 ? 2 : 0; // Bias respawn edge based on scroll direction
    } else if (baseX > maxX) {
      // Particle exited right
      needsRespawn = true;
      respawnEdge = 3; // Respawn at left
    } else if (baseX < -maxX) {
      // Particle exited left
      needsRespawn = true;
      respawnEdge = 1; // Respawn at right
    }

    if (needsRespawn) {
      respawnParticleAtEdge(i, state, viewport, screenWidth, respawnEdge);
    } else {
      // Only count particles that are actually visible in the viewport
      const isVisible = baseX >= -maxX && baseX <= maxX && baseY >= -maxY && baseY <= maxY;
      if (isVisible) {
        visibleParticleCount++;
      }
    }

  }

  // REMOVED aggressive particle density maintenance to prevent popping
  // Only respawn if critically low (less than 30% visible)
  const criticalRatio = 0.3;
  const criticalCount = Math.floor(state.count * criticalRatio);

  // Failsafe: If NO particles are visible, respawn them all immediately
  if (visibleParticleCount === 0 && state.count > 0) {
    for (let i = 0; i < state.count; i++) {
      const edge = Math.floor(Math.random() * 4);
      respawnParticleAtEdge(i, state, viewport, screenWidth, edge);
    }
    return; // Skip the rest of the logic
  }

  // Only respawn if critically low
  if (visibleParticleCount < criticalCount) {
    // Only respawn particles that are VERY far away
    for (let i = 0; i < state.count; i++) {
      const i3 = i * 3;
      const particleX = state.positions[i3] ?? 0;
      const particleY = state.baseY[i] ?? 0;

      // Only respawn if VERY far outside viewport (3x the viewport size)
      const veryFarPadding = viewportWidth * 3;
      if (Math.abs(particleX) > viewportWidth + veryFarPadding ||
          Math.abs(particleY) > viewportHeight + veryFarPadding) {
        // Respawn at opposite edge
        let edge: number;
        if (particleX > viewportWidth + veryFarPadding) edge = 3; // Was far right, spawn left
        else if (particleX < -viewportWidth - veryFarPadding) edge = 1; // Was far left, spawn right
        else if (particleY > viewportHeight + veryFarPadding) edge = 0; // Was far bottom, spawn top
        else edge = 2; // Was far top, spawn bottom
        
        respawnParticleAtEdge(i, state, viewport, screenWidth, edge);
      }
    }
  }
}