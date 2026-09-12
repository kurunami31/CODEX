import { useRef, useCallback } from 'react';

export default function TiltCard({ children, maxTilt = 15, perspective = 800, className = '', style = {} }) {
  const ref = useRef(null);
  const raf = useRef(null);

  const handleMouseMove = useCallback((e) => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / (rect.width / 2);
      const dy = (e.clientY - cy) / (rect.height / 2);
      const rotY = dx * maxTilt;
      const rotX = -dy * maxTilt;
      el.style.transform = `perspective(${perspective}px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale3d(1.02,1.02,1.02)`;
    });
  }, [maxTilt, perspective]);

  const handleMouseLeave = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    if (ref.current) {
      ref.current.style.transform = `perspective(${perspective}px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)`;
    }
  }, [perspective]);

  return (
    <div
      ref={ref}
      className={`tilt-card ${className}`}
      style={{ transformStyle: 'preserve-3d', transition: 'transform 0.15s ease-out', willChange: 'transform', ...style }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </div>
  );
}
