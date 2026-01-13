import { useEffect, useRef, useState } from 'react';
import { getStreamUrl } from '../api';

export default function VideoPlayer({ videoId }) {
  const videoRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setError(null);
    setLoading(true);
  }, [videoId]);

  const handleCanPlay = () => {
    setLoading(false);
  };

  const handleError = (e) => {
    console.error('Video error:', e.target?.error);
    setLoading(false);
    setError('Failed to load video');
  };

  const handleWaiting = () => {
    setLoading(true);
  };

  const handlePlaying = () => {
    setLoading(false);
  };

  // Use the proxy URL directly
  const streamSrc = getStreamUrl(videoId);

  return (
    <div className="relative w-full bg-black aspect-video">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-white text-sm z-10">
          {error}
        </div>
      )}
      <video
        ref={videoRef}
        src={streamSrc}
        controls
        autoPlay
        playsInline
        className="w-full h-full"
        onCanPlay={handleCanPlay}
        onError={handleError}
        onWaiting={handleWaiting}
        onPlaying={handlePlaying}
      />
    </div>
  );
}
