'use client';

import React from 'react';

export function SectionDivider() {
  return (
    <div className="relative w-full h-8 sm:h-12 md:h-16 -my-8 sm:-my-12 md:-my-16 overflow-visible pointer-events-none">
      {/* Base gradient layer for smooth blending */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/[0.02] to-transparent" />
      
      {/* Static gradient wave */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/[0.15] to-transparent transform skew-x-12" />
      </div>
      
      {/* Particle dots - static */}
      <div className="absolute inset-0">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="absolute w-0.5 h-0.5 bg-primary/25 rounded-full"
            style={{
              left: `${20 + i * 15}%`,
              top: '50%',
            }}
          />
        ))}
      </div>
      
      {/* Center line with glow - static */}
      <div className="absolute inset-x-0 top-1/2 transform -translate-y-1/2">
        <div className="relative">
          <div className="absolute inset-x-0 h-[0.5px] bg-gradient-to-r from-transparent via-primary/20 to-transparent opacity-40" />
          <div className="absolute inset-x-0 h-2 bg-gradient-to-r from-transparent via-primary/[0.05] to-transparent blur-sm" />
        </div>
      </div>
      
      {/* Edge fade for smooth section transitions - CRITICAL */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-transparent to-background/20 sm:from-background/30 sm:to-background/30 md:from-background/40 md:to-background/40" />
    </div>
  );
}

// Alternative style with orbs - Static version
export function SectionDividerOrbs() {
  return (
    <div className="relative w-full h-8 sm:h-12 md:h-16 -my-8 sm:-my-12 md:-my-16 overflow-visible pointer-events-none">
      {/* Glass morphism base layer */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/[0.02] to-transparent backdrop-blur-[2px]" />
      
      {/* Static gradient flow */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/[0.05] to-transparent" />
        
        {/* Central orb - static */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="absolute w-16 h-16 rounded-full opacity-50"
            style={{
              background: `radial-gradient(circle at center, 
                oklch(0.68 0.085 195 / 0.15) 0%, 
                oklch(0.68 0.085 195 / 0.08) 40%, 
                transparent 70%)`,
              filter: 'blur(12px)',
            }}
          />
          
          {/* Liquid side elements - static */}
          <div className="absolute w-full h-8 opacity-40">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/[0.08] to-transparent rounded-full blur-md" />
          </div>
          
          {/* Static particles */}
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 rounded-full bg-primary/30 opacity-40"
              style={{
                left: `${35 + i * 15}%`,
              }}
            />
          ))}
        </div>
        
        {/* Ultra-thin connecting line - static */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2">
          <div className="h-[0.5px] bg-gradient-to-r from-transparent via-primary/20 to-transparent opacity-45" />
          {/* Glow effect */}
          <div className="absolute inset-x-0 -inset-y-2 bg-gradient-to-r from-transparent via-primary/[0.05] to-transparent blur-sm" />
        </div>
        
        {/* Edge fade for smooth section transitions */}
        <div className="absolute inset-0 bg-gradient-to-b from-background/15 via-transparent to-background/15 sm:from-background/20 sm:to-background/20" />
      </div>
    </div>
  );
}

// Mesh gradient style - Static version
export function SectionDividerMesh() {
  return (
    <div className="relative w-full h-8 sm:h-12 md:h-16 -my-8 sm:-my-12 md:-my-16 overflow-hidden pointer-events-none">
      <div className="absolute inset-0">
        {/* Static mesh background */}
        <div
          className="absolute inset-0 opacity-70"
          style={{
            background: `
              radial-gradient(ellipse at 25% 50%, oklch(0.68 0.085 195 / 0.08) 0%, transparent 40%),
              radial-gradient(ellipse at 75% 50%, oklch(0.68 0.085 195 / 0.08) 0%, transparent 40%),
              radial-gradient(ellipse at 50% 50%, oklch(0.68 0.085 195 / 0.05) 0%, transparent 60%)
            `,
          }}
        />
        
        {/* Static mesh lines */}
        <div 
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `
              linear-gradient(45deg, transparent 48%, oklch(0.68 0.085 195 / 0.1) 49%, oklch(0.68 0.085 195 / 0.1) 51%, transparent 52%),
              linear-gradient(-45deg, transparent 48%, oklch(0.68 0.085 195 / 0.1) 49%, oklch(0.68 0.085 195 / 0.1) 51%, transparent 52%)
            `,
            backgroundSize: '30px 30px',
          }}
        />
        
        {/* Gradient overlay for smooth fade */}
        <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-transparent to-background/20 sm:from-background/25 sm:to-background/25 md:from-background/30 md:to-background/30" />
      </div>
    </div>
  );
}

// Ultra-smooth liquid divider - Static version
export function SectionDividerLiquid() {
  return (
    <div className="relative w-full h-8 sm:h-12 md:h-16 -my-8 sm:-my-12 md:-my-16 overflow-visible pointer-events-none">
      {/* Liquid flow effect - static */}
      <div className="absolute inset-0">
        {/* Base liquid layer */}
        <div
          className="absolute inset-0 opacity-50"
          style={{
            background: `linear-gradient(90deg, 
              transparent 0%,
              oklch(0.68 0.085 195 / 0.03) 10%,
              oklch(0.68 0.085 195 / 0.06) 25%,
              oklch(0.68 0.085 195 / 0.08) 50%,
              oklch(0.68 0.085 195 / 0.06) 75%,
              oklch(0.68 0.085 195 / 0.03) 90%,
              transparent 100%
            )`,
          }}
        />
        
        {/* Static wave pattern */}
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
          <path
            d="M0,20 Q250,18 500,20 T1000,20 L1000,20 L0,20 Z"
            fill="url(#liquidGradient)"
            opacity="0.4"
          />
          <defs>
            <linearGradient id="liquidGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="oklch(0.68 0.085 195 / 0)" />
              <stop offset="50%" stopColor="oklch(0.68 0.085 195 / 0.15)" />
              <stop offset="100%" stopColor="oklch(0.68 0.085 195 / 0)" />
            </linearGradient>
          </defs>
        </svg>
        
        {/* Micro particles for texture - static */}
        <div className="absolute inset-0">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="absolute w-0.5 h-0.5 rounded-full bg-primary/20 opacity-30"
              style={{
                left: `${20 + i * 15}%`,
                top: '50%',
              }}
            />
          ))}
        </div>
        
        {/* Edge blend */}
        <div className="absolute inset-0 bg-gradient-to-r from-background/30 via-transparent to-background/30 sm:from-background/40 sm:to-background/40 md:from-background/50 md:to-background/50" />
      </div>
    </div>
  );
}