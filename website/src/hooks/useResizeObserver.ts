import { useEffect, useRef, useState } from "react";

export function useResizeObserver<T extends HTMLElement>(
  ref: React.RefObject<T>,
  box: ResizeObserverBoxOptions = 'content-box'
) {
  const frame = useRef<number | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const cr = box === 'content-box' ? entry.contentBoxSize : entry.borderBoxSize;
      const width = (Array.isArray(cr) ? cr[0] : cr)?.inlineSize ?? el.clientWidth;
      const height = (Array.isArray(cr) ? cr[0] : cr)?.blockSize ?? el.clientHeight;
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => setSize({ width, height }));
    });
    ro.observe(el, { box });
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      ro.disconnect();
    };
  }, [ref, box]);

  return size;
}
