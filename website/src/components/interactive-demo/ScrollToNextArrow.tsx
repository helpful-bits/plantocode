'use client';

interface ScrollToNextArrowProps {
  nextStepId: number;
  label?: string;
  isVisible?: boolean;
}

export function ScrollToNextArrow({ nextStepId, label = "Next Step", isVisible = true }: ScrollToNextArrowProps) {
  if (!isVisible) return null;

  const handleClick = () => {
    const nextStep = document.querySelector(`[data-step="${nextStepId}"]`);
    if (nextStep) {
      const elementTop = nextStep.getBoundingClientRect().top;
      const offsetPosition = elementTop + window.scrollY - (window.innerHeight * 0.25);
      
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="flex justify-center py-8">
      <button
        onClick={handleClick}
        className="group inline-flex flex-col items-center gap-2 text-primary/60 hover:text-primary transition-colors duration-300 animate-bounce"
        aria-label={`Continue to ${label}`}
      >
        <div className="flex flex-col items-center">
          <svg 
            className="w-6 h-6 transform group-hover:translate-y-1 transition-transform duration-300" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
          <div className="w-1 h-4 bg-gradient-to-b from-primary/30 to-transparent rounded-full mt-1" />
        </div>
        <span className="text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          {label}
        </span>
      </button>
    </div>
  );
}