# Vibe Manager Design System

## Overview

The Vibe Manager design system is built on modern web standards, utilizing OKLCH color space for perceptually uniform colors, glass morphism for depth and hierarchy, and high-performance animations for smooth user interactions.

## Color System

### OKLCH Color Space

OKLCH (Oklab Lightness Chroma Hue) provides perceptually uniform color manipulation, ensuring consistent visual perception across different hues and lightness levels.

#### Why OKLCH?

- **Perceptual Uniformity**: Equal numeric changes result in equal perceptual changes
- **Better Gradients**: Smooth, natural color transitions without muddy middle values
- **Predictable Lightness**: Consistent brightness across different hues
- **Wide Gamut Support**: Native support for P3 and future display technologies
- **Performance Benefits**: Hardware-accelerated color calculations in modern browsers
- **Future-Proof**: Designed for next-generation display technologies

#### OKLCH Performance Considerations

- Use CSS custom properties for color values to enable runtime theming
- Prefer OKLCH over HSL/RGB for color manipulations to avoid color space conversions
- Cache computed color values when generating dynamic palettes
- Use `@supports` queries for graceful degradation in older browsers

#### Color Palette

```css
:root {
  /* Primary Colors */
  --color-primary: oklch(60% 0.2 265);        /* Primary brand color */
  --color-primary-light: oklch(70% 0.15 265); /* Light variant */
  --color-primary-dark: oklch(45% 0.25 265);  /* Dark variant */
  
  /* Secondary Colors */
  --color-secondary: oklch(65% 0.18 150);
  --color-secondary-light: oklch(75% 0.12 150);
  --color-secondary-dark: oklch(50% 0.22 150);
  
  /* Semantic Colors */
  --color-success: oklch(70% 0.2 145);
  --color-warning: oklch(75% 0.25 85);
  --color-error: oklch(65% 0.25 25);
  --color-info: oklch(68% 0.15 230);
  
  /* Neutral Colors */
  --color-neutral-100: oklch(98% 0 0);
  --color-neutral-200: oklch(95% 0 0);
  --color-neutral-300: oklch(90% 0 0);
  --color-neutral-400: oklch(80% 0 0);
  --color-neutral-500: oklch(60% 0 0);
  --color-neutral-600: oklch(40% 0 0);
  --color-neutral-700: oklch(25% 0 0);
  --color-neutral-800: oklch(15% 0 0);
  --color-neutral-900: oklch(10% 0 0);
}
```

#### Dynamic Color Generation

```typescript
// Generate color variations
function generateColorScale(baseColor: string, steps: number = 9) {
  const [l, c, h] = parseOKLCH(baseColor);
  const scale = [];
  
  for (let i = 0; i < steps; i++) {
    const lightness = 95 - (i * 10); // 95% to 15%
    const chroma = c * (0.5 + (i * 0.1)); // Increase saturation for darker colors
    scale.push(`oklch(${lightness}% ${chroma} ${h})`);
  }
  
  return scale;
}

// Complementary color generation
function getComplementary(color: string) {
  const [l, c, h] = parseOKLCH(color);
  return `oklch(${l}% ${c} ${(h + 180) % 360})`;
}
```

## Glass Morphism

### Core Principles

Glass morphism creates depth and hierarchy through translucent surfaces with backdrop blur effects.

### GlassCard Component Optimization

The GlassCard component is optimized for performance while maintaining visual fidelity:

```typescript
// GlassCard Performance Optimizations
export const GlassCard = React.memo(({ children, className, ...props }) => {
  return (
    <div 
      className={cn(
        'glass-card',
        'will-change-[backdrop-filter]', // Hint for browser optimization
        'contain-layout', // Contain layout calculations
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});
```

#### Performance Best Practices for Glass Effects

1. **Limit Nesting**: Avoid nesting glass elements more than 2 levels deep
2. **Use `will-change` Sparingly**: Only on elements that will animate
3. **Implement Intersection Observer**: Disable backdrop-filter for off-screen elements
4. **Provide Fallbacks**: Solid backgrounds for browsers without backdrop-filter support
5. **Test on Mobile**: Glass effects are GPU-intensive on mobile devices

#### Base Glass Styles

