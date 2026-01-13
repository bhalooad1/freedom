import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import SearchBar from '../components/SearchBar';
import VideoCard from '../components/VideoCard';
import { getTrending } from '../api';

export default function Home() {
  const [trending, setTrending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchTrending = async () => {
      try {
        const data = await getTrending();
        setTrending(data.videos || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchTrending();
  }, []);

  return (
    <div className="min-h-screen">
      {/* Hero section with search */}
      <div className="flex flex-col items-center justify-center px-6 py-32">
        <Link to="/" className="text-4xl font-semibold tracking-tight mb-12">
          Freedom
        </Link>
        <SearchBar autoFocus />
      </div>

      {/* Trending section */}
      <div className="max-w-7xl mx-auto px-6 pb-16">
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-6">
          Trending
        </h2>

        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-video bg-gray-100" />
                <div className="mt-3 h-4 bg-gray-100 rounded w-3/4" />
                <div className="mt-2 h-3 bg-gray-100 rounded w-1/2" />
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="text-sm text-gray-400">{error}</p>
        )}

        {!loading && !error && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {trending.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
