import type { ReactNode } from 'react';

// A data point on a trend SVG drawn with preserveAspectRatio="none". A <circle> would stretch
// into an ellipse with the width; a zero-length path with a round cap and a non-scaling stroke
// is drawn in screen pixels, so it stays a 7px round dot at any width (#263).
export function ChartDot({ x, y, children }: { x: number; y: number; children?: ReactNode }) {
  return (
    <path
      data-slot="chart-dot"
      className="stroke-primary [stroke-width:7] [stroke-linecap:round] [vector-effect:non-scaling-stroke]"
      fill="none"
      d={`M${x} ${y}h0`}
    >
      {children}
    </path>
  );
}
