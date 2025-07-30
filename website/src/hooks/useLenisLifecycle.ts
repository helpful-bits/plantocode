import { useLenis } from 'lenis/react';
import { useEffect } from 'react';

export function useLenisLifecycle() {
  const lenis = useLenis();

  useEffect(() => {
    if (!lenis) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        lenis.stop();
      } else {
        lenis.start();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [lenis]);
}