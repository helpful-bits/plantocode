export const Breakpoints = {
  desktop: 1024,
  tablet: 600
};

export const AgentCounts = {
  desktop: { leaders: 5, followers: 350 },
  tablet: { leaders: 3, followers: 240 },
  mobile: { leaders: 2, followers: 160 }
};

export const PhysicsConstants = {
  MAX_SPEED: 80.0,
  DRAG_COEFFICIENT: 0.95,
  SEEK_MAX_FORCE: 0.8,
  SEPARATION_RADIUS: 50.0,
  SEPARATION_FORCE: 0.8,
  ALIGNMENT_FORCE: 0.3,
  ARRIVE_RADIUS: 100.0,
  PATROL_SPEED: 40.0,
  SCROLL_IMPULSE_STRENGTH: 10.0
};

export const ForceWeights = {
  seek: 0.6,  // Reduced from 1.0
  alignment: 0.3,  // Reduced from 0.5
  separation: 1.2,  // Reduced from 1.5
  edgeAttraction: 1.2,  // Increased to keep particles near edges
  centerRepulsion: 3.5
};

export const NoFlyZone = {
  width: 0.3,
  height: 0.3
};

export const SafeZone = { width: 0.55, height: 0.45 };