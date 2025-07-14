import { Inter, JetBrains_Mono } from "next/font/google";

/**
 * Typography system with Next.js 15 optimization
 * Uses variable fonts with preload strategies for optimal performance
 */

// Inter variable font with full weight range and optimal settings
export const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap", // Immediate text visibility
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  style: ["normal", "italic"],
  preload: true,
  fallback: [
    // Metric-matched fallbacks for optimal CLS
    "-apple-system",
    "BlinkMacSystemFont",
    "Segoe UI",
    "Roboto",
    "Oxygen",
    "Ubuntu", 
    "Cantarell",
    "Fira Sans",
    "Droid Sans",
    "Helvetica Neue",
    "sans-serif"
  ],
  adjustFontFallback: true, // Automatic metric matching
});

// JetBrains Mono for code with variable font optimization
export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-jetbrains-mono",
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
  preload: false, // Lazy load since less frequently used
  fallback: [
    // Monospace fallbacks with similar metrics
    "ui-monospace",
    "SFMono-Regular",
    "SF Mono",
    "Consolas",
    "Liberation Mono",
    "Menlo",
    "Monaco",
    "monospace"
  ],
  adjustFontFallback: true,
});

/**
 * Font configuration for optimal loading
 */
export const fontConfig = {
  // Critical fonts loaded immediately
  critical: [inter],
  
  // Non-critical fonts loaded on demand
  deferred: [jetbrainsMono],
  
  // Font feature settings
  features: {
    // Ligatures and contextual alternates
    liga: true,
    calt: true,
    
    // Kerning for better spacing
    kern: true,
    
    // Tabular numbers for data
    tnum: true,
    
    // Optical sizing for variable fonts
    opsz: true,
  },
  
  // Performance settings
  performance: {
    // Preload critical fonts
    preload: true,
    
    // Use font-display: swap for immediate text visibility
    fontDisplay: "swap",
    
    // Enable font subsetting
    subset: true,
    
    // Enable metric matching for fallbacks
    adjustFallback: true,
  },
} as const;

/**
 * CSS class names for consistent font application
 */
export const fontClasses = {
  // Primary text font
  sans: inter.className,
  
  // Monospace font for code
  mono: jetbrainsMono.className,
  
  // Variable font classes
  sansVariable: inter.variable,
  monoVariable: jetbrainsMono.variable,
  
  // Combined variable classes
  variables: `${inter.variable} ${jetbrainsMono.variable}`,
} as const;

/**
 * Typography scale with mathematical progression
 * Based on perfect fourth (1.333) ratio for harmonious scaling
 */
export const typographyScale = {
  // Display sizes
  "display-2xl": "clamp(4rem, 8vw, 6rem)",     // 64px-96px
  "display-xl": "clamp(3rem, 6vw, 4.5rem)",    // 48px-72px
  "display-lg": "clamp(2.5rem, 5vw, 3.75rem)", // 40px-60px
  "display-md": "clamp(2rem, 4vw, 3rem)",      // 32px-48px
  "display-sm": "clamp(1.75rem, 3.5vw, 2.25rem)", // 28px-36px
  
  // Heading sizes
  "heading-xl": "clamp(1.5rem, 3vw, 2rem)",    // 24px-32px
  "heading-lg": "clamp(1.25rem, 2.5vw, 1.75rem)", // 20px-28px
  "heading-md": "clamp(1.125rem, 2vw, 1.5rem)", // 18px-24px
  "heading-sm": "clamp(1rem, 1.5vw, 1.25rem)", // 16px-20px
  
  // Body sizes
  "body-xl": "1.25rem",   // 20px
  "body-lg": "1.125rem",  // 18px
  "body-md": "1rem",      // 16px
  "body-sm": "0.875rem",  // 14px
  "body-xs": "0.75rem",   // 12px
  
  // Caption sizes
  "caption-lg": "0.875rem", // 14px
  "caption-md": "0.75rem",  // 12px
  "caption-sm": "0.6875rem", // 11px
} as const;

/**
 * Line height scale optimized for readability
 */
export const lineHeightScale = {
  // Tight for large display text
  tight: "1.1",
  
  // Snug for headings
  snug: "1.2",
  
  // Normal for body text
  normal: "1.5",
  
  // Relaxed for large body text
  relaxed: "1.6",
  
  // Loose for captions and small text
  loose: "1.7",
} as const;

/**
 * Font weight scale with semantic naming
 */
export const fontWeightScale = {
  light: "300",
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
  extrabold: "800",
  black: "900",
} as const;

/**
 * Letter spacing scale for different text sizes
 */
export const letterSpacingScale = {
  tight: "-0.02em",
  snug: "-0.01em",
  normal: "0em",
  wide: "0.01em",
  wider: "0.02em",
  widest: "0.05em",
} as const;