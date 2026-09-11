import { useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import HRSidebar from '../components/navigation/HRSidebar.jsx';
import HRTopbar from '../components/navigation/HRTopbar.jsx';

const COLLAPSE_KEY = 'ccentrik.hr.sidebar.collapsed';

function readCollapsed() {
  try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
}

export default function HRLayout() {
  const [open, setOpen] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [head, setHead] = useState(null);
  const { pathname } = useLocation();

  const ctx = useMemo(() => ({ setHead }), []);

  const toggleCollapse = () => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };

  return (
    <div className={`hr-shell${collapsed ? ' hr-shell--collapsed' : ''}`}>
      <HRSidebar open={open} collapsed={collapsed} onToggleCollapse={toggleCollapse} onNavigate={() => setOpen(false)} />
      {open && <div className="overlay" onClick={() => setOpen(false)} />}

      <div className="hr-main">
        <HRTopbar head={head} onMenu={() => setOpen(true)} />
        <div className="hr-page" key={pathname}>
          <Outlet context={ctx} />
        </div>
      </div>
    </div>
  );
}
