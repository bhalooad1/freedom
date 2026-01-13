import { useEffect, useRef, useState } from 'react';
import { getStreamUrl } from '../api';

export default function VideoPlayer({ videoId }) {
  const videoRef = useRef(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const retryCountRef = useRef(0);

  useEffect(() => {
    if (!videoRef.current || !videoId) return;

    setError(null);
    setLoading(true);
    retryCountRef.current = 0;

    const video = videoRef.current;
    video.src = getStreamUrl(videoId);

    const onCanPlay = () => setLoading(false);
    const onError = () => {
      // Retry once on initial load failure
      if (retryCountRef.current < 1) {
        retryCountRef.current++;
        console.log('[VideoPlayer] Retrying...');
        setTimeout(() => {
          video.src = getStreamUrl(videoId) + '?retry=' + Date.now();
        }, 1000);
      } else {
        setLoading(false);
        setError('Failed to load video');
      }
    };
    const onWaiting = () => setLoading(true);
    const onPlaying = () => setLoading(false);

    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('error', onError);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);

    return () => {
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('error', onError);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
    };
  }, [videoId]);

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
        controls
        autoPlay
        playsInline
        className="w-full h-full"
      />
    </div>
  );
}
