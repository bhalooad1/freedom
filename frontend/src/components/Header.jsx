import { Link } from 'react-router-dom';
import SearchBar from './SearchBar';

export default function Header({ showSearch = true, searchQuery = '' }) {
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center gap-8">
        <Link to="/" className="text-lg font-semibold tracking-tight flex-shrink-0">
          Freedom
        </Link>
        {showSearch && (
          <div className="flex-1 flex justify-center">
            <SearchBar initialQuery={searchQuery} />
          </div>
        )}
        <div className="w-20 flex-shrink-0" />
      </div>
    </header>
  );
}
