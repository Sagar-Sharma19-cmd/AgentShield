"use client";

import { useCallback, useState } from "react";

/**
 * Width of an element in CSS pixels, kept current with a ResizeObserver. Returns a callback ref to
 * attach and the last measured width (0 until the first measurement). The state is only set from
 * the observer callback, never during render.
 */
export function useElementWidth<T extends HTMLElement | SVGElement = HTMLElement>(): [ref: (node: T | null) => void, width: number] {
  const [width, setWidth] = useState(0);

  const ref = useCallback((node: T | null) => {
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0;
      setWidth((previous) => (Math.abs(previous - next) < 0.5 ? previous : next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}
