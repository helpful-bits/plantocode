'use client';

import { useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { trackFAQ } from '@/lib/track';
import { useMessages } from '@/components/i18n/useMessages';

const FAQ_KEYS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9', 'q10', 'q11', 'q12', 'q13'];

export function FAQOptimized() {
  const { t } = useMessages();
  const [openIndices, setOpenIndices] = useState<number[]>([0, 1, 2]);

  const toggleOpen = (index: number) => {
    const isExpanding = !openIndices.includes(index);
    if (isExpanding && FAQ_KEYS[index]) {
      const question = t(`faq.items.${FAQ_KEYS[index]}.q`);
      trackFAQ(question, index);
    }
    setOpenIndices((cur) => cur.includes(index) ? cur.filter(i => i !== index) : [...cur, index]);
  };

  return (
    <section className="relative py-12 sm:py-16 md:py-20 lg:py-24 px-4" id="faq">
      <div className="container mx-auto max-w-3xl relative z-10">
        <div className="text-center mb-12 sm:mb-16">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl mb-4 text-primary-emphasis">
            {t('faq.title', 'Frequently Asked Questions')}
          </h2>
          <p className="text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed font-medium text-foreground/80">
            {t('faq.subtitle', 'Everything you need to know about PlanToCode')}
          </p>
        </div>

        <div className="p-4 space-y-6">
          {FAQ_KEYS.map((key, index) => (
            <div key={key} className="faq-item relative">
              <GlassCard className="hover:shadow-lg hover:shadow-primary/5 transition-shadow duration-200">
                <div
                  className={`transition-colors duration-300 ${
                    openIndices.includes(index) ? 'bg-primary/[0.02]' : ''
                  }`}
                >
                  <button
                    className="w-full px-4 py-4 sm:p-6 text-left flex justify-between items-center group relative active:scale-[0.98] transition-transform"
                    onClick={() => toggleOpen(index)}
                  >
                    <span
                      className={`font-semibold text-lg text-foreground pr-4 transition-colors ${
                        openIndices.includes(index) ? 'text-primary' : ''
                      }`}
                    >
                      {t(`faq.items.${key}.q`)}
                    </span>
                    <div
                      className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center relative transition-transform duration-400 ${
                        openIndices.includes(index) ? 'scale-110 rotate-180' : ''
                      }`}
                      style={{
                        transitionTimingFunction: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)'
                      }}
                    >
                      <div
                        className={`absolute inset-0 rounded-full transition-all duration-300 ${
                          openIndices.includes(index)
                            ? 'bg-gradient-to-br from-primary/30 to-primary/40'
                            : 'bg-gradient-to-br from-primary/5 to-primary/10'
                        }`}
                      />
                      <div
                        className={`absolute inset-0 rounded-full ring-1 transition-all duration-300 ${
                          openIndices.includes(index) ? 'ring-primary/40' : 'ring-primary/15'
                        }`}
                      />
                      <svg
                        className="w-5 h-5 relative z-10 text-primary"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M19 9l-7 7-7-7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                        />
                      </svg>
                    </div>
                  </button>

                  <div
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      openIndices.includes(index) ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                    }`}
                    style={{
                      transitionProperty: 'max-height, opacity',
                    }}
                  >
                    <div className="px-4 pb-4 sm:px-6 sm:pb-6 text-foreground leading-relaxed">
                      <div className="border-l-2 border-primary/20 pl-4">
                        {t(`faq.items.${key}.a`)}
                      </div>
                    </div>
                  </div>
                </div>
              </GlassCard>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
