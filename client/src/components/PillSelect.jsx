import { useRef, useState, useEffect } from 'react';
import { ChevronRightIcon } from '../components/icons/Icons';

export default function PillSelect({ value, onChange, options, placeholder, ariaLabel, style }) {
  const [open, setOpen] = useState(false);
  // Which edge the menu hangs from. A menu that sizes to its content can
  // overflow the screen, so it grows toward whichever half of the viewport
  // has room (right-anchored when the trigger sits in the right half).
  const [align, setAlign] = useState('left');
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const toggle = () => {
    if (!open && ref.current && typeof window !== 'undefined') {
      const r = ref.current.getBoundingClientRect();
      setAlign(r.left + r.width / 2 > window.innerWidth / 2 ? 'right' : 'left');
    }
    setOpen((o) => !o);
  };

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      <button
        type="button"
        className="pill-select"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected?.label || placeholder || 'Select'}
        </span>
        <ChevronRightIcon
          width={14}
          height={14}
          style={{ flexShrink: 0, transition: 'transform 0.15s', transform: open ? 'rotate(90deg)' : 'none' }}
        />
      </button>
      {open && (
        <div className={`pill-select__menu pill-select__menu--${align}`} role="listbox">
          {options.map((o) => (
            <div
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={`pill-select__option${o.value === value ? ' pill-select__option--on' : ''}`}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
