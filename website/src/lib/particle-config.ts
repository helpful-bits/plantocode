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
  DRAG_COEFFICIENT: 0.88, // More drag for fluid-like movement
  SEEK_MAX_FORCE: 0.5, // Reduced for smoother movement
  SEPARATION_RADIUS: 30.0, // Reduced for tighter personal space
  SEPARATION_FORCE: 0.6,   // Gentler separation
  ALIGNMENT_FORCE: 0.3,
  ARRIVE_RADIUS: 100.0,
  SCROLL_IMPULSE_STRENGTH: 12.0 // Increased for more responsive scrolling
};

export const ForceWeights = {
  seek: 0.6,       // Reduced - gentler following
  alignment: 0.3,   // Reduced - less rigid alignment
  separation: 1.0,  // Reduced - softer personal space
  centerRepulsion: 1.5, // Much reduced - gentle push
  cohesion: 0.2     // Reduced - looser flocking
};

export const NoFlyZone = {
  width: 0.3,
  height: 0.3
};

export const SafeZone = { width: 0.7, height: 0.7 }; // Large center repulsion zone