import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import SearchBar from '../components/SearchBar';
import VideoCard from '../components/VideoCard';
import Footer from '../components/Footer';
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
    <div className="min-h-screen bg-black">
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

      {/* Hero section with search */}
      <div className="flex flex-col items-center justify-center px-6 py-32">
        <h1 className="text-5xl sm:text-6xl lg:text-7xl text-white text-center leading-tight mb-6" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
          Uncensored Video Streaming
        </h1>
        <p className="text-lg sm:text-xl text-freedom-muted text-center max-w-2xl mb-12">
          No government should decide what you watch
        </p>
        <SearchBar autoFocus />
      </div>

      {/* Trending section */}
      <div className="px-6 pb-16">
        <h2 className="text-xs font-medium text-freedom-muted uppercase tracking-widest mb-6">
          Trending
        </h2>

        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i}>
                <div className="aspect-video bg-freedom-surface border border-freedom-border" />
                <div className="mt-3 h-4 bg-freedom-surface rounded w-3/4" />
                <div className="mt-2 h-3 bg-freedom-surface rounded w-1/2" />
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="text-sm text-freedom-muted">{error}</p>
        )}

        {!loading && !error && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {trending.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
