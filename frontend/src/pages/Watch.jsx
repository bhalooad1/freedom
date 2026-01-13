import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Header from '../components/Header';
import VideoPlayer from '../components/VideoPlayer';
import VideoCard from '../components/VideoCard';
import { getVideo } from '../api';

export default function Watch() {
  const [searchParams] = useSearchParams();
  const videoId = searchParams.get('v');
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!videoId) {
      setLoading(false);
      return;
    }

    const fetchVideo = async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await getVideo(videoId);
        setVideo(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchVideo();
  }, [videoId]);

  if (!videoId) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="max-w-7xl mx-auto px-6 py-8">
          <p className="text-sm text-gray-400">No video specified</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <main className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex gap-6 flex-col lg:flex-row">
          {/* Main content */}
          <div className="flex-1 min-w-0">
            <VideoPlayer videoId={videoId} />

            {loading && (
              <div className="mt-4 animate-pulse">
                <div className="h-6 bg-gray-100 rounded w-3/4" />
                <div className="mt-3 h-4 bg-gray-100 rounded w-1/4" />
              </div>
            )}

            {error && (
              <p className="mt-4 text-sm text-gray-400">{error}</p>
            )}

            {!loading && !error && video && (
              <div className="mt-4">
                <h1 className="text-xl font-medium leading-tight">
                  {video.title}
                </h1>
                <div className="mt-3 flex items-center gap-4 text-sm text-gray-500">
                  <span className="font-medium text-black">{video.channel}</span>
                  <span>{video.views} views</span>
                  {video.likes && <span>{video.likes} likes</span>}
                </div>
                {video.description && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-sm text-gray-600 whitespace-pre-line line-clamp-3">
                      {video.description}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Related videos sidebar */}
          <div className="w-full lg:w-80 flex-shrink-0">
            <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-4">
              Related
            </h2>
            {loading && (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex gap-2 animate-pulse">
                    <div className="w-40 aspect-video bg-gray-100 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="h-3 bg-gray-100 rounded w-full" />
                      <div className="mt-1 h-3 bg-gray-100 rounded w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!loading && video?.related && (
              <div className="space-y-4">
                {video.related.map((v) => (
                  <VideoCard key={v.id} video={v} compact />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
