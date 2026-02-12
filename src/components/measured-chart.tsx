"use client";

import { ReactNode, useEffect, useRef, useState } from "react";

interface ChartSize {
  width: number;
  height: number;
}

export function MeasuredChart({
  className,
  minHeight = 220,
  children
}: {
  className?: string;
  minHeight?: number;
  children: (size: ChartSize) => ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<ChartSize>({ width: 0, height: 0 });

  useEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return;
    }

    const update = () => {
      const nextWidth = Math.max(0, Math.floor(node.clientWidth));
      const nextHeight = Math.max(0, Math.floor(node.clientHeight));
      setSize((prev) => {
        if (prev.width === nextWidth && prev.height === nextHeight) {
          return prev;
        }
        return { width: nextWidth, height: nextHeight };
      });
    };

    update();

    const observer = new ResizeObserver(() => {
      update();
    });
    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, []);

  const ready = size.width > 0 && size.height > 0;

  return (
    <div ref={containerRef} className={className} style={{ minHeight }}>
      {ready ? children(size) : null}
    </div>
  );
}

