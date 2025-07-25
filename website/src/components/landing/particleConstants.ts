// Particle sizes
export const NORMAL_SIZE = 0.45;
export const RUNNER_SIZE = 0.15;
export const MIN_PARTICLE_SIZE = 0.4;
export const MAX_PARTICLE_SIZE = 1.5;
export const SIZE_BURST_THRESHOLD = 1.3;
export const SIZE_GROWTH_AMOUNT = 0.05;
export const PREY_SIZE_RATIO = 0.7;
export const CATCH_SIZE_RATIO = 0.9;

// Physics forces
export const CHASE_STRENGTH = 0.05;  // Increased for more visible interactions
export const ESCAPE_STRENGTH = 0.04;  // Increased for more dynamic escapes
export const NEUTRAL_SPEED = 0.003;  // Slower wandering
export const SEARCH_PATTERN_SPEED = 0.003;
export const CASUAL_MOVEMENT_SPEED = 0.002;  // Gentle movement
export const MOBILE_EDGE_ATTRACTION = 0.05;  // Very gentle force to keep particles at edges on mobile
export const DESKTOP_EDGE_ATTRACTION = 0.4;  // Very strong edge attraction for desktop
export const MOBILE_CORNER_PREFERENCE = 0.1;  // Stronger corner clustering on mobile
export const SPRINT_BOOST_THRESHOLD = 1.2;
export const SPRINT_BOOST_STRENGTH = 0.02;  // Reduced sprint speed
export const EMERGENCY_ESCAPE_THRESHOLD = 1.0;
export const EMERGENCY_ESCAPE_STRENGTH = 0.015;  // Less panic
export const MOUSE_INFLUENCE_RADIUS = 1.5;
export const MOUSE_INFLUENCE_STRENGTH = 0.01;

// Center exclusion
export const CENTER_EXCLUSION_X = 1.4;  // 140% of half-width = 70% total width
export const CENTER_EXCLUSION_Y = 1.3;  // 130% of half-height = 65% total height
export const CENTER_ZONE_X = 0.7;
export const CENTER_ZONE_Y = 0.65;
export const CENTER_REPULSION = 0.2;  // Strong center repulsion for desktop
export const MOBILE_CENTER_REPULSION = 0.15;  // Keep mobile as is

// Damping and physics
export const VELOCITY_DAMPING = 0.96;  // More damping for smoother, slower motion
export const REDUCED_MOTION_DAMPING = 0.9;
export const COLLISION_DAMPING = 0.7;
export const RESIZE_BURST_STRENGTH = 0.1;
export const RESIZE_VELOCITY_SCALE = 0.05;

// Spatial hash
export const CELL_SIZE = 2.0;

// Scroll effects
export const SCROLL_PARALLAX_Z = 50;
export const SCROLL_DEPTH_EFFECT = 0.3;
export const SCROLL_Y_MULTIPLIER = 2;
export const SCROLL_INFLUENCE_DIVISOR = 0.5;
export const SCROLL_MOMENTUM_MULTIPLIER = 0.5;
export const VORTEX_STRENGTH_MULTIPLIER = 0.2;
export const VORTEX_RADIUS_MULTIPLIER = 1.5;
export const WAVE_SPEED_MULTIPLIER = 1.0;
export const WAVE_AMPLITUDE_MULTIPLIER = 0.1;
export const WAVE_DISTANCE_SCALE = 0.1;
export const TURBULENCE_BASE = 0.08;  // Reduced for gentler random motion
export const TURBULENCE_VELOCITY_SCALE = 0.02;  // Less velocity-based turbulence
export const SCROLL_VELOCITY_DAMPING = 0.3;

// Particle separation
export const SEPARATION_DISTANCE = 0.8;  // Increased for better visibility
export const SEPARATION_STRENGTH = 0.1;  // Stronger separation for clearer interactions

// Detection ranges
export const CHASER_DETECTION_RANGE = 4.0;
export const RUNNER_DETECTION_RANGE = 3.5;
export const NEUTRAL_AVOIDANCE_RANGE = 4.0;
export const CATCH_DISTANCE = 0.2;

// Role distribution
export const CHASER_RATIO = 0.15;  // Reduced to 15% - fewer hunters
export const RUNNER_RATIO = 0.35;  // 35% runners
// Neutral will be 50% (the remainder) - more peaceful wanderers

// Edge spawning
export const EDGE_OFFSET_MAX = 1.5;
export const EDGE_OFFSET_SMALL_SCREEN = 2.0;
export const EDGE_OFFSET_MEDIUM_SCREEN = 1.5;
export const SMALL_SCREEN_WIDTH = 768;
export const MEDIUM_SCREEN_WIDTH = 1024;
export const WIDTH_USAGE_RATIO = 0.9;
export const HEIGHT_USAGE_RATIO = 0.95;
export const WIDE_SCREEN_RATIO = 1.2;
export const WIDE_SCREEN_EDGE_CHANCE = 0.8;

// Animation
export const TIME_SCALE = 0.3;
export const BREATHING_FREQUENCY = 1.5;
export const BREATHING_AMPLITUDE = 0.03;
export const BURST_FREQUENCY = 8.0;
export const BURST_AMPLITUDE = 0.1;
export const BURST_EFFECT_THRESHOLD = 0.7;
export const PI = 3.14;
export const TWO_PI = 6.28;

// Boundary
export const BOUNDARY_PADDING = 2.5;
export const BOUNDARY_REPULSION_STRENGTH = 0.08;  // Reduced for smoother boundary interaction

// Simulation
export const DELTA_CLAMP = 1.0;
export const SIMULATION_SPEED = 0.1;  // Reduced by 50% for calmer motion

// Game mechanics
export const PURSUIT_INTENSITY_RANGE = 4.0;
export const PURSUIT_INTENSITY_BOOST = 0.2;
export const PANIC_LEVEL_RANGE = 3.5;
export const PANIC_LEVEL_BOOST = 0.2;
export const CAUTION_LEVEL_MULTIPLIER = 0.5;
export const WANDER_INTENSITY_REDUCTION = 0.7;
export const HUNTING_INTENSITY_VARIATION = 0.3;
export const HUNTING_INTENSITY_FREQUENCY = 0.8;

// Movement patterns
export const SEARCH_ANGLE_SPEED = 0.2;
export const CASUAL_MOVEMENT_X_SPEED = 0.08;
export const CASUAL_MOVEMENT_Y_SPEED = 0.05;
export const NEUTRAL_WANDER_X_SPEED = 0.05;
export const NEUTRAL_WANDER_Y_SPEED = 0.04;