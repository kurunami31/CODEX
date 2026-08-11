import { useState } from 'react';
import { initials, avatarStyle } from '../lib/format';

export default function Avatar({ name, seed, size = 38, ring = false, url = null }) {
  const [broken, setBroken] = useState(false);
  const [retries, setRetries] = useState(0);

  if (broken) return (
    <span
      className={`avatar${ring ? ' avatar--ring-teal' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.36, background: avatarStyle(seed ?? name) }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );

  const showImage = Boolean(url);
  if (!showImage) return (
    <span
      className={`avatar${ring ? ' avatar--ring-teal' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.36, background: avatarStyle(seed ?? name) }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );

  const bustedUrl = retries > 0
    ? `${url}${url.includes('?') ? '&' : '?'}r=${retries}`
    : url;

  return (
    <span
      className={`avatar avatar--img${ring ? ' avatar--ring-teal' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.36, background: 'var(--bg-2)' }}
      aria-hidden="true"
    >
      <img
        src={bustedUrl}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size, objectFit: 'cover', borderRadius: '50%' }}
        onError={() => {
          if (retries < 2) setRetries((t) => t + 1);
          else setBroken(true);
        }}
        loading="lazy"
      />
    </span>
  );
}
