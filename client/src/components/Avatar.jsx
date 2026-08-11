import { initials, avatarStyle } from '../lib/format';

export default function Avatar({ name, seed, size = 38, ring = false }) {
  return (
    <span
      className={`avatar${ring ? ' avatar--ring-teal' : ''}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: avatarStyle(seed ?? name),
      }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
