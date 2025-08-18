// OKLCH Color System - Aligned with website/src/app/globals.css
export const colors = {
  // Core OKLCH Palette - Perceptually uniform
  tealLight: 'oklch(48% 0.15 195)',    // Rich, saturated teal base
  tealMedium: 'oklch(58% 0.12 195)',   // Mid-range teal
  tealBright: 'oklch(68% 0.08 195)',   // Bright teal for highlights
  navyDark: 'oklch(18% 0.02 206)',     // Deep navy foundation
  navyMedium: 'oklch(25% 0.03 206)',   // Medium navy
  
  // Surface colors
  surface: 'oklch(99.5% 0.008 195)',   // White with subtle teal tint
  surfaceDark: 'oklch(18% 0.035 206)', // Dark mode surface
  
  // Glass effect colors
  glassBackground: 'oklch(99.5% 0.008 195 / 0.7)',
  glassBorder: 'oklch(90% 0.04 195 / 0.5)',
  glassBackgroundDark: 'oklch(20% 0.022 206 / 0.8)',
  glassBorderDark: 'oklch(68% 0.085 195 / 0.34)',
  
  // Status colors
  info: 'oklch(62% 0.13 218)',         // Bright blue
  success: 'oklch(62% 0.16 148)',      // Bright emerald
  warning: 'oklch(72% 0.16 68)',       // Bright amber
  destructive: 'oklch(53% 0.24 25)',   // Bright red
};

export const brand = {
  accentColor: colors.tealLight,
  primaryColor: colors.tealLight,
  secondaryColor: colors.tealMedium,
  safeArea: 48,
  caption: {
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    fontSize: 34,
    fontWeight: 600,
    background: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    padding: { x: 14, y: 10 },
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.1)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
  },
  callouts: {
    radius: 14,
    bg: 'rgba(108,92,231,0.16)',
    border: '1px solid rgba(108,92,231,0.35)'
  },
  watermark: {
    text: 'Vibe Manager',
    opacity: 0.08,
    position: 'bottom-right' as const,
    color: colors.tealLight
  },
  cursorHighlight: {
    radius: 18,
    opacity: 0.22,
    color: colors.tealBright
  },
  // Gradient properties matching website
  gradients: {
    primary: `linear-gradient(135deg, ${colors.tealLight} 0%, ${colors.tealMedium} 50%, ${colors.tealBright} 100%)`,
    smooth: `linear-gradient(135deg, ${colors.tealLight} 0%, ${colors.tealMedium} 50%, ${colors.tealBright} 100%)`,
    dark: `linear-gradient(135deg, ${colors.navyDark} 0%, ${colors.navyMedium} 50%, oklch(16% 0.045 185) 100%)`
  }
};