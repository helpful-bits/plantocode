'use client';

import * as React from 'react';
import { ThemeProvider as NextThemesProvider, useTheme as useNextTheme } from 'next-themes';
import { type ThemeProviderProps } from 'next-themes/dist/types';

/**
 * Enhanced ThemeProvider with system-aware dark mode and smooth transitions
 * 
 * Features:
 * - System preference detection with next-themes
 * - Smooth theme transitions without flash of incorrect theme (FOIT)
 * - OKLCH color consistency across theme switches
 * - Proper hydration handling for SSR
 * - Reduced motion support
 * - Theme persistence across sessions
 */

interface ExtendedThemeProviderProps extends ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ 
  children, 
  ...props 
}: ExtendedThemeProviderProps) {
  const [mounted, setMounted] = React.useState(false);

  // Ensure component is mounted before rendering to prevent hydration mismatch
  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Handle theme transition animations
  React.useEffect(() => {
    const handleThemeChange = () => {
      // Check if user prefers reduced motion
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      
      if (!prefersReducedMotion) {
        // Add smooth transition class temporarily
        document.documentElement.style.transition = 'background-color 0.3s ease, color 0.3s ease';
        
        // Remove transition after animation completes
        setTimeout(() => {
          document.documentElement.style.transition = '';
        }, 300);
      }
    };

    // Listen for theme changes
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          handleThemeChange();
        }
      });
    });

    if (mounted) {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class']
      });
    }

    return () => observer.disconnect();
  }, [mounted]);

  // Update theme-color meta tag based on current theme
  React.useEffect(() => {
    if (!mounted) return;

    const updateThemeColor = () => {
      const isDark = document.documentElement.classList.contains('dark');
      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      
      if (metaThemeColor) {
        // Use OKLCH colors for better color consistency
        const lightThemeColor = 'oklch(1 0 0)'; // Pure white for light mode
        const darkThemeColor = 'oklch(0.18 0.02 206)'; // Navy background for dark mode
        
        metaThemeColor.setAttribute('content', isDark ? darkThemeColor : lightThemeColor);
      }
    };

    // Update immediately
    updateThemeColor();

    // Listen for theme changes
    const observer = new MutationObserver(updateThemeColor);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => observer.disconnect();
  }, [mounted]);

  // Prevent flash of incorrect theme during hydration
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange={false} // Enable smooth transitions
      storageKey="vibe-manager-theme"
      value={{
        light: 'light',
        dark: 'dark',
        system: 'system'
      }}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}

/**
 * Custom hook for theme utilities
 */
export function useTheme() {
  const nextThemeData = useNextTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  return {
    ...nextThemeData,
    mounted,
    // Utility functions
    isLight: mounted && nextThemeData.resolvedTheme === 'light',
    isDark: mounted && nextThemeData.resolvedTheme === 'dark',
    isSystem: nextThemeData.theme === 'system',
    toggleTheme: () => {
      nextThemeData.setTheme(nextThemeData.resolvedTheme === 'light' ? 'dark' : 'light');
    }
  };
}

/**
 * Theme transition component for smooth animations
 */
export function ThemeTransition({ children }: { children: React.ReactNode }) {
  const { mounted } = useTheme();

  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <div className="theme-transition">
      {children}
    </div>
  );
}