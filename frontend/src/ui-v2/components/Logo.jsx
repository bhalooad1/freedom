import { Link } from 'react-router-dom';

export default function Logo({ collapsed = false }) {
  return (
    <Link to="/" className="flex items-center group">
      {/* Wordmark */}
      {!collapsed && (
        <span className="text-[1.375rem] font-bold tracking-tight text-white group-hover:text-freedom-red transition-colors">
          FREEDOM
        </span>
      )}
    </Link>
  );
}
