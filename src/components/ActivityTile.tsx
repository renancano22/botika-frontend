import { Link } from 'react-router-dom';

/**
 * One dashboard tile: a big number, a small unit and a label. Tapping it opens what it counts.
 * `k` is the colour key (status palette); `alert` tints the tile when the number needs attention.
 */
export default function ActivityTile({ to, value, unit, label, k, hint, alert = false }: {
  to: string; value: number | string; unit: string; label: string; k: string; hint?: string; alert?: boolean;
}) {
  return (
    <Link to={to} className={`act-tile k-${k} ${alert ? 'act-alert' : ''}`}>
      <strong>{value}</strong>
      <small>{unit}</small>
      <span>{label}</span>
      {hint && <em>{hint}</em>}
    </Link>
  );
}
