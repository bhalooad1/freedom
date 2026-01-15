import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import Footer from '../components/Footer';
import { search, getThumbnailUrl, getProxyImageUrl } from '../../api';

export default function Results() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!query) {
      setLoading(false);
      return;
    }

    const fetchResults = async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await search(query);
        setResults(data.results || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [query]);

  return (
    <Layout showSearch={true} searchQuery={query}>
      <div className="max-w-4xl px-4 lg:px-6 py-6">
        {!query && (
          <p className="text-freedom-muted">Enter a search query</p>
        )}

        {loading && (
          <div className="space-y-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex gap-4 animate-pulse">
                <div className="w-72 aspect-video bg-freedom-surface rounded-xl flex-shrink-0" />
                <div className="flex-1 py-1">
                  <div className="h-5 bg-freedom-surface rounded w-full" />
                  <div className="mt-3 h-4 bg-freedom-surface rounded w-1/3" />
                  <div className="mt-2 h-4 bg-freedom-surface rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-freedom-muted mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-freedom-surface rounded-lg text-white hover:bg-freedom-border transition-colors"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && query && results.length === 0 && (
          <div className="text-center py-16">
            <p className="text-freedom-muted">No results found for "{query}"</p>
          </div>
        )}

        {!loading && !error && results.length > 0 && (
          <div className="space-y-4">
            {results.map((video) => (
              <ResultCard key={video.id} video={video} />
            ))}
          </div>
        )}
      </div>

      <Footer />
    </Layout>
  );
}

function ResultCard({ video }) {
  const thumbnailUrl = video.thumbnail?.startsWith('http')
    ? getProxyImageUrl(video.thumbnail)
    : getThumbnailUrl(video.id);

  return (
    <Link
      to={`/watch?v=${video.id}`}
      className="flex gap-4 group"
    >
      {/* Thumbnail */}
      <div className="relative w-72 flex-shrink-0">
        <div className="aspect-video bg-freedom-surface rounded-xl overflow-hidden">
          <img
            src={thumbnailUrl}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
            loading="lazy"
          />
        </div>
        {video.duration && (
          <span className="absolute bottom-2 right-2 px-1.5 py-0.5 text-xs bg-black/80 text-white font-medium rounded">
            {video.duration}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 py-1">
        <h3 className="text-lg font-medium leading-tight line-clamp-2 text-white">
          {video.title}
        </h3>
        <div className="mt-2 flex items-center gap-1 text-[13px] text-freedom-muted">
          <span>{video.views}</span>
          {video.uploaded && (
            <>
              <span>•</span>
              <span>{video.uploaded}</span>
            </>
          )}
        </div>
        <p className="mt-1 text-[13px] text-freedom-muted hover:text-white transition-colors">
          {video.channel}
        </p>
        {video.description && (
          <p className="mt-2 text-sm text-freedom-muted line-clamp-2">
            {video.description}
          </p>
        )}
      </div>
    </Link>
  );
}
