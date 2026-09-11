import { useEffect, useState } from 'react';
import Icon from '../common/Icon.jsx';
import { timeAgo } from '../../utils/format.js';
import { listNotifications, markAllRead, subscribeNotifications } from '../../api/notifications.js';

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);

  useEffect(() => {
    let active = true;
    const load = () => listNotifications().then((rows) => active && setItems(rows || [])).catch(() => {});
    load();
    const unsub = subscribeNotifications(load);
    return () => { active = false; unsub(); };
  }, []);

  const unread = items.filter((n) => n.status !== 'read').length;

  const openAndRead = () => {
    setOpen((o) => !o);
    if (!open && unread) {
      markAllRead().then(() => setItems((rs) => rs.map((n) => ({ ...n, status: 'read' }))));
    }
  };

  return (
    <div className="pos-rel">
      <button className="hr-iconbtn" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} onClick={openAndRead} onBlur={() => setTimeout(() => setOpen(false), 150)}>
        <Icon name="Bell" size={18} />
        {unread > 0 && <span className="hr-iconbtn__dot">{unread}</span>}
      </button>
      {open && (
        <div className="dropdown-panel">
          <div className="dropdown-panel__header">Notifications</div>
          {items.length === 0 && <div className="notif-item text-secondary">You're all caught up.</div>}
          {items.slice(0, 12).map((n) => (
            <div key={n.id} className={`notif-item${n.status === 'read' ? '' : ' notif-item--unread'}`}>
              <div className="strong text-small">{n.title}</div>
              <div className="text-xs text-secondary">{n.message}</div>
              <div className="text-xs text-secondary mt-2">{timeAgo(n.created_at)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
