/**
 * Central configuration for video settings
 */

export const VIDEO_CONFIG = {
  // Default dimensions
  dimensions: {
    HD: { width: 1920, height: 1080 },
    FHD: { width: 1920, height: 1080 },
    UHD: { width: 3840, height: 2160 },
    SQUARE: { width: 1080, height: 1080 },
    VERTICAL: { width: 1080, height: 1920 },
    WIDE: { width: 2560, height: 1440 },
  },
  
  // Frame rates
  fps: {
    STANDARD: 30,
    HIGH: 60,
    CINEMATIC: 24,
  },
  
  // Durations (in seconds)
  durations: {
    INTRO: 3,
    OUTRO: 3,
    TRANSITION: 0.5,
    DEFAULT_TITLE: 5,
  },
  
  // Animation timings
  animations: {
    FADE_IN: 0.5,
    FADE_OUT: 0.5,
    SLIDE_IN: 0.3,
    SLIDE_OUT: 0.3,
  },
  
  // Colors
  colors: {
    background: '#000000',
    overlay: 'rgba(0, 0, 0, 0.7)',
    text: '#FFFFFF',
    accent: '#3B82F6',
  },
  
  // Typography
  typography: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: {
      small: 24,
      medium: 32,
      large: 48,
      xlarge: 64,
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
  },
  
  // Speed presets
  speed: {
    SLOW: 0.5,
    NORMAL: 1,
    FAST: 2,
    VERY_FAST: 5,
    ULTRA_FAST: 10,
  },
} as const;

// Type exports
export type VideoDimension = keyof typeof VIDEO_CONFIG.dimensions;
export type VideoFPS = keyof typeof VIDEO_CONFIG.fps;
export type SpeedPreset = keyof typeof VIDEO_CONFIG.speed;