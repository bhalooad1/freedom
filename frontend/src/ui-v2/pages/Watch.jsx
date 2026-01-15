import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import VideoPlayer from '../components/VideoPlayer';
import VideoCard from '../components/VideoCard';
import Footer from '../components/Footer';
import { getVideo } from '../../api';

function formatDate(dateString) {
  if (!dateString) return '';

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;

  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  if (diffDays === 1) return '1 day ago';
  if (diffDays === 2) return '2 days ago';
  if (diffDays === 3) return '3 days ago';

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
}

function formatViews(views) {
  if (!views) return '';
  const str = String(views).replace(/[^0-9]/g, '');
  const num = parseInt(str, 10);
  if (isNaN(num)) return views;
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M views`;
  if (num >= 1000) return `${(num / 1000).toFixed(0)}K views`;
  return `${num} views`;
}

export default function Watch() {
  const [searchParams] = useSearchParams();
  const videoId = searchParams.get('v');
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showFullDescription, setShowFullDescription] = useState(false);

  useEffect(() => {
    if (!videoId) {
      setLoading(false);
      return;
    }

    const fetchVideo = async (retries = 2) => {
      setLoading(true);
      setError(null);

      try {
        const data = await getVideo(videoId);
        setVideo(data);
      } catch (err) {
        if (retries > 0) {
          setTimeout(() => fetchVideo(retries - 1), 1000);
          return;
        }
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchVideo();
  }, [videoId]);

  if (!videoId) {
    return (
      <Layout showSearch={true}>
        <div className="flex items-center justify-center py-16">
          <p className="text-freedom-muted">No video specified</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout showSearch={true}>
      <div className="px-4 lg:px-6 py-6">
        <div className="flex gap-6 flex-col xl:flex-row max-w-[1800px]">
          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Video Player */}
            <div className="rounded-xl overflow-hidden">
              <VideoPlayer videoId={videoId} />
            </div>

            {/* Loading state */}
            {loading && (
              <div className="mt-4 animate-pulse">
                <div className="h-7 bg-freedom-surface rounded w-3/4" />
                <div className="mt-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-freedom-surface" />
                  <div className="h-5 bg-freedom-surface rounded w-32" />
                </div>
              </div>
            )}

            {/* Error state */}
            {error && (
              <div className="mt-4 p-4 bg-freedom-surface rounded-xl">
                <p className="text-freedom-muted">{error}</p>
              </div>
            )}

            {/* Video info */}
            {!loading && !error && video && (
              <div className="mt-4">
                {/* Title */}
                <h1 className="text-xl font-semibold leading-tight text-white">
                  {video.title}
                </h1>

                {/* Channel & Stats */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-freedom-surface flex items-center justify-center">
                      <span className="text-lg font-medium text-white">
                        {video.channel?.charAt(0)?.toUpperCase() || '?'}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-white">{video.channel}</p>
                    </div>
                  </div>

                  {/* Stats buttons */}
                  <div className="flex items-center gap-2">
                    {video.likes && (
                      <div className="flex items-center gap-2 px-4 py-2 bg-freedom-surface rounded-full">
                        <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" />
                        </svg>
                        <span className="font-medium text-white">{video.likes}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 px-4 py-2 bg-freedom-surface rounded-full">
                      <svg className="w-5 h-5 text-freedom-muted" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                      </svg>
                      <span className="font-medium text-white">{formatViews(video.views)}</span>
                    </div>
                  </div>
                </div>

                {/* Description box */}
                <div className="mt-4 p-4 bg-freedom-surface rounded-xl">
                  <div className="flex items-center gap-2 text-sm font-medium text-white mb-2">
                    <span>{formatViews(video.views)}</span>
                    {video.uploaded && (
                      <>
                        <span className="text-freedom-muted">•</span>
                        <span>{formatDate(video.uploaded)}</span>
                      </>
                    )}
                  </div>
                  {video.description && (
                    <>
                      <p className={`text-sm text-gray-300 whitespace-pre-line ${!showFullDescription ? 'line-clamp-3' : ''}`}>
                        {video.description}
                      </p>
                      {video.description.length > 200 && (
                        <button
                          onClick={() => setShowFullDescription(!showFullDescription)}
                          className="mt-2 text-sm font-medium text-white hover:text-freedom-muted transition-colors"
                        >
                          {showFullDescription ? 'Show less' : 'Show more'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Related videos sidebar */}
          <div className="w-full xl:w-[400px] flex-shrink-0">
            {loading && (
              <div className="space-y-3">
                {[...Array(10)].map((_, i) => (
                  <div key={i} className="flex gap-2 animate-pulse">
                    <div className="w-40 aspect-video bg-freedom-surface rounded-lg flex-shrink-0" />
                    <div className="flex-1">
                      <div className="h-4 bg-freedom-surface rounded w-full" />
                      <div className="mt-2 h-3 bg-freedom-surface rounded w-2/3" />
                      <div className="mt-1 h-3 bg-freedom-surface rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!loading && video?.related && video.related.length > 0 && (
              <div className="space-y-3">
                {video.related.map((v) => (
                  <VideoCard key={v.id} video={v} compact />
                ))}
              </div>
            )}
            {!loading && (!video?.related || video.related.length === 0) && (
              <p className="text-sm text-freedom-muted">No related videos</p>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </Layout>
  );
}
