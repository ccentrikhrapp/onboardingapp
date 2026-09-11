import Icon from '../common/Icon.jsx';

/* Compact one-line summary of key numbers. Each item: { icon, value, label, accent, onClick }. */
export default function StatBar({ items }) {
  return (
    <div className="hr-statbar">
      {items.map((it) => {
        const Row = it.onClick ? 'button' : 'div';
        return (
          <Row
            key={it.label}
            type={it.onClick ? 'button' : undefined}
            className={`hr-statbar__item${it.onClick ? ' hr-statbar__item--link' : ''}`}
            onClick={it.onClick}
          >
            <span className={`hr-statbar__icon hr-statbar__icon--${it.accent || 'blue'}`}>
              <Icon name={it.icon} size={16} />
            </span>
            <span className="hr-statbar__text">
              <span className="hr-statbar__num">{it.value}</span>
              <span className="hr-statbar__label">{it.label}</span>
            </span>
          </Row>
        );
      })}
    </div>
  );
}
