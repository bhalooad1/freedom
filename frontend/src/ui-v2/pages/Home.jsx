import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import CategoryChips from '../components/CategoryChips';
import VideoCard from '../components/VideoCard';
import Footer from '../components/Footer';
import { getTrending } from '../../api';

export default function Home() {
  const [trending, setTrending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('all');

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
    <Layout showSearch={true}>
      <div className="px-4 lg:px-6">
        <CategoryChips
          selected={selectedCategory}
          onSelect={setSelectedCategory}
        />

        <div className="pb-8">
          {loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-video bg-freedom-surface rounded-xl" />
                  <div className="mt-3 flex gap-3">
                    <div className="w-9 h-9 rounded-full bg-freedom-surface flex-shrink-0" />
                    <div className="flex-1">
                      <div className="h-4 bg-freedom-surface rounded w-full" />
                      <div className="mt-2 h-3 bg-freedom-surface rounded w-2/3" />
                      <div className="mt-1 h-3 bg-freedom-surface rounded w-1/3" />
                    </div>
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

          {!loading && !error && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {trending.map((video) => (
                <VideoCard key={video.id} video={video} />
              ))}
            </div>
          )}
        </div>
      </div>

      <Footer />
    </Layout>
  );
}
