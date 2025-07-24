import {
  NORMAL_SIZE, RUNNER_SIZE, MIN_PARTICLE_SIZE, MAX_PARTICLE_SIZE,
  SIZE_BURST_THRESHOLD, SIZE_GROWTH_AMOUNT, PREY_SIZE_RATIO, CATCH_SIZE_RATIO,
  CHASE_STRENGTH, ESCAPE_STRENGTH, NEUTRAL_SPEED, SEARCH_PATTERN_SPEED,
  CASUAL_MOVEMENT_SPEED, SPRINT_BOOST_THRESHOLD, SPRINT_BOOST_STRENGTH,
  EMERGENCY_ESCAPE_THRESHOLD, EMERGENCY_ESCAPE_STRENGTH, MOUSE_INFLUENCE_RADIUS,
  MOUSE_INFLUENCE_STRENGTH, CENTER_EXCLUSION_X, CENTER_EXCLUSION_Y,
  CENTER_ZONE_X, CENTER_ZONE_Y, CENTER_REPULSION, VELOCITY_DAMPING,
  REDUCED_MOTION_DAMPING,
  RESIZE_VELOCITY_SCALE, CELL_SIZE,
  SCROLL_Y_MULTIPLIER, SCROLL_INFLUENCE_DIVISOR, SCROLL_MOMENTUM_MULTIPLIER,
  VORTEX_STRENGTH_MULTIPLIER, VORTEX_RADIUS_MULTIPLIER, WAVE_SPEED_MULTIPLIER,
  WAVE_AMPLITUDE_MULTIPLIER, WAVE_DISTANCE_SCALE, TURBULENCE_BASE,
  TURBULENCE_VELOCITY_SCALE, SCROLL_VELOCITY_DAMPING, CHASER_DETECTION_RANGE,
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
    }
    const progress = Math.random();

    // Assign game behaviors - particles have roles in the catching game
    const roleChance = Math.random();
    let gameRole: number;
    if (roleChance < CHASER_RATIO) {
      gameRole = 0; // 30% chasers
    } else if (roleChance < CHASER_RATIO + RUNNER_RATIO) {
      gameRole = 1; // 50% runners
    } else {
      gameRole = 2; // 20% neutral
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
    randomSeeds[i] = Math.random() * 1000;

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

    // If viewport got smaller, ensure particles aren't stuck in the middle
    const centerZoneX = newViewport.width * CENTER_ZONE_X;
    const centerZoneY = newViewport.height * CENTER_ZONE_Y;

    if (state.positions) {
      const posX = state.positions[i3] ?? 0;
      const posY = state.positions[i3 + 1] ?? 0;
      if (Math.abs(posX) < centerZoneX &&
          Math.abs(posY) < centerZoneY) {
        // Push particles out of center if they ended up there after resize
        const angle = Math.atan2(posY, posX);
        state.positions[i3] = Math.cos(angle) * centerZoneX * 1.1;
        state.positions[i3 + 1] = Math.sin(angle) * centerZoneY * 1.1;

        // Give them velocity away from center
        state.velocities[i3] = Math.cos(angle) * RESIZE_VELOCITY_SCALE;
        state.velocities[i3 + 1] = Math.sin(angle) * RESIZE_VELOCITY_SCALE;
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
function respawnParticleAtEdge(index: number, state: ParticleState, viewport: { width: number; height: number }, _screenWidth: number, edge: number, scrollOffsetY: number = 0) {
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

  switch(edge) {
    case 0: // Top
      state.positions[i3] = (Math.random() - 0.5) * width * 0.9;
      state.positions[i3 + 1] = -height + edgeOffset;
      // Give slight downward velocity to integrate with flow
      state.velocities[i3 + 1] = 0.1 + Math.random() * 0.1;
      // Add slight horizontal drift
      state.velocities[i3] = (Math.random() - 0.5) * 0.05;
      break;
    case 1: // Right
      state.positions[i3] = width - edgeOffset;
      state.positions[i3 + 1] = (Math.random() - 0.5) * height * 0.9;
      state.velocities[i3] = -0.1;
      break;
    case 2: // Bottom
      state.positions[i3] = (Math.random() - 0.5) * width * 0.9;
      state.positions[i3 + 1] = height - edgeOffset;
      state.velocities[i3 + 1] = -0.1;
      break;
    case 3: // Left
      state.positions[i3] = -width + edgeOffset;
      state.positions[i3 + 1] = (Math.random() - 0.5) * height * 0.9;
      state.velocities[i3] = 0.1;
      break;
  }

  // Set baseY to match the new position (without scroll offset)
  const newY = state.positions[i3 + 1];
  if (newY !== undefined) {
    // baseY should be the scroll-independent position
    state.baseY[index] = newY - scrollOffsetY;
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

  // Get current scroll offset - STRONGER
  const scrollOffsetY = (typeof window !== 'undefined') ?
    (window.pageYOffset || document.documentElement.scrollTop || 0) / window.innerHeight * viewport.height * 6 : 0;

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
    state.positions[i3 + 1] = newY + scrollOffsetY; // Apply scroll offset
    state.positions[i3 + 2] = (Math.random() - 0.5) * 2;
  } else if (edgeChoice === 1) { // Right edge
    state.positions[i3] = width * 0.5 - edgeOffset;
    newY = (progress - 0.5) * height * HEIGHT_USAGE_RATIO;
    state.positions[i3 + 1] = newY + scrollOffsetY; // Apply scroll offset
    state.positions[i3 + 2] = (Math.random() - 0.5) * 2;
  } else if (edgeChoice === 2) { // Bottom edge
    state.positions[i3] = (progress - 0.5) * width * WIDTH_USAGE_RATIO;
    newY = -height * 0.5 + edgeOffset;
    state.positions[i3 + 1] = newY + scrollOffsetY; // Apply scroll offset
    state.positions[i3 + 2] = (Math.random() - 0.5) * 2;
  } else { // Left edge
    state.positions[i3] = -width * 0.5 + edgeOffset;
    newY = (progress - 0.5) * height * HEIGHT_USAGE_RATIO;
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

  // Get screen width once for edge calculations
  const screenWidth = (typeof window !== 'undefined') ? window.innerWidth : 1920;

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
    const myY = (state.baseY[i] ?? 0) + scrollOffsetY; // Use scroll-adjusted Y

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
      const baseChaseSpeed = (CHASE_STRENGTH + mySize * 0.01) * huntingIntensity;

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
      const baseEscapeSpeed = ESCAPE_STRENGTH + (1.0 - mySize) * 0.01;

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

    // Apply lateral migration force based on scroll
    const migrationStrength = 0.01;
    const edgeDistance = viewport.width / 2 - Math.abs(myX);
    if (scrollFactors) {
      accelX += scrollFactors.migration * edgeDistance * migrationStrength * Math.sign(myX);
    }

    // Apply external forces (mouse)
    const mouseDistance = Math.sqrt((myX - mouse.x * 2.5) ** 2 + (myY - mouse.y * 2.5) ** 2);
    if (mouseDistance < MOUSE_INFLUENCE_RADIUS) {
      const influenceStrength = (MOUSE_INFLUENCE_RADIUS - mouseDistance) / MOUSE_INFLUENCE_RADIUS;
      const gentleForceX = (myX - mouse.x * 2.5) / mouseDistance;
      const gentleForceY = (myY - mouse.y * 2.5) / mouseDistance;
      accelX += gentleForceX * influenceStrength * MOUSE_INFLUENCE_STRENGTH;
      accelY += gentleForceY * influenceStrength * MOUSE_INFLUENCE_STRENGTH;
    }

    // POWERFUL SCROLL FORCES with natural physics
    const scrollInfluence = Math.min(scroll.y / SCROLL_INFLUENCE_DIVISOR, 1.0); // Very fast ramp-up
    const scrollVel = scroll.velocity; // Use actual scroll velocity for momentum

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

    // 4. Turbulence increases with scroll - reduced frequency to prevent vibration
    const turbulence = scrollInfluence * TURBULENCE_BASE + scrollVel * TURBULENCE_VELOCITY_SCALE;
    const seed = state.randomSeeds[i] ?? 0;
    const noiseTime = elapsedTime * 0.1; // Much slower oscillation
    const noiseX = Math.sin(noiseTime + seed) * 0.5;
    const noiseY = Math.cos(noiseTime + seed + Math.PI/2) * 0.5;
    accelX += noiseX * turbulence;
    accelY += noiseY * turbulence;

    // 2. Boundary repulsion force (soft walls)
    const boundaryPadding = BOUNDARY_PADDING;
    const repulsionStrength = BOUNDARY_REPULSION_STRENGTH;

    if (myX > viewportWidth - boundaryPadding) accelX -= (repulsionStrength / (viewportWidth - myX));
    if (myX < -viewportWidth + boundaryPadding) accelX += (repulsionStrength / (myX + viewportWidth));
    if (myY > viewportHeight - boundaryPadding) accelY -= (repulsionStrength / (viewportHeight - myY));
    if (myY < -viewportHeight + boundaryPadding) accelY += (repulsionStrength / (myY + viewportHeight));

    // 3. INVISIBLE WALL - Keep particles away from center
    const centerExclusionZoneX = viewportWidth * CENTER_EXCLUSION_X; // 60% of half-width = 30% total width
    const centerExclusionZoneY = viewportHeight * CENTER_EXCLUSION_Y; // 50% of half-height = 25% total height
    const centerRepulsion = CENTER_REPULSION;

    // If particle is within the center exclusion zone, push it out
    if (Math.abs(myX) < centerExclusionZoneX && Math.abs(myY) < centerExclusionZoneY) {
      // Calculate distance from center
      const distFromCenterX = Math.abs(myX);
      const distFromCenterY = Math.abs(myY);

      // Calculate normalized distance to edge of exclusion zone
      const normalizedDistX = distFromCenterX / centerExclusionZoneX;
      const normalizedDistY = distFromCenterY / centerExclusionZoneY;

      // Smoother repulsion curve using squared falloff
      const repulsionX = (1.0 - normalizedDistX) * (1.0 - normalizedDistX);
      const repulsionY = (1.0 - normalizedDistY) * (1.0 - normalizedDistY);

      // Apply forces in both directions for smoother flow
      accelX += Math.sign(myX || 1) * repulsionX * centerRepulsion;
      accelY += Math.sign(myY || 1) * repulsionY * centerRepulsion * 0.7; // Slightly less Y force for natural flow
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
    const posX = (state.positions[i3] ?? 0) + (state.velocities[i3] ?? 0) * clampedDelta;
    const posY = (state.positions[i3 + 1] ?? 0) + (state.velocities[i3 + 1] ?? 0) * clampedDelta;
    // const posZ = state.positions[i3 + 2] ?? 0;

    state.positions[i3] = posX;
    state.positions[i3 + 1] = posY;

    // Apply Z-axis parallax for depth effect
    state.positions[i3 + 2] = (state.baseZ[i] ?? 0) + (scrollFactors?.offset ?? 0) * 2.0;

    // Separate logical and render positions
    state.baseY[i] = posY - scrollOffsetY;  // scroll-independent position
    state.positions[i3 + 1] = (state.baseY[i] ?? 0) + scrollOffsetY;  // final render position

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
    const viewportPadding = 2.0; // Small padding to ensure smooth transitions
    const maxX = viewportWidth + viewportPadding;
    const maxY = viewportHeight + viewportPadding;

    // Check if particle is outside viewport bounds
    const renderX = state.positions[i3] ?? 0;
    const renderY = state.positions[i3 + 1] ?? 0;

    // For Y-axis, we need to consider that particles flow with scroll
    // When scrolling down (positive velocity), particles move up relatively to viewport
    // Respawn at top when they exit bottom, and vice versa
    let needsRespawn = false;
    let respawnEdge = 0;

    if (renderY > maxY) {
      // Particle exited bottom
      needsRespawn = true;
      respawnEdge = scroll.velocity >= 0 ? 0 : 2; // Bias respawn edge based on scroll direction
    } else if (renderY < -maxY) {
      // Particle exited top
      needsRespawn = true;
      respawnEdge = scroll.velocity <= 0 ? 2 : 0; // Bias respawn edge based on scroll direction
    } else if (renderX > maxX) {
      // Particle exited right
      needsRespawn = true;
      respawnEdge = 3; // Respawn at left
    } else if (renderX < -maxX) {
      // Particle exited left
      needsRespawn = true;
      respawnEdge = 1; // Respawn at right
    }

    if (needsRespawn) {
      respawnParticleAtEdge(i, state, viewport, screenWidth, respawnEdge, scrollOffsetY);
    } else {
      // Only count particles that are actually visible in the viewport
      const isVisible = renderX >= -maxX && renderX <= maxX && renderY >= -maxY && renderY <= maxY;
      if (isVisible) {
        visibleParticleCount++;
      }
    }

  }

  // Maintain particle density - if too many particles left the screen, respawn some
  const minVisibleRatio = 0.65; // At least 65% of particles should be visible
  const minVisibleCount = Math.floor(state.count * minVisibleRatio);

  // Failsafe: If NO particles are visible, respawn them all immediately
  if (visibleParticleCount === 0 && state.count > 0) {
    for (let i = 0; i < state.count; i++) {
      const edge = Math.floor(Math.random() * 4);
      respawnParticleAtEdge(i, state, viewport, screenWidth, edge, scrollOffsetY);
    }
    return; // Skip the rest of the logic
  }

  if (visibleParticleCount < minVisibleCount) {
    // Calculate how many particles to respawn
    const particlesToRespawn = minVisibleCount - visibleParticleCount;

    // Find particles that are far outside the viewport and respawn them
    let respawned = 0;
    for (let i = 0; i < state.count && respawned < particlesToRespawn; i++) {
      const i3 = i * 3;
      const renderX = state.positions[i3] ?? 0;
      const renderY = state.positions[i3 + 1] ?? 0;

      // Check if particle is far outside viewport (double the padding)
      const farPadding = viewportWidth * 2;
      if (Math.abs(renderX) > viewportWidth + farPadding ||
          Math.abs(renderY) > viewportHeight + farPadding) {
        // Respawn at a random edge, favoring top/bottom based on scroll
        let edge: number;
        if (Math.abs(scroll.velocity) > 0.1) {
          // Strong scrolling - mostly spawn at top/bottom
          edge = scroll.velocity > 0 ? 0 : 2;
          // 20% chance to spawn at sides for variety
          if (Math.random() < 0.2) {
            edge = Math.random() < 0.5 ? 1 : 3;
          }
        } else {
          // Slow or no scrolling - distribute more evenly
          const rand = Math.random();
          if (rand < 0.4) edge = 0; // Top
          else if (rand < 0.8) edge = 2; // Bottom
          else if (rand < 0.9) edge = 1; // Right
          else edge = 3; // Left
        }
        respawnParticleAtEdge(i, state, viewport, screenWidth, edge, scrollOffsetY);
        respawned++;
      }
    }
  }
}