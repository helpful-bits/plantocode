# Advanced Animation System

A comprehensive animation system built with React 19 concurrent features, providing smooth 60fps scroll animations with GPU acceleration and performance optimizations.

## Features

- **React 19 Concurrent Features**: Uses `useDeferredValue` for smooth animations
- **60fps Performance**: Optimized with `requestAnimationFrame` and GPU acceleration
- **Intersection Observer**: Lazy loading and viewport-based animations
- **Reduced Motion Support**: Respects `prefers-reduced-motion` accessibility setting
- **Memory Management**: Proper cleanup and performance monitoring
- **Adaptive Quality**: Automatically adjusts animation complexity based on device performance

## Components

### ParallaxWrapper
Basic parallax scrolling component with performance optimizations.

```tsx
import { ParallaxWrapper } from '@/components/animations';

<ParallaxWrapper speed={-0.5} className="my-section">
  <h1>Parallax Content</h1>
</ParallaxWrapper>
```

### ParallaxLayer
Multi-layer parallax with depth control.

```tsx
import { ParallaxLayer, ParallaxContainer } from '@/components/animations';

<ParallaxContainer height="100vh">
  <ParallaxLayer speed={-0.5} depth={-1}>
    <div className="background-layer" />
  </ParallaxLayer>
  <ParallaxLayer speed={-0.3} depth={0}>
    <h1>Foreground Content</h1>
  </ParallaxLayer>
</ParallaxContainer>
```

### ScrollFade
Scroll-triggered fade animations with directional movement.

```tsx
import { ScrollFade } from '@/components/animations';

<ScrollFade direction="up" distance={30} delay={0.2}>
  <div>Content that fades in from bottom</div>
</ScrollFade>
```

### ScrollScale
Scale animations triggered by scroll position.

```tsx
import { ScrollScale } from '@/components/animations';

<ScrollScale startScale={0.8} endScale={1.2}>
  <div>Content that scales on scroll</div>
</ScrollScale>
```

### StickyParallax
Sticky positioning combined with parallax effects.

```tsx
import { StickyParallax } from '@/components/animations';

<StickyParallax height="200vh" speed={0.3}>
  <div className="sticky-content">
    Sticky content with parallax
  </div>
</StickyParallax>
```

## Hooks

### useScrollAnimation
Core hook for scroll-based animations with React 19 concurrent features.

```tsx
import { useScrollAnimation } from '@/hooks/useScrollAnimation';

function MyComponent() {
  const { ref, isVisible, progress, getTransform, getOpacity } = useScrollAnimation();

  return (
    <div 
      ref={ref}
      style={{
        transform: getTransform(0, 0, 1.1, 5), // y, x, scale, rotate
        opacity: getOpacity(0.3, 1), // start, end
      }}
    >
      Content
    </div>
  );
}
```

### useParallaxScroll
Optimized parallax scrolling hook.

```tsx
import { useParallaxScroll } from '@/hooks/useScrollAnimation';

function ParallaxComponent() {
  const { ref, transform, isVisible } = useParallaxScroll(0.5);

  return (
    <div ref={ref} style={{ transform }}>
      Parallax content
    </div>
  );
}
```

### useStaggeredAnimation
Create staggered animations for lists and grids.

```tsx
import { useStaggeredAnimation } from '@/hooks/useScrollAnimation';

function StaggeredList() {
  const { ref, getItemStyle } = useStaggeredAnimation(5, 150);

  return (
    <div ref={ref}>
      {items.map((item, index) => (
        <div key={item.id} style={getItemStyle(index)}>
          {item.content}
        </div>
      ))}
    </div>
  );
}
```

### useAnimationPerformance
Monitor animation performance and get optimization suggestions.

```tsx
import { useAnimationPerformance } from '@/hooks/useAnimationPerformance';

function MyApp() {
  const { metrics, optimizationSuggestions, adaptiveSettings } = useAnimationPerformance();

  // Use metrics to adapt animation quality
  const particleCount = adaptiveSettings.recommendedParticleCount;
  const enableParallax = !adaptiveSettings.shouldDisableParallax;

  return (
    <div>
      {/* Your app content */}
      {process.env.NODE_ENV === 'development' && (
        <PerformanceMonitor />
      )}
    </div>
  );
}
```

## Performance Optimizations

### GPU Acceleration
- Uses `transform3d` for hardware acceleration
- Applies `will-change: transform` appropriately
- Forces GPU layers with `translateZ(0)`

### Intersection Observer
- Only animates when elements are visible
- Configurable thresholds and root margins
- Automatic cleanup on unmount

### requestAnimationFrame
- Throttles scroll events using RAF
- Prevents layout thrashing
- Smooth 60fps animations

### React 19 Concurrent Features
- Uses `useDeferredValue` for smooth transitions
- Prioritizes user interactions over animations
- Reduces janky animations during heavy operations

### Memory Management
- Proper cleanup of event listeners
- Cancellation of animation frames
- Intersection Observer disconnection

## Accessibility

### Reduced Motion Support
All animations respect the `prefers-reduced-motion: reduce` media query:
- Disables parallax and complex animations
- Maintains basic fade transitions
- Preserves functionality while reducing motion

### Performance Adaptation
- Automatically reduces animation complexity on low-end devices
- Adjusts particle counts based on GPU capabilities
- Maintains smooth experience across all devices

## Browser Support

- **Modern browsers**: Full feature support
- **Older browsers**: Graceful degradation
- **Mobile**: Optimized for touch devices
- **High DPI**: Adaptive rendering quality

## Usage Tips

1. **Use GPU acceleration**: Always prefer `transform` over changing `left/top`
2. **Monitor performance**: Use the PerformanceMonitor component during development
3. **Respect accessibility**: Never disable reduced motion support
4. **Test on devices**: Verify performance on lower-end devices
5. **Lazy load**: Use Intersection Observer for off-screen content

## Configuration

All components and hooks accept configuration options for customization:

```tsx
const config = {
  threshold: 0.1, // Intersection Observer threshold
  rootMargin: '0px 0px -10% 0px', // Intersection Observer margins
  damping: 0.8, // Physics damping
  stiffness: 0.2, // Physics stiffness
  mass: 1, // Physics mass
  reducedMotion: false, // Force reduced motion
};
```

This system provides a solid foundation for creating smooth, performant, and accessible animations in modern React applications.