```css
.glass {
  /* Background with transparency */
  background: oklch(95% 0 0 / 0.7);
  
  /* Backdrop filter for blur effect */
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  
  /* Border for definition */
  border: 1px solid oklch(100% 0 0 / 0.2);
  
  /* Subtle shadow for depth */
  box-shadow: 
    0 4px 6px oklch(0% 0 0 / 0.1),
    inset 0 1px 0 oklch(100% 0 0 / 0.3);
}

/* Dark mode glass */
@media (prefers-color-scheme: dark) {
  .glass {
    background: oklch(15% 0 0 / 0.7);
    border: 1px solid oklch(100% 0 0 / 0.1);
  }
}
```

#### Glass Variants

```css
/* Primary glass - for main containers */
.glass-primary {
  background: oklch(60% 0.2 265 / 0.1);
  backdrop-filter: blur(20px) saturate(1.5);
  border: 1px solid oklch(60% 0.2 265 / 0.2);
}

/* Frosted glass - maximum blur */
.glass-frosted {
  background: oklch(98% 0 0 / 0.8);
  backdrop-filter: blur(40px);
  border: 1px solid oklch(100% 0 0 / 0.3);
}

/* Subtle glass - minimal effect */
.glass-subtle {
  background: oklch(95% 0 0 / 0.5);
  backdrop-filter: blur(5px);
  border: 1px solid oklch(100% 0 0 / 0.1);
}
```

### Implementation Guidelines

1. **Performance Considerations**
   - Use `will-change: backdrop-filter` for animated glass elements
   - Limit the number of glass layers to maintain 60fps
   - Consider using `contain: layout style paint` for glass containers

2. **Fallbacks**
   ```css
   @supports not (backdrop-filter: blur(10px)) {
     .glass {
       background: oklch(95% 0 0 / 0.95);
       box-shadow: 0 4px 6px oklch(0% 0 0 / 0.15);
     }
   }
   ```

3. **Accessibility**
   - Ensure sufficient contrast ratios (WCAG AA minimum)
   - Test with reduced transparency preference
   - Provide solid alternatives for critical UI elements

## Typography

### Font Stack

```css
:root {
  --font-sans: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 
               Roboto, 'Helvetica Neue', Arial, sans-serif;
  --font-mono: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', 
               Consolas, 'Courier New', monospace;
}
```

### Variable Fonts for Performance

When using custom fonts, prefer variable fonts for reduced file size and better performance:

```css
@font-face {
  font-family: 'Inter var';
  font-weight: 100 900;
  font-display: swap; /* Prevent FOIT */
  font-style: normal;
  font-named-instance: 'Regular';
  src: url('/fonts/Inter.var.woff2') format('woff2-variations');
}

/* Fallback for non-variable font support */
@supports not (font-variation-settings: normal) {
  @font-face {
    font-family: 'Inter';
    font-weight: 400;
    font-display: swap;
    src: url('/fonts/Inter-Regular.woff2') format('woff2');
  }
}
```

### Type Scale

Using a modular scale with a ratio of 1.25 (Major Third) with fluid typography:

```css
:root {
  --text-xs: clamp(0.75rem, 0.7rem + 0.25vw, 0.875rem);
  --text-sm: clamp(0.875rem, 0.8rem + 0.375vw, 1rem);
  --text-base: clamp(1rem, 0.9rem + 0.5vw, 1.125rem);
  --text-lg: clamp(1.125rem, 1rem + 0.625vw, 1.25rem);
  --text-xl: clamp(1.25rem, 1.1rem + 0.75vw, 1.5rem);
  --text-2xl: clamp(1.5rem, 1.3rem + 1vw, 1.875rem);
  --text-3xl: clamp(1.875rem, 1.6rem + 1.375vw, 2.25rem);
  --text-4xl: clamp(2.25rem, 1.9rem + 1.75vw, 3rem);
}
```

## Spacing System

Based on 8px grid system:

```css
:root {
  --space-1: 0.25rem;  /* 4px */
  --space-2: 0.5rem;   /* 8px */
  --space-3: 0.75rem;  /* 12px */
  --space-4: 1rem;     /* 16px */
  --space-5: 1.5rem;   /* 24px */
  --space-6: 2rem;     /* 32px */
  --space-8: 3rem;     /* 48px */
  --space-10: 4rem;    /* 64px */
  --space-12: 6rem;    /* 96px */
  --space-16: 8rem;    /* 128px */
}
```

