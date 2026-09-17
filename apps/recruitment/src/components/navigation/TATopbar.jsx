import Icon from '../common/Icon.jsx';
import NotificationBell from './NotificationBell.jsx';
import ProfileMenu from './ProfileMenu.jsx';

/* Single header band: page title (from <TAHeader>) on the left, tools on the right. */
export default function TATopbar({ head, onMenu }) {
  return (
    <header className="ta-topbar">
      <button className="ta-iconbtn ta-menubtn" onClick={onMenu} aria-label="Open navigation">
        <Icon name="Menu" size={18} />
      </button>

      <div className="ta-topbar__head">
        {head?.backTo && (
          <button className="ta-topbar__back" onClick={head.onBack}>
            <Icon name="ArrowLeft" size={13} /> {head.backLabel || 'Back'}
          </button>
        )}
        {head?.title && <h1 className="ta-topbar__title">{head.title}</h1>}
        {head?.subtitle && <p className="ta-topbar__sub">{head.subtitle}</p>}
      </div>

      <NotificationBell variant="ta" />
      <ProfileMenu links={[{ label: 'Profile & settings', icon: 'Settings', to: '/ta/settings' }]} />
    </header>
  );
}
