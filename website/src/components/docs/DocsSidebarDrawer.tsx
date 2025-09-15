'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SidebarNavServer } from './SidebarNavServer';

interface DocsSidebarDrawerProps {
  currentPath: string;
}

export function DocsSidebarDrawer({ currentPath }: DocsSidebarDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      // Add body scroll lock
      document.body.style.overflow = 'hidden';
      
      // Mark background as inert
      const mainContent = document.getElementById('main-content');
      if (mainContent) {
        mainContent.setAttribute('inert', 'true');
      }
    } else {
      // Remove body scroll lock
      document.body.style.overflow = '';
      
      // Remove inert
      const mainContent = document.getElementById('main-content');
      if (mainContent) {
        mainContent.removeAttribute('inert');
      }
    }

    // Cleanup on unmount
    return () => {
      document.body.style.overflow = '';
      const mainContent = document.getElementById('main-content');
      if (mainContent) {
        mainContent.removeAttribute('inert');
      }
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  const drawer = isOpen && mounted && (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40"
        onClick={() => {
          setIsOpen(false);
          buttonRef.current?.focus();
        }}
        aria-hidden="true"
      />
      
      {/* Drawer */}
      <div 
        id="docs-mobile-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="docs-menu-title"
        className="fixed left-0 top-0 h-full w-64 bg-background border-r border-border z-50 overflow-y-auto"
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 id="docs-menu-title" className="text-lg font-semibold">Documentation</h2>
          <Button
            onClick={() => {
              setIsOpen(false);
              buttonRef.current?.focus();
            }}
            variant="outline"
            size="icon"
            aria-label="Close menu"
            autoFocus
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="p-4">
          <SidebarNavServer currentPath={currentPath} />
        </div>
      </div>
    </>
  );

  return (
    <>
      <Button
        ref={buttonRef}
        onClick={() => setIsOpen(true)}
        variant="outline"
        size="icon"
        className="md:hidden"
        aria-expanded={isOpen}
        aria-controls="docs-mobile-drawer"
        aria-label="Open documentation menu"
      >
        <Menu className="h-5 w-5" />
      </Button>
      {mounted && createPortal(drawer, document.body)}
    </>
  );
}