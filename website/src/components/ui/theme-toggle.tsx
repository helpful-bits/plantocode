'use client';

import * as React from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from 'next-themes';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Theme toggle component with system preference support
 * 
 * Features:
 * - Light/Dark/System theme options
 * - Smooth transitions respecting reduced motion
 * - Keyboard navigation support
 * - ARIA compliant
 * - Uses OKLCH colors for consistency
 */
export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <Button
        variant="outline"
        size="icon"
        disabled
        className="w-9 h-9 rounded-lg"
      >
        <div className="w-4 h-4 animate-pulse bg-muted rounded" />
        <span className="sr-only">Loading theme toggle</span>
      </Button>
    );
  }

  const currentIcon = () => {
    switch (resolvedTheme) {
      case 'light':
        return <Sun className="w-4 h-4" />;
      case 'dark':
        return <Moon className="w-4 h-4" />;
      default:
        return <Monitor className="w-4 h-4" />;
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Toggle theme">
          {currentIcon()}
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuRadioGroup value={theme || 'system'} onValueChange={setTheme}>
          <DropdownMenuRadioItem value="light" className="flex items-center gap-2 cursor-pointer">
            <Sun className="w-4 h-4" />
            <span>Light</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" className="flex items-center gap-2 cursor-pointer">
            <Moon className="w-4 h-4" />
            <span>Dark</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system" className="flex items-center gap-2 cursor-pointer">
            <Monitor className="w-4 h-4" />
            <span>System</span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}