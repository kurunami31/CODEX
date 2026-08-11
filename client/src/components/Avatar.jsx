import { useState } from 'react';
import { initials, avatarStyle } from '../lib/format';

export default function Avatar({ name, seed, size = 38, ring = false, url = null }) {
  const [broken, setBroken] = useState(false);
  const showImage = url && !broken;
  return (
    <span
      className={`avatar${ring ? ' avatar--ring-teal' : ''}${showImage ? ' avatar--img' : ''}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: showImage ? 'var(--bg-2)' : avatarStyle(seed ?? name),
      }}
      aria-hidden="true"
    >
      {showImage ? (
        <img
          src={url}
          alt=""
          width={size}
          height={size}
          style={{ width: size, height: size, objectFit: 'cover', borderRadius: '50%' }}
          onError={() => setBroken(true)}
          loading="lazy"
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}
