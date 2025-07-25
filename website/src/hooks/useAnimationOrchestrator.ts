import { useInView } from 'framer-motion';

interface AnimationOptions {
  threshold?: number;
  triggerOnce?: boolean;
}

export function useAnimationOrchestrator(
  ref: React.RefObject<HTMLElement | null>,
  options: AnimationOptions = {}
) {
  const {
    threshold = 0.1,
    triggerOnce = true,
  } = options;

  const isInView = useInView(ref as React.RefObject<HTMLElement>, {
    amount: threshold,
    once: triggerOnce,
  });

  return {
    isInView,
    shouldAnimate: isInView,
  };
}

// Centralized variants for consistent animations
export const animationVariants = {
  section: {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.1,
      },
    },
  },
  item: {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
        ease: [0.25, 0.46, 0.45, 0.94],
      },
    },
  },
  fadeIn: {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        duration: 0.4,
        ease: 'easeOut',
      },
    },
  },
};