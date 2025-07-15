'use client';

import { CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import { useState, useEffect } from 'react';

interface Feature {
  title: string;
  description: string;
  icon: React.ReactNode;
}

interface FeaturesProps {
  features?: Feature[];
}

const defaultFeatures: Feature[] = [];

export function Features({ features = defaultFeatures }: FeaturesProps) {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <section id="features" className="relative py-16 px-4 overflow-hidden">
      {/* Background image - changes based on resolvedTheme */}
      <Image
        src={resolvedTheme === 'dark' ? "/images/features-background-dark.png" : "/images/features-background.png"}
        alt="Features section background"
        fill
        quality={100}
        className="object-cover object-top z-0"
      />
      
      {/* Gradient overlay for better text contrast and smooth transition */}
      <div className="absolute inset-0 z-1 bg-gradient-to-b from-background via-transparent to-background/80" />
      
      {/* Additional soft transition from top */}
      <div className="absolute inset-x-0 top-0 h-32 z-2 bg-gradient-to-b from-background to-transparent" />
      
      {/* Glass morphism overlay */}
      <div className="absolute inset-0 z-5 bg-gradient-to-b from-transparent via-background/5 to-background/20 backdrop-blur-[2px]" />
      
      <div className="container mx-auto relative z-10">
        <div className="text-center mb-12">
          <h2 className={`text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 ${
            resolvedTheme === 'dark' ? "text-white" : "text-teal-900"
          }`}>Key Features</h2>
          <p className={`text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed font-medium ${
            resolvedTheme === 'dark' ? 'text-gray-100' : 'text-teal-950'
          }`}
            style={{
              textShadow: resolvedTheme === 'dark' 
                ? `0 0 20px rgba(94, 234, 212, 0.3),
                   0 0 40px rgba(94, 234, 212, 0.2),
                   0 2px 8px rgba(0, 0, 0, 0.4)`
                : `0 0 30px rgba(255, 255, 135, 0.6),
                   0 0 50px rgba(154, 255, 154, 0.4),
                   0 2px 8px rgba(255, 255, 200, 0.7)`
            }}
          >
            Powerful tools designed for large codebase development and AI-assisted workflow optimization
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => {
              // Calculate position for gradient effect
              const totalRows = Math.ceil(features.length / 3);
              const currentRow = Math.floor(index / 3);
              const gradientPosition = totalRows > 1 ? currentRow / (totalRows - 1) : 0; // 0 to 1
              const isBottomRow = index >= 6;
              
              return (
                <div key={index} className="relative group">
                  {/* Card container with proper rounded corners */}
                  <div className="relative h-full overflow-hidden rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl">
                    {/* Solid base layer for consistent readability */}
                    <div className="absolute inset-0 bg-white/90 dark:bg-black/80 backdrop-blur-xl backdrop-saturate-150" />
                    
                    {/* Subtle gradient overlay for depth */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/20 dark:from-white/5 via-transparent to-transparent opacity-50" />
                    
                    {/* Very subtle emerald tint */}
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-emerald-500/5" />
                    
                    {/* Glass shine effect */}
                    <div className="absolute inset-[1px] bg-gradient-to-br from-white/30 dark:from-white/10 via-transparent to-transparent rounded-[22px] opacity-30" />
                    
                    {/* Shimmer on hover */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-gradient-to-r from-transparent via-white/20 dark:via-white/10 to-transparent -skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%] transition-all duration-700" />
                    
                    {/* Subtle edge highlights */}
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 dark:via-white/20 to-transparent" />
                    
                    {/* Clean border */}
                    <div className="absolute inset-0 rounded-2xl ring-1 ring-white/20 dark:ring-white/10" />
                    
                    <div className="relative h-full flex flex-col p-6">
                      {/* Icon container */}
                      <div className={`
                        mx-auto mb-4 w-16 h-16 rounded-2xl flex items-center justify-center
                        transition-all duration-300 group-hover:scale-110 
                        ${index % 2 === 0 
                          ? 'bg-gradient-to-br from-emerald-500/10 to-emerald-600/20 dark:from-emerald-400/5 dark:to-emerald-500/10 ring-1 ring-emerald-500/20 dark:ring-emerald-400/20' 
                          : 'bg-gradient-to-br from-teal-500/10 to-teal-600/20 dark:from-teal-400/5 dark:to-teal-500/10 ring-1 ring-teal-500/20 dark:ring-teal-400/20'
                        }
                      `}>
                        <div className={`
                          transition-transform duration-300 hover:scale-110
                          ${index % 2 === 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-teal-700 dark:text-teal-400'}
                        `}>
                          {feature.icon}
                        </div>
                      </div>
                      
                      <h3 className="text-xl font-semibold text-center mb-3 text-gray-900 dark:text-white">
                        {feature.title}
                      </h3>
                      
                      <p className="text-center text-sm leading-relaxed flex-1 text-gray-700 dark:text-gray-200">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </section>
  );
}