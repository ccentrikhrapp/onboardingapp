import Icon from '../common/Icon.jsx';
import NotificationBell from './NotificationBell.jsx';
import ProfileMenu from './ProfileMenu.jsx';

/* Single header band: page title (from <HRHeader>) on the left, tools on the right. */
export default function HRTopbar({ head, onMenu }) {
  return (
    <header className="hr-topbar">
      <button className="hr-iconbtn hr-menubtn" onClick={onMenu} aria-label="Open navigation">
        <Icon name="Menu" size={18} />
      </button>

      <div className="hr-topbar__head">
        {head?.backTo && (
          <button className="hr-topbar__back" onClick={head.onBack}>
            <Icon name="ArrowLeft" size={13} /> {head.backLabel || 'Back'}
          </button>
        )}
        {head?.title && <h1 className="hr-topbar__title">{head.title}</h1>}
        {head?.subtitle && <p className="hr-topbar__sub">{head.subtitle}</p>}
      </div>

      <NotificationBell />
      <ProfileMenu links={[{ label: 'Profile & settings', icon: 'Settings', to: '/hr/settings' }]} />
    </header>
  );
}
