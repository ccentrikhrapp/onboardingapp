import Icon from '../common/Icon.jsx';

/* Page-title band: title / back-link / search (from <TAHeader>). Account
   tools (notifications, profile) live in TATopNav2 above this, not here. */
export default function TATopbar({ head }) {
  if (!head?.title && !head?.subtitle && !head?.search && !head?.backTo) return null;
  return (
    <header className="ta-topbar">
      <div className="ta-topbar__head">
        {head?.backTo && (
          <button className="ta-topbar__back" onClick={head.onBack}>
            <Icon name="ArrowLeft" size={13} /> {head.backLabel || 'Back'}
          </button>
        )}
        {head?.title && <h1 className="ta-topbar__title">{head.title}</h1>}
        {head?.subtitle && <p className="ta-topbar__sub">{head.subtitle}</p>}
      </div>

      {head?.search && <div className="global-search">{head.search}</div>}
    </header>
  );
}
