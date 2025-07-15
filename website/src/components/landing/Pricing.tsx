'use client';

import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import { useState, useEffect } from 'react';

interface PricingTier {
  name: string;
  price: string;
  description: string;
  features: string[];
  highlighted?: boolean;
  buttonText?: string;
  buttonVariant?: 'default' | 'outline' | 'secondary';
}

interface PricingProps {
  tiers?: PricingTier[];
}

const defaultTiers: PricingTier[] = [];

export function Pricing({ tiers = defaultTiers }: PricingProps) {
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <section id="pricing" className="relative py-16 px-4 overflow-hidden">
      {/* Background image - changes based on resolvedTheme */}
      <Image
        src={resolvedTheme === 'dark' ? "/images/features-background-dark.png" : "/images/features-background.png"}
        alt="Pricing section background"
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
          }`}>Simple, Transparent Pricing</h2>
          <p className={`text-lg sm:text-xl max-w-3xl mx-auto leading-relaxed font-medium ${
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
            No subscriptions. No hidden fees. Pay only for AI usage with transparent processing fees.
          </p>
          <div className="mt-6">
            <div className="inline-flex items-center px-6 py-3 rounded-full bg-white/20 dark:bg-gray-900/30 backdrop-blur-md text-emerald-700 dark:text-emerald-400 text-lg font-medium ring-1 ring-emerald-500/30">
              No Subscriptions - Usage-Based Only
            </div>
          </div>
        </div>
        
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {tiers.map((tier, index) => (
            <div key={index} className="relative group">
              {tier.highlighted && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-20">
                  <div className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm py-1.5 px-4 rounded-full font-medium shadow-lg">
                    Most Popular
                  </div>
                </div>
              )}
              
              <div className={`relative h-full overflow-hidden rounded-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl ${
                tier.highlighted ? 'scale-105' : ''
              }`}>
                {/* Solid base layer for consistent readability */}
                <div className="absolute inset-0 bg-white/90 dark:bg-black/80 backdrop-blur-xl backdrop-saturate-150" />
                
                {/* Subtle gradient overlay for depth */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/20 dark:from-white/5 via-transparent to-transparent opacity-50" />
                
                {/* Emerald tint for highlighted */}
                <div className={`absolute inset-0 ${
                  tier.highlighted 
                    ? 'bg-gradient-to-b from-emerald-500/10 to-teal-500/10 dark:from-emerald-400/5 dark:to-teal-400/5' 
                    : 'bg-gradient-to-b from-transparent to-emerald-500/5 dark:to-blue-400/5'
                }`} />
                
                {/* Glass shine effect */}
                <div className="absolute inset-[1px] bg-gradient-to-br from-white/30 dark:from-white/10 via-transparent to-transparent rounded-[22px] opacity-30" />
                
                {/* Shimmer on hover */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-gradient-to-r from-transparent via-white/20 dark:via-white/10 to-transparent -skew-x-12 translate-x-[-100%] group-hover:translate-x-[100%] transition-all duration-700" />
                
                {/* Subtle edge highlights */}
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 dark:via-white/20 to-transparent" />
                
                {/* Clean border */}
                <div className={`absolute inset-0 rounded-2xl ring-1 ${
                  tier.highlighted 
                    ? 'ring-emerald-500/40 dark:ring-emerald-400/30' 
                    : 'ring-white/20 dark:ring-white/10'
                }`} />
                
                <div className="relative p-6 h-full flex flex-col">
                  <div className="text-center mb-6">
                    <h3 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">{tier.name}</h3>
                    <p className="text-gray-600 dark:text-gray-300">{tier.description}</p>
                  </div>
                  
                  <div className="text-center mb-6">
                    <span className="text-3xl font-bold text-gray-900 dark:text-white">{tier.price}</span>
                    {tier.name === "Free Credits" && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">30-day expiration</p>
                    )}
                    {tier.name === "Paid Credits" && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                        Processing fees apply to credit purchases
                      </p>
                    )}
                    {tier.name === "Enterprise" && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Volume pricing available</p>
                    )}
                  </div>
                  
                  <ul className="space-y-3 mb-6 text-sm text-left flex-1">
                    {tier.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-start gap-2">
                        <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-gray-700 dark:text-gray-200">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  
                  <Button 
                    variant={tier.buttonVariant || (tier.highlighted ? "default" : "outline")}
                    className="w-full"
                    size="lg"
                  >
                    {tier.buttonText || "Get Started"}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        <div className="mt-12">
          <div className="relative overflow-hidden rounded-2xl">
            {/* Glass background */}
            <div className="absolute inset-0 bg-white/90 dark:bg-black/80 backdrop-blur-xl backdrop-saturate-150" />
            <div className="absolute inset-0 bg-gradient-to-br from-white/20 dark:from-white/5 via-transparent to-transparent opacity-50" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-emerald-500/5" />
            <div className="absolute inset-[1px] bg-gradient-to-br from-white/30 dark:from-white/10 via-transparent to-transparent rounded-[22px] opacity-30" />
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 dark:via-white/20 to-transparent" />
            <div className="absolute inset-0 rounded-2xl ring-1 ring-white/20 dark:ring-white/10" />
            
            <div className="relative p-8">
              <h3 className="text-xl font-semibold mb-6 text-center text-gray-900 dark:text-white">Processing Fee Structure</h3>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="relative overflow-hidden rounded-xl group">
                  <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 to-orange-600/20" />
                  <div className="absolute inset-0 ring-1 ring-orange-500/20" />
                  <div className="relative p-6 text-center">
                    <div className="text-3xl font-bold text-orange-600 dark:text-orange-500">20%</div>
                    <div className="text-gray-700 dark:text-gray-300 mt-1">Under $30</div>
                  </div>
                </div>
                <div className="relative overflow-hidden rounded-xl group">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-blue-600/20" />
                  <div className="absolute inset-0 ring-1 ring-blue-500/20" />
                  <div className="relative p-6 text-center">
                    <div className="text-3xl font-bold text-blue-600 dark:text-blue-500">10%</div>
                    <div className="text-gray-700 dark:text-gray-300 mt-1">$30 - $300</div>
                  </div>
                </div>
                <div className="relative overflow-hidden rounded-xl group">
                  <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-green-600/20" />
                  <div className="absolute inset-0 ring-1 ring-green-500/20" />
                  <div className="relative p-6 text-center">
                    <div className="text-3xl font-bold text-green-600 dark:text-green-500">5%</div>
                    <div className="text-gray-700 dark:text-gray-300 mt-1">Over $300</div>
                  </div>
                </div>
              </div>
              <p className="text-gray-600 dark:text-gray-400 text-center mt-6 text-sm">
                Processing fees only apply to credit purchases, not AI usage itself. Purchase range: $0.01 to $10,000.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}