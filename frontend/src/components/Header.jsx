import { Link } from 'react-router-dom';
import SearchBar from './SearchBar';

export default function Header({ showSearch = true, searchQuery = '' }) {
  return (
    <>
      {/* Official banner */}
      <div className="bg-black py-3 px-6 border-b border-white/20">
        <div className="flex items-center justify-between">
          <Link to="/" className="text-xl text-white" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            Freedom
          </Link>
          <div className="flex items-center gap-3">
            <img src="/usflag.svg" alt="U.S. Flag" className="w-6 h-auto" />
            <span className="text-sm text-white hidden sm:inline">An official website of the United States government</span>
          </div>
        </div>
      </div>

      {showSearch && (
        <header className="sticky top-0 z-50 bg-black">
          <div className="px-6 py-6 flex items-center justify-center">
            <SearchBar initialQuery={searchQuery} />
          </div>
        </header>
      )}
    </>
  );
}
