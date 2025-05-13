'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Home, Settings, MoreHorizontal, Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import { ThemeToggle } from './theme-toggle';
import { useUILayout } from '@/lib/contexts/ui-layout-context';
import GlobalLoadingIndicator from './global-loading-indicator';
import { useProject } from '@/lib/contexts/project-context';
import { useSessionContext } from '@/lib/contexts/session-context';

export function Navigation() {
  const pathname = usePathname();
  const { isAppBusy, busyMessage } = useUILayout();
  const { isSwitchingSession } = useProject();
  const { isSessionLoading } = useSessionContext();

  const isBusy = isAppBusy;

  return (
    <>
      {/* Global loading indicator at the top of the app */}
      <GlobalLoadingIndicator />

      <div className="flex items-center justify-between py-4 border-b border-border mb-8">
        <div className="flex gap-2">
          <Link href="/">
            <Button variant={pathname === '/' ? 'default' : 'ghost'} size="sm">
              <Home className="h-4 w-4 mr-2" />
              Home
            </Button>
          </Link>
          <Link href="/settings">
            <Button variant={pathname === '/settings' ? 'default' : 'ghost'} size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          {/* Show a small indicator when the app is busy */}
          {isBusy && (
            <div className="flex items-center text-xs text-muted-foreground px-2 py-1 rounded-md bg-muted/30">
              <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
              <span>{busyMessage || "Loading..."}</span>
            </div>
          )}

          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => window.location.href = '/'}>
                Reload Application
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </>
  );
} 