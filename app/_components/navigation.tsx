'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Home } from 'lucide-react';

export function Navigation() {
  const pathname = usePathname();
  
  const navItems = [
    {
      name: 'Home',
      href: '/',
      icon: <Home className="h-4 w-4 mr-2" />
    }
  ];
  
  return (
    <nav className="flex items-center space-x-2 py-4">
      {navItems.map((item) => (
        <Button
          key={item.href}
          variant={pathname === item.href ? 'secondary' : 'ghost'}
          size="sm"
          asChild
          className={cn(
            pathname === item.href 
              ? 'bg-secondary text-secondary-foreground' 
              : 'text-muted-foreground hover:text-foreground',
            'transition-all'
          )}
        >
          <Link href={item.href}>
            {item.icon}
            {item.name}
          </Link>
        </Button>
      ))}
    </nav>
  );
} 