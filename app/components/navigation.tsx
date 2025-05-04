'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Home, Settings, MoreHorizontal } from 'lucide-react';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger} from '@/components/ui/dropdown-menu';

export function Navigation() {
  const pathname = usePathname();
  
  return (
    <div className="flex items-center justify-between py-4 border-b mb-6">
      <div className="flex space-x-2">
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
      
      <div className="flex items-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-5 w-5" />
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
  );
} 