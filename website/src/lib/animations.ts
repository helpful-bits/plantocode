// Animation constants for consistent behavior across the site
export const defaultEase = [0.25, 0.46, 0.45, 0.94];
export const defaultDuration = 0.5;
export const sectionStagger = 0.08;
export const revealViewport = {
  once: true,
  amount: 0.2,
  margin: '0px 0px -10% 0px'
};

// Named animation variants
export const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      ease: defaultEase,
      duration: defaultDuration
    }
  }
};

export const fadeIn = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      ease: defaultEase,
      duration: defaultDuration
    }
  }
};

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.98 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      ease: defaultEase,
      duration: defaultDuration
    }
  }
};

// Existing variants updated with consistent timing
export const variants = {
  section: {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: sectionStagger,
        delayChildren: 0.05,
      },
    },
  },
  item: {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: defaultDuration,
        ease: defaultEase,
      },
    },
  },
};