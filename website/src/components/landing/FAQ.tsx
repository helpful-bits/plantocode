'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useTheme } from 'next-themes';

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQProps {
  items: FAQItem[];
}

export function FAQ({ items }: FAQProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <section id="faq" className="relative py-16 px-4 overflow-hidden">
      {/* Background image - changes based on theme */}
      <Image
        src={resolvedTheme === 'dark' ? "/images/features-background-dark.png" : "/images/features-background.png"}
        alt="FAQ section background"
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
      
      <div className="container mx-auto max-w-3xl relative z-10">
        <div className="text-center mb-12">
          <h2 className={`text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 ${
            resolvedTheme === 'dark' ? "text-white" : "text-teal-900"
          }`}>Frequently Asked Questions</h2>
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
            Everything you need to know about Vibe Manager
          </p>
        </div>
        
        <div className="space-y-4">
          {items.map((item, index) => (
            <div key={index} className="relative group">
              <div className="relative overflow-hidden rounded-2xl transition-all duration-300 hover:shadow-lg">
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
                
                <div className="relative">
                  <button
                    className="w-full p-6 text-left flex justify-between items-center transition-colors group"
                    onClick={() => setOpenIndex(openIndex === index ? null : index)}
                  >
                    <span className="font-semibold text-lg text-gray-900 dark:text-white pr-4">
                      {item.question}
                    </span>
                    <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                      openIndex === index 
                        ? 'bg-gradient-to-br from-emerald-500/20 to-emerald-600/30 ring-1 ring-emerald-500/30' 
                        : 'bg-gradient-to-br from-gray-500/10 to-gray-600/20 ring-1 ring-gray-500/20'
                    }`}>
                      <svg
                        className={`w-5 h-5 transition-transform duration-300 ${
                          openIndex === index ? 'rotate-180' : ''
                        } ${
                          openIndex === index 
                            ? 'text-emerald-700 dark:text-emerald-500' 
                            : 'text-gray-700 dark:text-gray-400'
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>
                  </button>
                  
                  <div className={`overflow-hidden transition-all duration-300 ${
                    openIndex === index ? 'max-h-96' : 'max-h-0'
                  }`}>
                    <div className="px-6 pb-6 text-gray-700 dark:text-gray-200 leading-relaxed">
                      {item.answer}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}