import { Link, useLocation } from 'react-router-dom';

const navItems = [
  {
    path: '/',
    label: 'Home',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M12 3L4 9v12h5v-7h6v7h5V9l-8-6z" />
      </svg>
    ),
  },
  {
    path: '/?trending',
    label: 'Trending',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z" />
      </svg>
    ),
  },
  {
    path: '/about',
    label: 'About',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
      </svg>
    ),
  },
];

export default function Sidebar({ expanded = true, onClose }) {
  const location = useLocation();
  const currentPath = location.pathname + location.search;

  const isActive = (item) => {
    // For home, only match exact "/" with no query params
    if (item.path === '/') {
      return currentPath === '/';
    }
    // For other paths, match the full path including query
    return currentPath === item.path;
  };

  const NavItem = ({ item }) => {
    const active = isActive(item);
    return (
      <Link
        to={item.path}
        onClick={onClose}
        className={`
          flex items-center gap-4 px-3 py-3 rounded-lg transition-colors relative
          ${active
            ? 'bg-freedom-surface text-freedom-red'
            : 'text-white hover:bg-freedom-surface/50'
          }
        `}
      >
        {active && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-freedom-red rounded-r" />
        )}
        <span>{item.icon}</span>
        {expanded && <span className="text-sm font-medium">{item.label}</span>}
      </Link>
    );
  };

  return (
    <aside
      className={`
        flex flex-col h-full bg-black border-r border-freedom-border
        transition-all duration-200 ease-in-out
        ${expanded ? 'w-56' : 'w-[72px]'}
      `}
    >
      {/* Main navigation */}
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map((item) => (
          <NavItem key={item.path} item={item} />
        ))}
      </nav>

      {/* Bottom - Official badge */}
      {expanded && (
        <div className="mt-auto pt-4 pb-6 px-3 border-t border-white/20">
          <span className="text-[11px] font-medium tracking-[0.2em] uppercase text-white/40">
            EST. 2026
          </span>
        </div>
      )}
    </aside>
  );
}
