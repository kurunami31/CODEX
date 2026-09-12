import { useRef, useCallback } from 'react';

export default function SpotlightCard({ children, className = '', spotlightColor = 'rgba(14, 208, 182, 0.15)', style = {} }) {
  const ref = useRef(null);

  const handleMouseMove = useCallback((e) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    el.style.setProperty('--spotlight-x', `${x}px`);
    el.style.setProperty('--spotlight-y', `${y}px`);
    el.style.setProperty('--spotlight-color', spotlightColor);
  }, [spotlightColor]);

  return (
    <div
      ref={ref}
      className={`spotlight-card ${className}`}
      style={{
        position: 'relative',
        overflow: 'hidden',
        '--spotlight-x': '50%',
        '--spotlight-y': '50%',
        '--spotlight-color': spotlightColor,
        ...style,
      }}
      onMouseMove={handleMouseMove}
    >
      <div className="spotlight-card__shine" />
      {children}
    </div>
  );
}
