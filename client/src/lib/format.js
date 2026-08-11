export function timeAgo(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatEventDate(iso) {
  const d = new Date(iso);
  const day = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return { day, time, dayNum: d.getDate(), month: d.toLocaleDateString(undefined, { month: 'short' }) };
}

export function isUpcoming(iso) {
  return new Date(iso).getTime() > Date.now();
}

export function initials(name) {
  return (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#0ED0B6,#7ce9d8)',
  'linear-gradient(135deg,#1A5D78,#4fa8c2)',
  'linear-gradient(135deg,#f5a623,#ffd08a)',
  'linear-gradient(135deg,#e5484d,#ff9d9f)',
  'linear-gradient(135deg,#2bb673,#8fe3bd)',
  'linear-gradient(135deg,#8b5cf6,#c4b5fd)',
];

export function avatarStyle(seed) {
  let hash = 0;
  const s = String(seed || '');
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

export function truncate(text, n) {
  if (!text) return '';
  return text.length > n ? text.slice(0, n - 1) + '…' : text;
}