## Animation Guidelines

### Core Principles

1. **60fps Performance**: All animations must maintain 60fps
2. **Natural Motion**: Use easing functions that feel organic
3. **Purposeful**: Every animation should have a clear purpose
4. **Accessible**: Respect `prefers-reduced-motion` preference

### Animation Tokens

```css
:root {
  /* Durations */
  --duration-instant: 100ms;
  --duration-fast: 200ms;
  --duration-normal: 300ms;
  --duration-slow: 500ms;
  --duration-glacial: 1000ms;
  
  /* Easings */
  --ease-out: cubic-bezier(0.0, 0.0, 0.2, 1.0);
  --ease-in-out: cubic-bezier(0.4, 0.0, 0.2, 1.0);
  --ease-elastic: cubic-bezier(0.68, -0.55, 0.265, 1.55);
  
  /* Spring animations */
  --spring-bounce: cubic-bezier(0.68, -0.6, 0.32, 1.6);
  --spring-smooth: cubic-bezier(0.4, 0.0, 0.2, 1.0);
}
```

### Performance-Optimized Animation Patterns

#### Transform-Only Animations
Always prefer transform and opacity for animations as they can be handled by the compositor:

```css
/* Good - Compositor-only properties */
.slide-in {
  transform: translateX(-100%);
  opacity: 0;
  transition: transform 300ms ease-out, opacity 300ms ease-out;
}

.slide-in.active {
  transform: translateX(0);
  opacity: 1;
}

/* Avoid - Triggers layout recalculation */
.bad-slide {
  left: -100%;
  transition: left 300ms ease-out;
}
```

### Common Patterns

```css
/* Fade in */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Scale bounce */
@keyframes scaleBounce {
  0% {
    transform: scale(0.9);
  }
  50% {
    transform: scale(1.05);
  }
  100% {
    transform: scale(1);
  }
}

/* Shimmer loading */
@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

.shimmer {
  background: linear-gradient(
    90deg,
    oklch(90% 0 0 / 0) 0%,
    oklch(95% 0 0 / 0.5) 50%,
    oklch(90% 0 0 / 0) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}
```

### Performance Optimization

```css
/* Use transform and opacity for best performance */
.animate-slide {
  transform: translateX(var(--slide-distance, 100%));
  opacity: 0;
  transition: 
    transform var(--duration-normal) var(--ease-out),
    opacity var(--duration-fast) var(--ease-out);
  will-change: transform, opacity;
}

.animate-slide.active {
  transform: translateX(0);
  opacity: 1;
}

/* GPU acceleration hint */
.gpu-accelerated {
  transform: translateZ(0);
  will-change: transform;
}
```

## Component Patterns

### Card Component

```css
.card {
  /* Glass morphism base */
  background: oklch(98% 0 0 / 0.7);
  backdrop-filter: blur(10px);
  border: 1px solid oklch(100% 0 0 / 0.2);
  border-radius: 16px;
  
  /* Spacing */
  padding: var(--space-6);
  
  /* Shadow for depth */
  box-shadow: 
    0 4px 6px -1px oklch(0% 0 0 / 0.1),
    0 2px 4px -1px oklch(0% 0 0 / 0.06);
  
  /* Animation */
  transition: 
    transform var(--duration-fast) var(--ease-out),
    box-shadow var(--duration-fast) var(--ease-out);
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: 
    0 10px 15px -3px oklch(0% 0 0 / 0.1),
    0 4px 6px -2px oklch(0% 0 0 / 0.05);
}
```

### Button Component

```css
.button {
  /* Base styles */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  
  /* Padding */
  padding: var(--space-3) var(--space-5);
  
  /* Typography */
  font-size: var(--text-base);
  font-weight: 500;
  line-height: 1;
  
  /* Glass effect */
  background: oklch(60% 0.2 265 / 0.1);
  backdrop-filter: blur(10px);
  border: 1px solid oklch(60% 0.2 265 / 0.2);
  border-radius: 8px;
  
  /* Interaction */
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
  transform: translateZ(0);
}

.button:hover {
  background: oklch(60% 0.2 265 / 0.2);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px oklch(60% 0.2 265 / 0.3);
}

.button:active {
  transform: translateY(0);
  transition-duration: var(--duration-instant);
}
```

