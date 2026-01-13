import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Header from '../components/Header';
import VideoCard from '../components/VideoCard';
import { search, getThumbnailUrl, getProxyImageUrl } from '../api';

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
    <div className="min-h-screen">
      <Header searchQuery={query} />

      <main className="max-w-4xl mx-auto px-6 py-8">
        {!query && (
          <p className="text-sm text-gray-400">Enter a search query</p>
        )}

        {loading && (
          <div className="space-y-6">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-4 animate-pulse">
                <div className="w-64 aspect-video bg-gray-100 flex-shrink-0" />
                <div className="flex-1">
                  <div className="h-4 bg-gray-100 rounded w-3/4" />
                  <div className="mt-2 h-3 bg-gray-100 rounded w-1/2" />
                  <div className="mt-2 h-3 bg-gray-100 rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="text-sm text-gray-400">{error}</p>
        )}

        {!loading && !error && query && results.length === 0 && (
          <p className="text-sm text-gray-400">No results found</p>
        )}

        {!loading && !error && results.length > 0 && (
          <div className="space-y-6">
            {results.map((video) => (
              <ResultCard key={video.id} video={video} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function ResultCard({ video }) {
  const thumbnailUrl = video.thumbnail?.startsWith('http')
    ? getProxyImageUrl(video.thumbnail)
    : getThumbnailUrl(video.id);

  return (
    <a
      href={`/watch?v=${video.id}`}
      className="flex gap-4 group"
    >
      <div className="relative w-64 flex-shrink-0">
        <div className="aspect-video bg-gray-100">
          <img
            src={thumbnailUrl}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
        {video.duration && (
          <span className="absolute bottom-1 right-1 px-1 text-xs bg-black text-white">
            {video.duration}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0 py-1">
        <h3 className="text-base font-medium leading-tight line-clamp-2 group-hover:underline">
          {video.title}
        </h3>
        <div className="mt-2 flex items-center gap-1 text-xs text-gray-400">
          <span>{video.views}</span>
          {video.uploaded && (
            <>
              <span>·</span>
              <span>{video.uploaded}</span>
            </>
          )}
        </div>
        <p className="mt-1 text-sm text-gray-500">{video.channel}</p>
      </div>
    </a>
  );
}
