import Logo from './Logo';
import SearchBar from './SearchBar';

export default function Header({
  onMenuClick,
  showSearch = true,
  searchQuery = '',
}) {
  return (
    <header className="sticky top-0 z-50 bg-black border-b border-freedom-border">
      <div className="flex items-center justify-between h-14 px-4">
        {/* Left: Menu + Logo */}
        <div className="flex items-center gap-4">
          <button
            onClick={onMenuClick}
            className="p-2 rounded-full hover:bg-freedom-surface transition-colors text-white"
            aria-label="Toggle menu"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
              <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
            </svg>
          </button>
          <Logo collapsed={false} />
        </div>

        {/* Center: Search */}
        {showSearch && (
          <div className="hidden sm:block flex-1 max-w-2xl mx-4">
            <SearchBar initialQuery={searchQuery} />
          </div>
        )}

        {/* Right: Flag */}
        <div className="flex items-center gap-4">
          {/* Mobile search button */}
          {showSearch && (
            <button className="sm:hidden p-2 rounded-full hover:bg-freedom-surface transition-colors text-white">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
              </svg>
            </button>
          )}

          <img
            src="/usflag.svg"
            alt="U.S. Flag"
            className="w-8 h-auto"
          />
        </div>
      </div>
    </header>
  );
}
