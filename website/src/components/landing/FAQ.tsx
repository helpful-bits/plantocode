'use client';

import { useState } from 'react';
import Image from 'next/image';
import { GlassCard } from '@/components/ui/GlassCard';

interface FAQItem {
  question: string;
  answer: string;
}

interface FAQProps {
  items: FAQItem[];
}

export function FAQ({ items }: FAQProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="relative py-16 px-4 overflow-hidden">
      {/* Background image - changes based on theme */}
      <Image
        src="/images/features-background.png"
        alt="FAQ section background"
        fill
        quality={100}
        className="object-cover object-top z-0 block dark:hidden"
      />
      <Image
        src="/images/features-background-dark.png"
        alt="FAQ section background"
        fill
        quality={100}
        className="object-cover object-top z-0 hidden dark:block"
      />
      
      {/* Gradient overlay for better text contrast and smooth transition */}
      <div className="absolute inset-0 z-1 bg-gradient-to-b from-background via-transparent to-background/80" />
      
      {/* Additional soft transition from top */}
      <div className="absolute inset-x-0 top-0 h-32 z-2 bg-gradient-to-b from-background to-transparent" />
      
      {/* Glass morphism overlay */}
      <div className="absolute inset-0 z-5 bg-gradient-to-b from-transparent via-background/10 to-transparent backdrop-blur-sm" />
      
      <div className="container mx-auto max-w-3xl relative z-10">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4 text-teal-900 dark:text-white">Frequently Asked Questions</h2>
          <p className="text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed font-medium text-teal-950 dark:text-gray-100">
            Everything you need to know about Vibe Manager
          </p>
        </div>
        
        <div className="space-y-4">
          {items.map((item, index) => (
            <GlassCard key={index}>
                <div>
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
            </GlassCard>
          ))}
        </div>
      </div>
    </section>
  );
}