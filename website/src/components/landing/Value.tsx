/**
 * Value - Development workflow benefits demonstration component.
 *
 * Features:
 * - Descriptive development benefits
 * - Visual benefit cards with icons
 * - Performance optimizations with lazy loading
 * - Accessibility compliance with ARIA labels
 */
'use client';

import React, { memo, useEffect, useRef, useState } from 'react';
import { useReducedMotion, motion } from 'framer-motion';
import { Link } from '@/i18n/navigation';
import Reveal from '@/components/motion/Reveal';
import { Button } from '@/components/ui/button';
import { CheckCircle, Code, Zap, Users, Shield, ArrowRight } from 'lucide-react';
import { useMessages } from '@/components/i18n/useMessages';

interface ValueProposition {
  title: string;
  benefit?: string;
  metric?: string;
  description: string;
  icon: React.ReactNode;
  details?: string;
  testimonial?: string;
  features?: string[];
}

interface ValueProps {
  propositions?: ValueProposition[];
}

const defaultPropositions: ValueProposition[] = [
  {
    title: "Streamline Development Workflow",
    benefit: "Faster Development",
    description: "Integrate AI-guided architecture planning with direct terminal execution to reduce context switching and accelerate your development process.",
    icon: <Zap className="w-6 h-6" />,
    details: "Execute plans directly from the interface without manual copy-paste workflows"
  },
  {
    title: "Improve Code Quality",
    benefit: "Better Architecture",
    description: "Make informed architectural decisions with AI assistance that understands your codebase structure and suggests optimal implementations.",
    icon: <Shield className="w-6 h-6" />,
    details: "Reduce technical debt through guided implementation planning"
  },
  {
    title: "Reduce Repetitive Tasks",
    benefit: "Enhanced Productivity",
    description: "Automate common development patterns and boilerplate generation, allowing you to focus on solving unique business problems.",
    icon: <Code className="w-6 h-6" />,
    details: "Spend more time on creative problem-solving and less on routine coding tasks"
  },
  {
    title: "Enable Better Collaboration",
    benefit: "Team Alignment",
    description: "Share implementation plans and architectural decisions with your team through clear, executable documentation and visual workflows.",
    icon: <Users className="w-6 h-6" />,
    details: "Improve team communication through structured planning and execution"
  }
];

// Memoized value card component
const ValueCard = memo(function ValueCard({
  proposition,
  index
}: {
  proposition: ValueProposition,
  index: number
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!cardRef.current) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setIsVisible(true);
        io.disconnect();
      }
    }, { rootMargin: '100px 0px', threshold: 0.1 });
    io.observe(cardRef.current);
    return () => io.disconnect();
  }, []);

  return (
    <motion.div
      ref={cardRef}
      className="bg-card/60 border border-border/50 rounded-xl p-6 h-full"
      initial={{ opacity: 0, y: 20 }}
      animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
    >
      {/* Icon and Title */}
      <div className="flex items-start gap-4 mb-4">
        <div className="flex-shrink-0 p-3 bg-primary/10 rounded-lg text-primary">
          {proposition.icon}
        </div>
        <div className="flex-1">
          {proposition.metric && <div className="text-sm font-bold text-primary mb-1 uppercase tracking-wide">{proposition.metric}</div>}
          <h3 className="text-xl font-semibold text-foreground">{proposition.title}</h3>
        </div>
      </div>

      {/* Description */}
      <p className="text-foreground/85 dark:text-foreground/90 font-medium mb-4 line-height-relaxed">
        {proposition.description}
      </p>

      {/* Features with checkboxes */}
      {proposition.features && proposition.features.length > 0 && (
        <div className="space-y-2 mb-4">
          {proposition.features.map((feature, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
              <p className="text-sm text-foreground/80 dark:text-foreground/85">
                {feature}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Testimonial or Details */}
      {(proposition.testimonial || proposition.details) && (
        <div className="p-3 bg-primary/5 rounded-lg border border-primary/20 mt-4">
          <p className="text-sm text-foreground/70 dark:text-foreground/75 italic">
            "{proposition.testimonial || proposition.details}"
          </p>
        </div>
      )}
    </motion.div>
  );
});

// Memoized main component for performance
export const Value = memo(function Value({ propositions = defaultPropositions }: ValueProps) {
  const { t } = useMessages();
  const prefersReducedMotion = useReducedMotion();

  return (
    <section
      className="relative py-12 sm:py-16 md:py-20 lg:py-24 px-4 overflow-hidden"
      id="value"
      aria-label="Development workflow benefits with PlanToCode"
    >
      <div className="container mx-auto relative z-10">
        {/* Header */}
        <div className="text-center mb-12 sm:mb-16">
          <Reveal
            as="h2"
            className="text-3xl sm:text-4xl lg:text-5xl mb-6 text-primary-emphasis font-bold text-shadow-subtle"
            delay={prefersReducedMotion ? 0 : 0}
          >
            Transform Your Development Workflow
          </Reveal>

          <Reveal
            as="p"
            className="text-lg sm:text-xl text-center text-foreground/85 dark:text-foreground/90 font-medium mb-8 max-w-3xl mx-auto"
            delay={prefersReducedMotion ? 0 : 0.1}
          >
            Experience the benefits of AI-guided architecture planning with integrated terminal execution. Streamline your development process and improve code quality.
          </Reveal>

          {/* CTA Button */}
          <motion.div
            className="flex justify-center"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Button
              size="lg"
              variant="outline"
              asChild
              className="cursor-pointer"
            >
              <Link href="/downloads">
                <ArrowRight className="w-4 h-4 mr-2" />
                {t('cta.buttons.download', 'Download for Free')}
              </Link>
            </Button>
          </motion.div>
        </div>

        {/* Value Cards Grid */}
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
            {propositions.map((proposition, index) => (
              <ValueCard
                key={index}
                proposition={proposition}
                index={index}
              />
            ))}
          </div>
        </div>

      </div>

    </section>
  );
});

// Default export for easier importing
export default Value;