import { initialsOf } from '../../utils/format.js';

/* Overlapping circular initials avatars, per the design system — a thin
   white ring between them, and a dark "+N" circle for whatever doesn't
   fit in `max`. `names` is a plain array of display names; nothing here
   fetches or invents data, it just renders what the caller already has. */
export default function AvatarStack({ names = [], max = 4, size = 28 }) {
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <div className="ta-avatarstack" style={{ '--ta-avstack-size': `${size}px` }}>
      {shown.map((n, i) => (
        <span key={n + i} className="ta-avatarstack__item" title={n}>{initialsOf(n)}</span>
      ))}
      {extra > 0 && <span className="ta-avatarstack__item ta-avatarstack__item--more">+{extra}</span>}
    </div>
  );
}
