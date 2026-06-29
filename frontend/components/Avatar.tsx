'use client';

interface AvatarProps {
  name: string;
  color?: string;
  size?: number;
  className?: string;
  title?: string;
}

const PALETTE = [
  '#5E6AD2', '#22A06B', '#AD48DD', '#D99642', '#D96666',
  '#5BA8D9', '#8B6F47', '#9C4A8E', '#3B7DD8', '#6E7AD6',
];

function initialsOf(name: string): string {
  if (!name) return '?';
  const cleaned = name.trim();
  if (cleaned.length === 0) return '?';
  const parts = cleaned.split(/[\s@]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

export function Avatar({ name, color, size = 32, className = '', title }: AvatarProps) {
  const bg = color || PALETTE[Math.abs(hashCode(name || '?')) % PALETTE.length];
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-medium text-white flex-shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        background: bg,
        fontSize: Math.max(11, Math.round(size * 0.4)),
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
      }}
      title={title || name}
      aria-label={name}
    >
      {initialsOf(name)}
    </span>
  );
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}