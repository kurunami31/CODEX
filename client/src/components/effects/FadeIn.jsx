import { useEffect, useRef, useState } from 'react';

export default function FadeIn({ children, delay = 0, direction = 'up', className = '', style = {} }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const dirMap = {
    up: 'translateY(24px)',
    down: 'translateY(-24px)',
    left: 'translateX(24px)',
    right: 'translateX(-24px)',
    none: 'none',
  };

  return (
    <div
      ref={ref}
      className={`fade-in ${visible ? 'fade-in--visible' : ''} ${className}`}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : dirMap[direction],
        transition: `opacity 0.5s ease ${delay}s, transform 0.5s ease ${delay}s`,
        willChange: 'opacity, transform',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
