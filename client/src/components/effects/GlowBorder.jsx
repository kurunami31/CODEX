import { useRef, useCallback } from 'react';

export default function GlowBorder({ children, className = '', glowColor = 'var(--accent)', style = {} }) {
  const ref = useRef(null);

  const handleMouseMove = useCallback((e) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty('--glow-x', `${x}%`);
    el.style.setProperty('--glow-y', `${y}%`);
  }, []);

  return (
    <div
      ref={ref}
      className={`glow-border ${className}`}
      style={{
        '--glow-color': glowColor,
        '--glow-x': '50%',
        '--glow-y': '50%',
        ...style,
      }}
      onMouseMove={handleMouseMove}
    >
      {children}
    </div>
  );
}
