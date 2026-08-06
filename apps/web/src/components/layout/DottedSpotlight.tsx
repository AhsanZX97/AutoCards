import { useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';

/**
 * Dot-field backdrop for the marketing pages. A resting layer is always visible;
 * a brighter layer is masked to a circle that follows the pointer.
 */
export function DottedSpotlight({ children }: { children: ReactNode }) {
  const [hovering, setHovering] = useState(false);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setCursor({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  }

  const spotlightStyle = {
    '--spot-x': `${cursor.x}px`,
    '--spot-y': `${cursor.y}px`,
  } as CSSProperties;

  return (
    <div
      className="relative min-h-screen overflow-hidden bg-white dark:bg-slate-950"
      onPointerEnter={() => setHovering(true)}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setHovering(false)}
    >
      <div className="pointer-events-none absolute inset-0 bg-dots" />
      <div
        className={`pointer-events-none absolute inset-0 bg-dots-spotlight transition-opacity duration-200 ${
          hovering ? 'opacity-100' : 'opacity-0'
        }`}
        style={spotlightStyle}
      />
      {children}
    </div>
  );
}
