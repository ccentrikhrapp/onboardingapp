import Icon from '../common/Icon.jsx';
import NotificationBell from './NotificationBell.jsx';
import ProfileMenu from './ProfileMenu.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { ROLE_META } from '../../constants/roles.js';

/* Single header band: page title (from <TAHeader>) on the left, tools on the right. */
export default function TATopbar({ head, onMenu }) {
  const { profile, role, signOut } = useApp();
  const name = profile?.full_name || profile?.email || 'Account';
  const roleLabel = ROLE_META[role]?.label || 'Talent Acquisition';

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
      <ProfileMenu
        name={name}
        roleLabel={roleLabel}
        links={[{ label: 'Profile & settings', icon: 'Settings', to: '/ta/settings' }]}
        onSignOut={signOut}
        afterSignOut="/ta/login"
      />
    </header>
  );
}
