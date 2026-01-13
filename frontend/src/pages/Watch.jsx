import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Header from '../components/Header';
import VideoPlayer from '../components/VideoPlayer';
import VideoCard from '../components/VideoCard';
import { getVideo } from '../api';

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
        // Retry on failure (server might be warming up)
        if (retries > 0) {
          console.log('[Watch] Retrying video info...');
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
                {/* Title */}
                <h1 className="text-xl font-semibold leading-tight">
                  {video.title}
                </h1>

                {/* Channel & Stats */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                      <span className="text-lg font-medium text-gray-600">
                        {video.channel?.charAt(0) || '?'}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium">{video.channel}</p>
                    </div>
                  </div>

                  {/* Stats buttons */}
                  <div className="flex items-center gap-2">
                    {video.likes && (
                      <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-full">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
                        </svg>
                        <span className="font-medium">{video.likes}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-full">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      <span className="font-medium">{video.views} views</span>
                    </div>
                  </div>
                </div>

                {/* Description box */}
                {video.description && (
                  <div className="mt-4 p-4 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-3 text-sm font-medium text-gray-700 mb-2">
                      <span>{video.views} views</span>
                      {video.uploaded && (
                        <>
                          <span>•</span>
                          <span>{formatDate(video.uploaded)}</span>
                        </>
                      )}
                    </div>
                    <p className={`text-sm text-gray-700 whitespace-pre-line ${!showFullDescription ? 'line-clamp-3' : ''}`}>
                      {video.description}
                    </p>
                    {video.description.length > 200 && (
                      <button
                        onClick={() => setShowFullDescription(!showFullDescription)}
                        className="mt-2 text-sm font-medium text-gray-900 hover:underline"
                      >
                        {showFullDescription ? 'Show less' : 'Show more'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Related videos sidebar */}
          <div className="w-full lg:w-96 flex-shrink-0">
            <h2 className="text-base font-medium mb-4">
              Related videos
            </h2>
            {loading && (
              <div className="space-y-3">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="flex gap-2 animate-pulse">
                    <div className="w-40 aspect-video bg-gray-100 rounded flex-shrink-0" />
                    <div className="flex-1">
                      <div className="h-3 bg-gray-100 rounded w-full" />
                      <div className="mt-2 h-3 bg-gray-100 rounded w-2/3" />
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
              <p className="text-sm text-gray-400">No related videos</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