## Accessibility

### Color Contrast

All text must meet WCAG AA standards:
- Normal text: 4.5:1 contrast ratio
- Large text (18px+): 3:1 contrast ratio

```css
/* Ensure sufficient contrast */
.text-on-glass {
  color: oklch(20% 0 0);
  text-shadow: 0 1px 2px oklch(100% 0 0 / 0.5);
}

@media (prefers-color-scheme: dark) {
  .text-on-glass {
    color: oklch(95% 0 0);
    text-shadow: 0 1px 2px oklch(0% 0 0 / 0.5);
  }
}
```

### Motion Preferences

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Focus Indicators

```css
/* Visible focus states */
:focus-visible {
  outline: 2px solid oklch(60% 0.2 265);
  outline-offset: 2px;
}

/* High contrast mode support */
@media (prefers-contrast: high) {
  :focus-visible {
    outline-width: 3px;
  }
}
```

## Browser Compatibility

### Required Browser Versions

- Chrome/Edge: 88+
- Firefox: 89+
- Safari: 15.4+
- iOS Safari: 15.4+

### Feature Detection

```javascript
// Check for OKLCH support
const supportsOKLCH = CSS.supports('color', 'oklch(50% 0.2 150)');

// Check for backdrop-filter support
const supportsBackdropFilter = CSS.supports('backdrop-filter', 'blur(10px)');

// Apply fallbacks
if (!supportsOKLCH) {
  document.documentElement.classList.add('no-oklch');
}

if (!supportsBackdropFilter) {
  document.documentElement.classList.add('no-backdrop-filter');
}
```

### Progressive Enhancement

```css
/* Base styles (works everywhere) */
.element {
  background-color: hsl(265, 60%, 60%);
}

/* Enhanced styles (modern browsers) */
@supports (color: oklch(50% 0.2 150)) {
  .element {
    background-color: oklch(60% 0.2 265);
  }
}

/* Glass morphism with fallback */
.glass-element {
  background: rgba(255, 255, 255, 0.9);
}

@supports (backdrop-filter: blur(10px)) {
  .glass-element {
    background: oklch(98% 0 0 / 0.7);
    backdrop-filter: blur(10px);
  }
}
```

## Performance Monitoring

### Design System Performance Metrics

Track these metrics to ensure the design system maintains high performance:

1. **Paint Metrics**
   - First Contentful Paint (FCP) < 1.8s
   - Largest Contentful Paint (LCP) < 2.5s
   - Cumulative Layout Shift (CLS) < 0.1

2. **Animation Performance**
   - All animations maintain 60fps
   - No animation causes layout thrashing
   - Glass effects don't drop frames on mid-range devices

3. **Color System Performance**
   - OKLCH calculations cached where possible
   - Dynamic theme switching < 100ms
   - No flash of unstyled content (FOUC)

### Performance Testing Checklist

- [ ] Test all glass effects on mobile devices
- [ ] Verify animations maintain 60fps in Chrome DevTools
- [ ] Check color contrast ratios in both light and dark modes
- [ ] Validate font loading doesn't block rendering
- [ ] Ensure responsive typography scales smoothly
- [ ] Test with CPU throttling enabled (4x slowdown)
- [ ] Verify no memory leaks from animation loops

## Design Tokens Export

```typescript
// design-tokens.ts
export const colors = {
  primary: 'oklch(60% 0.2 265)',
  secondary: 'oklch(65% 0.18 150)',
  // ... rest of colors
};

export const spacing = {
  1: '0.25rem',
  2: '0.5rem',
  // ... rest of spacing
};

export const animation = {
  duration: {
    instant: '100ms',
    fast: '200ms',
    normal: '300ms',
    slow: '500ms',
  },
  easing: {
    out: 'cubic-bezier(0.0, 0.0, 0.2, 1.0)',
    inOut: 'cubic-bezier(0.4, 0.0, 0.2, 1.0)',
    elastic: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  },
};

// Performance hints
export const performanceConfig = {
  maxGlassLayers: 2,
  animationBudget: 16.67, // ms per frame for 60fps
  colorCacheSize: 100,
  lazyLoadThreshold: '50px',
};
```